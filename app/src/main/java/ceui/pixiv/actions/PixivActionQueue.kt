package ceui.pixiv.actions

import android.content.Context
import ceui.lisa.R
import ceui.pixiv.api.model.Illust
import ceui.loxia.Novel
import ceui.lisa.utils.Common
import ceui.pixiv.api.Client
import ceui.pixiv.cache.ObjectPool
import ceui.loxia.User
import ceui.pixiv.actionqueue.ActionEvent
import ceui.pixiv.actionqueue.ActionQueue
import ceui.pixiv.actionqueue.ActionRequest
import ceui.pixiv.actionqueue.PendingAction
import ceui.pixiv.actionqueue.QueuePolicy
import ceui.pixiv.session.SessionManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.util.concurrent.atomic.AtomicBoolean
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import ceui.pixiv.db.discovery.ProfileManager
import ceui.pixiv.utils.NetworkStateManager

/**
 * 收藏 / 关注这类写操作的进程级队列宿主。
 *
 * 队列本体 [ActionQueue] 是可注入的普通对象（为了能单测）；这里负责它在 app 里的
 * 装配、启动时机和失败反馈，是唯一持有实例的地方。UI 不直接碰它，走 [PixivActions]。
 *
 * 一个进程只有一份，由 Hilt 以 @Singleton 构造并经
 * [ceui.pixiv.services.ServicesProvider.pixivActionQueue] 暴露；构造廉价（不建队列、不起协程），
 * 真正的装配在 [start]。
 *
 * 小说的逐篇下载也由这里托管，但进**另一条**队列（独立库，见 [downloadQueue]）：两者共用
 * 同一套登录 / 联网闸门与按账号分账，而下载一批就是几百条，排进收藏那条队列的话，
 * 期间点的收藏要在它们后面等上好几分钟才真正发出去。
 */
