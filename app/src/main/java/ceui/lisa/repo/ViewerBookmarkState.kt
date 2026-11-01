package ceui.lisa.repo

import ceui.lisa.model.ListIllust
import ceui.lisa.model.ListNovel
import ceui.lisa.models.ObjectSpec
import ceui.loxia.Novel
import ceui.pixiv.api.model.Illust
import ceui.pixiv.cache.ObjectPool
import ceui.pixiv.cache.withoutViewerState

/**
 * 搜索页出仓前的收藏态修正（#1063）。
 *
 * 会员专属排序这条链路（含一级缓存命中）返回的 `is_bookmarked` 不代表当前用户；原样交给 UI
 * 就会出现「明明收藏了，搜索结果里却是灰心」（进详情页拉 detail 又是红心）。
 *
 * Pixiv 没有按 id 批量查收藏态的接口，逐条打 detail 又太贵，所以这里只做确定正确的事：
 *  1. 进程内 [ObjectPool] 已经确认过、且标记为「当前用户视角」的（详情页、自己的收藏页 /
 *     feed 合过池的）沿用；被标成不可信的不算（见 [ObjectPool] 的「viewer 态可信度」）；
 *  2. 其余一律置 null（「不知道」）。UI 把 null 渲染成未收藏；合池时 null 属于空值，
 *     不会盖掉池里已有的真值（见 ObjectPool.mergeKeepingExisting），也就不会再把错误值灌进池里。
 *
 * `lean` 删掉了本地收藏镜像（CLEANUP_MANIFEST.md §3.3），所以这里只剩「池里可信值」一条来源：
 * 「镜像里没有」本来就不能当成未收藏，少这一条只会让更多条目落回 null，不会把红心翻成灰心。
 *
 * 回退到普通直发的页（popular-preview / 普通搜索）本来就是当前用户视角，**不要**经这里。
 */
internal object ViewerBookmarkState {

    fun ListIllust.withViewerBookmarkState(): ListIllust {
        val source = illusts ?: return this
        // 收藏态只按「池里可信值」重算，关注态一律清成未知 —— 借号账号关注没关注这个作者，
        // 跟当前用户没有关系。出仓的 bean 不带别人的状态，合池时 null 不会盖掉池里的值。
        return ListIllust().also { out ->
            out.setNext_url(nextUrl)
            out.illusts = source.map { bean ->
                bean.copy(
                    is_bookmarked = knownIllustBookmark(bean.id),
                    user = bean.user?.withoutViewerState(),
                )
            }
        }
    }

    fun ListNovel.withViewerBookmarkState(): ListNovel {
        val source = novels ?: return this
        return ListNovel().also { out ->
            out.setNext_url(nextUrl)
            out.ranking_novels = ranking_novels
            out.novels = source.map { novel ->
                novel.copy(
                    is_bookmarked = knownNovelBookmark(novel.id),
                    user = novel.user?.withoutViewerState(),
                )
            }
        }
    }

    fun ListIllust.withViewerBookmarkState(known: (Long) -> Boolean?): ListIllust {
        val source = illusts ?: return this
        return ListIllust().also { out ->
            out.setNext_url(nextUrl)
            out.illusts = source.map { it.copy(is_bookmarked = known(it.id)) }
        }
    }

    fun ListNovel.withViewerBookmarkState(known: (Long) -> Boolean?): ListNovel {
        val source = novels ?: return this
        return ListNovel().also { out ->
            out.setNext_url(nextUrl)
            out.ranking_novels = ranking_novels
            out.novels = source.map { it.copy(is_bookmarked = known(it.id)) }
        }
    }

    /**
     * 池里那条得先被确认是「当前用户视角」，否则自建源 / 借号 / 历史快照写进去的脏值会被当成
     * 权威值继续传播（见 [ObjectPool] 的「viewer 态可信度」）。
     */
    private fun knownIllustBookmark(id: Long): Boolean? =
        if (!ObjectPool.isIllustViewerStateTrusted(id)) null
        else ObjectPool.get<Illust>(id).value?.is_bookmarked

    private fun knownNovelBookmark(id: Long): Boolean? =
        if (!ObjectPool.isViewerStateTrusted(id, ObjectSpec.KNovel)) null
        else ObjectPool.get<Novel>(id).value?.is_bookmarked
}