@Singleton
class PixivActionQueue @Inject constructor(
    @ApplicationContext app: Context,
    private val profileManager: ProfileManager,
    private val networkStateManager: NetworkStateManager,
) {

    private val app: Context = app.applicationContext

    private val started = AtomicBoolean(false)

    /**
     * 反馈协程的 scope。
     *
     * 必须自带 [CoroutineExceptionHandler]：这里跑的是回滚和 toast，任何一次
     * gson 解析或 ObjectPool 写入抛异常，都会顺着没有 handler 的 SupervisorJob
     * 冒到默认处理器上崩掉整个进程。
     */
    private val feedbackScope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default +
            CoroutineExceptionHandler { _, t -> Timber.tag(TAG).e(t, "feedback scope crashed") }
    )

    @Volatile
    private var queue: ActionQueue? = null

    /**
     * 小说下载队列。挂在进程级 scope 上而不是页面上：批量下载点完就退页，下载照跑；
     * 进程被杀后下次启动接着下没下完的。
     */
    @Volatile
    private var downloadQueue: ActionQueue? = null

    /** 幂等。由 [ceui.lisa.activities.Shaft] 调，必须排在 SessionManager.initialize 之后（gate 要读登录态）。 */
    fun start() {
        if (!started.compareAndSet(false, true)) return
        // 进程级共用那一个 NetworkStateManager（@Singleton，Hilt 注入）：进程内只注册一个
        // 系统 NetworkCallback，各自 new 一个等于各注册一个回调。
        val isOnline = { networkStateManager.networkState.value?.isOnline == true }

        val gate: suspend () -> Boolean = {
            SessionManager.isLoggedIn && networkStateManager.networkState.value?.isOnline == true
        }
        val owner: suspend () -> String = { SessionManager.loggedInUid.toString() }

        val instance = ActionQueue.withRoomStore(
            context = app,
            handlers = mapOf(
                PixivActionTypes.ILLUST_BOOKMARK to IllustBookmarkHandler(isOnline),
                PixivActionTypes.NOVEL_BOOKMARK to NovelBookmarkHandler(isOnline),
                PixivActionTypes.USER_FOLLOW to UserFollowHandler(isOnline),
                // Compatibility handler only drains owner-scoped rows written by old builds.
                PixivActionTypes.USER_ONLINE to UserOnlineHandler(),
            ),
            policy = QueuePolicy(minGapMs = MIN_GAP_MS),
            // 未登录时只睡不发。否则退登状态下一整队请求会全部 401，
            // 白白烧完重试次数把用户真实的收藏意图变成终态失败。
            //
            // 没网时同样只睡不发：请求发出去也只会 IOException，而按默认参数 5 次重试
            // 加起来只撑得住 7.5 分钟 —— 坐一趟地铁回来，用户排队的收藏已经被烧成终态
            // 失败并回滚了，而「离线也不丢」正是这个队列存在的理由。真在飞行途中掉线的
            // 那一条由 handler 判成「不计入尝试次数」兜底（见 toActionOutcome）。
            gate = gate,
            // 行按登录用户分账。库是跨登录态持久的：A 排队没发完的收藏，如果不认归属，
            // 会在 B 登录之后用 B 的 token 发出去，收藏进 B 的账号。
            owner = owner,
            onError = { message, t -> Timber.tag(TAG).e(t, message) },
        )
        queue = instance
        observeFailures(instance)
        instance.start()

        val downloads = ActionQueue.withRoomStore(
            context = app,
            handlers = mapOf(
                PixivActionTypes.NOVEL_DOWNLOAD to NovelDownloadHandler(isOnline),
                PixivActionTypes.NOVEL_SERIES_DOWNLOAD to NovelSeriesDownloadHandler(isOnline) {
                    checkNotNull(downloadQueue).enqueueAndWait(it)
                },
            ),
            databaseName = DOWNLOAD_DATABASE_NAME,
            policy = QueuePolicy(minGapMs = DOWNLOAD_MIN_GAP_MS),
            gate = gate,
            owner = owner,
            onError = { message, t -> Timber.tag(TAG).e(t, message) },
        )
        downloadQueue = downloads
        observeDownloads(downloads)
        downloads.start()

        observeGateSignals(listOf(instance, downloads))
        pruneStaleFailures(instance)
        pruneStaleFailures(downloads)
        Timber.tag(TAG).i("action queue started, minGap=%dms", MIN_GAP_MS)
    }

    /**
     * [count] 条动作全部发完大概几分钟。节奏是本对象定的（[MIN_GAP_MS] 串行间隔），
     * 所以估算也留在这里，别让调用方去猜一个常量。
     *
     * 向上取整且至少 1，免得批量确认框上写着「约 0 分钟」。冷却和重试不算在内 ——
     * 这是下界，撞了限流只会更久。
     */
    internal fun estimatedMinutes(count: Int): Int {
        val totalMs = count.toLong() * MIN_GAP_MS
        return maxOf(1L, (totalMs + MS_PER_MINUTE - 1) / MS_PER_MINUTE).toInt()
    }

    internal fun enqueue(request: ActionRequest) {
        val instance = queue
        if (instance == null) {
            // 只可能发生在 start 之前就有人点了收藏，正常启动顺序下不会走到。
            Timber.tag(TAG).w("enqueue before start, dropped: %s", request.dedupeKey)
            return
        }
        instance.enqueue(request)
    }

    internal fun enqueueDownload(request: ActionRequest) {
        val instance = downloadQueue
        if (instance == null) {
            Timber.tag(TAG).w("download enqueue before start, dropped: %s", request.dedupeKey)
            return
        }
        instance.enqueue(request)
    }

    /**
     * 闸门条件恢复时立刻踢一脚队列。
     *
     * 不踢的话只能等兜底轮询（[QueuePolicy.idlePollMs]，60 秒）：网络刚回来 / 刚登录完，
     * 用户看着一排红心却要再等一分钟才真的发出去，而这恰恰是最可能被系统回收进程的时刻。
     *
     * 用 [ActionQueue.kick] 而不是 `resume()`：后者还会清掉暂停标志，等于让一次网络抖动
     * 顺手解除用户主动按下的暂停。这里要的只是「重新看一眼队列」。
     */
    private fun observeGateSignals(instances: List<ActionQueue>) {
        // 网络回来立刻踢一次队列：网络抖动期间排下的收藏不该等到 60 秒兜底轮询才发出去。
        feedbackScope.launch {
            withContext(Dispatchers.Main) {
                networkStateManager.networkState.observeForever { state ->
                    if (state.isOnline) instances.forEach { it.kick() }
                }
            }
        }
        // 登录 / 换账号：owner 变了，队列要重新按新账号取行。
        feedbackScope.launch {
            withContext(Dispatchers.Main) {
                SessionManager.loggedInAccount.observeForever { instances.forEach { it.kick() } }
            }
        }
    }

    /**
     * 清掉上个进程留下的终态失败行。
     *
     * 它们的乐观状态活在内存里的 ObjectPool 中，随进程一起没了 —— 重启后界面上的收藏态
     * 本来就是服务端的真值，这些行既回滚不了也没人会去看，只会带着最长 500 字的错误文本
     * 一直堆在库里。live 的失败行由 [handleFailure] 处理完立刻删掉。
     */
    private fun pruneStaleFailures(instance: ActionQueue) {
        feedbackScope.launch {
            try {
                val removed = instance.clearFailed()
                if (removed > 0) Timber.tag(TAG).i("pruned %d stale failed actions", removed)
            } catch (ce: CancellationException) {
                throw ce
            } catch (t: Throwable) {
                Timber.tag(TAG).e(t, "prune stale failures failed")
            }
        }
    }

    /**
     * 订阅执行结果：成功时补埋点，终态失败时回滚乐观更新。
     *
     * 必须排在 [ActionQueue.start] **之前**，而且要 [CoroutineStart.UNDISPATCHED]：
     * [ActionQueue.events] 没有 replay，事件落在没有订阅者的空档里就是永久丢失 ——
     * 界面不回滚，行也不会被 forget 掉。普通 launch 只是「把协程排进 Default 派发队列」，
     * 调用返回时收集者往往还没注册上，先后顺序等于没保证；UNDISPATCHED 会就地把协程体跑到
     * 第一个挂起点，也就是 collect 真正把自己挂进 SharedFlow 之后才返回。
     *
     * 只有 [ActionEvent.Failed] 才回滚：[ActionEvent.Retrying] 之后还会再试，
     * 那时回滚会让界面上的爱心来回跳。
     *
     * 每条事件单独 try/catch —— 一条处理不了的事件（比如版本回退后读到的旧 payload）
     * 不能把整个订阅带走，否则这个进程剩下的时间里所有失败都不再回滚也不再提示。
     */
    private fun observeFailures(instance: ActionQueue) {
        feedbackScope.launch(start = CoroutineStart.UNDISPATCHED) {
            instance.events.collect { event ->
                try {
                    when (event) {
                        is ActionEvent.Succeeded -> withContext(Dispatchers.Main) { report(event) }
                        is ActionEvent.Failed -> {
                            Timber.tag(TAG).w(
                                "action failed: type=%s reason=%s superseded=%b",
                                event.action.type, event.reason, event.supersededByPending,
                            )
                            try {
                                withContext(Dispatchers.Main) { handleFailure(event) }
                            } finally {
                                // 反馈做没做成，这一行都没有别的用处了 —— 必须在 finally 里删。
                                // 放在 handleFailure 之后的话，它一抛异常这行就以 FAILED 留在库里，
                                // 一直堆到下次进程启动才被 pruneStaleFailures 收走。
                                instance.forget(event.action.id)
                            }
                        }
                        else -> Unit
                    }
                } catch (ce: CancellationException) {
                    throw ce
                } catch (t: Throwable) {
                    Timber.tag(TAG).e(t, "handling queue event failed")
                }
            }
        }
    }

    /**
     * 下载队列的反馈（进度 / 结果 toast）。订阅时机与逐条兜底的理由同 [observeFailures]；
     * 失败行同样处理完就删 —— 下载没有可回滚的乐观状态，留着也没人看。
     */
    private fun observeDownloads(instance: ActionQueue) {
        val feedback = NovelDownloadFeedback(app)
        feedbackScope.launch(start = CoroutineStart.UNDISPATCHED) {
            instance.events.collect { event ->
                try {
                    try {
                        withContext(Dispatchers.Main) { feedback.onEvent(event) }
                    } finally {
                        if (event is ActionEvent.Failed) instance.forget(event.action.id)
                    }
                } catch (ce: CancellationException) {
                    throw ce
                } catch (t: Throwable) {
                    Timber.tag(TAG).e(t, "handling download event failed")
                }
            }
        }
    }

    /**
     * 服务端确认之后才更新发现画像。
     *
     * 不能在点击时就更新：那条动作还可能因为 429 打满重试、作品已删除等原因终态失败并被
     * 回滚，而画像决定后续推荐，喂进去的必须是真的发生过的行为。
     *
     * 原实现还要在这里发社区埋点、维护书签镜像、触发自动快照 —— 这些功能已在 `lean`
     * 分支整体删除（见 CLEANUP_MANIFEST.md §8「Never restore」），只保留画像更新。
     */
    private suspend fun report(event: ActionEvent.Succeeded) {
        val action = event.action
        when (action.type) {
            PixivActionTypes.ILLUST_BOOKMARK -> {
                val payload = action.parsePayload<BookmarkPayload>() ?: return unparsable(action)
                if (!payload.bookmark) return
                // 画像只吃 Illust（要读 tags 和作者）。池里没有就跳过：进程重启后补发的
                // 那条本来就没有 bean 可读，漏一次画像强化远好过为它多打一次网络。
                ObjectPool.get<Illust>(payload.id).value?.let(profileManager::onBookmarkIllust)
            }

            PixivActionTypes.NOVEL_BOOKMARK -> Unit

            PixivActionTypes.USER_FOLLOW -> {
                val payload = action.parsePayload<FollowPayload>() ?: return unparsable(action)
                // 只是换了可见性，不是新关注：不给画像加一次关注分。
                if (payload.visibilityOnly) return
                if (payload.follow) {
                    profileManager.onFollowUser(payload.userId)
                } else {
                    profileManager.onUnfollowUser(payload.userId)
                }
            }
        }
    }

    private fun handleFailure(event: ActionEvent.Failed) {
        if (event.supersededByPending) {
            // 用户在这条失败之前又点了一次，那条马上就要发出去。此时回滚等于用旧结果
            // 覆盖新意图，连提示都不该弹 —— 用户看到的状态就是他最后一次点的那个。
            Timber.tag(TAG).i("skip rollback, superseded: %s", event.action.dedupeKey)
            return
        }
        rollback(event)
    }

    /**
     * 回滚乐观更新。
     *
     * 写回用的是 [PixivActions] 里那两个「写本地状态」的函数本身，只是传相反的值 ——
     * 乐观更新要覆盖的表示（[Illust] 池条目、
     * 跨列表广播）一个都不能漏，而分成两套写法的必然结局是回滚这一侧漏掉其中一路，
     * 表现是「失败提示弹了但那颗心还红着」。
     */
    private fun rollback(event: ActionEvent.Failed) {
        val action = event.action
        when (action.type) {
            PixivActionTypes.ILLUST_BOOKMARK -> {
                val payload = action.parsePayload<BookmarkPayload>() ?: return unparsable(action)
                // 队列已经确认没有更新的意图压着（supersededByPending），这里再比一次当前值，
                // 挡的是队列之外改过状态的路径（例如详情页刚从服务端刷回了真值）。
                // 池里没有时按 null 处理照常回滚：列表条目持有的是自己的拷贝，
                // 它们只认广播，不回滚就一直红着。
                val current = currentIllustBookmarked(payload.id)
                if (current == null || current == payload.bookmark) {
                    PixivActions.writeIllustBookmarkLocally(payload.id, !payload.bookmark)
                }
                toast(R.string.v3_widget_bookmark_failed)
            }

            PixivActionTypes.NOVEL_BOOKMARK -> {
                val payload = action.parsePayload<BookmarkPayload>() ?: return unparsable(action)
                // 与插画那支同一套守卫与同一个写入函数（含 LIKED_NOVEL 广播，小说列表条目
                // 持有的是自己的拷贝、只认广播）。守卫不通过时连广播也不发 —— 那说明状态
                // 已经被队列之外的路径改过，再拨一次等于用旧结果覆盖服务端刚刷回的真值。
                val current = ObjectPool.get<Novel>(payload.id).value?.is_bookmarked
                if (current == null || current == payload.bookmark) {
                    PixivActions.writeNovelBookmarkLocally(payload.id, !payload.bookmark)
                }
                toast(R.string.v3_widget_bookmark_failed)
            }

            PixivActionTypes.USER_FOLLOW -> {
                val payload = action.parsePayload<FollowPayload>() ?: return unparsable(action)
                if (payload.visibilityOnly) {
                    // 关注本身没动过，只有可见性要退回「不知道」—— 回滚成取关就把人弄丢了。
                    FollowVisibility.clearLocal(payload.userId)
                    Common.showToast(app.getString(R.string.msg_operation_fail, event.reason))
                    return
                }
                val user = ObjectPool.get<User>(payload.userId).value
                // 与收藏那支同样的守卫：当前关注态已经不是我们乐观写进去的那个值时就别动它
                //（提示照弹 —— 用户仍然需要知道这次关注没成）。
                if (user == null || user.is_followed == payload.follow) {
                    // 这次操作作废，本地记的可见性一并退回「不知道」——原来是公开还是私密
                    // 从没随请求带出去过，留空让下次 user/follow/detail 重新填，好过猜一个。
                    FollowVisibility.clearLocal(payload.userId)
                    PixivActions.writeUserFollowLocally(payload.userId, !payload.follow)
                }
                Common.showToast(app.getString(R.string.msg_operation_fail, event.reason))
            }
        }
    }

    /** 这幅作品当前的收藏态；不在池里时返回 null。 */
    private fun currentIllustBookmarked(illustId: Long): Boolean? =
        ObjectPool.get<Illust>(illustId).value?.is_bookmarked

    /**
     * payload 解析不了时的统一出口 —— 只可能是版本回退后读到了新版写入的 json。
     *
     * 执行侧对同一份 payload 已经判过终态失败（见 [parsePayload]），反馈侧必须用同一个宽容的
     * 解析：裸 `fromJson` 会在处理这条失败时自己抛出去，那样既不回滚也不提示，乐观 UI 就永久
     * 停在错误状态了。回滚不了也没关系 —— 界面上的收藏态本来就会在下次从服务端刷新时被纠正。
     */
    private fun unparsable(action: PendingAction) {
        Timber.tag(TAG).e(
            "unparsable payload, skipping feedback: type=%s id=%d",
            action.type, action.id,
        )
    }

    private fun toast(resId: Int) {
        Common.showToast(app.getString(resId))
    }

    private companion object {
        const val TAG = "PixivActionQueue"

        /** pixiv 对收藏/关注的速率限制没有公开文档，2 秒是实测不触发 429 的保守值。 */
        const val MIN_GAP_MS = 2_000L

        /** 小说正文抓取的间隔，沿用原批量下载实测不触发 429 的 1.5 秒。 */
        const val DOWNLOAD_MIN_GAP_MS = 1_500L

        const val DOWNLOAD_DATABASE_NAME = "novel_download_queue.db"

        const val MS_PER_MINUTE = 60_000L
    }
}
