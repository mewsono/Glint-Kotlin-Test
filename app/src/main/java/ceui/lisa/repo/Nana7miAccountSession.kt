package ceui.lisa.repo

import ceui.lisa.BuildConfig
import ceui.pixiv.api.Client
import ceui.loxia.User
import ceui.pixiv.shaftapi.Nana7miPayload
import ceui.pixiv.shaftapi.Nana7miResult
import ceui.pixiv.shaftapi.fetchNana7mi
import ceui.pixiv.login.InvalidRefreshTokenException
import ceui.pixiv.login.PixivLogin
import ceui.pixiv.login.PixivOAuthUser
import ceui.pixiv.session.SessionManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException

/**
 * One borrowed Pixiv account for one search-repository instance.
 *
 * The account never enters [SessionManager]: it is used only through an explicit Authorization
 * header. Both illustration and novel search share this class so first-page, pagination, refresh,
 * and durable re-report behavior cannot drift apart.
 */
internal class Nana7miAccountSession() {

    @Volatile
    var payload: Nana7miPayload? = null
        private set

    /**
     * True once a borrowed account backed this session's pagination and then became unusable.
     *
     * [payload] alone cannot express this: it is also null when nothing was ever borrowed (plain
     * search, direct preview, or a first-page fallback), and in *those* cases the cursor belongs to
     * the logged-in account and may be continued normally. Only here does the cursor point at a
     * premium-only search that the logged-in account must never be used to continue.
     *
     * Reset comes for free: every [initApi] builds a fresh session.
     */
    @Volatile
    var borrowedAccountLost: Boolean = false
        private set

    /**
     * True when this session's first page came out of the pixshaft search cache: the cursor is a
     * premium-only one, but nothing has been borrowed yet. A page turn that misses the cache must
     * borrow *then* — and must never continue the cursor with the logged-in account.
     *
     * Lives on the session, not the repository, for the same reason [payload] does: a lookup that
     * completes late can only mark the session it belongs to, never the search that replaced it.
     */
    @Volatile
    var cursorFromCache: Boolean = false
        private set

    /** 已付费首屏的幂等 ID；缓存游标翻页未命中时用它换账号，不再开启第二次搜索。 */
    @Volatile
    var cachedFirstRequestId: String? = null
        private set

    /** true 表示该缓存首屏已按新协议计费，后续账号交接绝不能丢掉它的 ID。 */
    @Volatile
    var cachedFirstRequestIdRequired: Boolean = false
        private set

    fun markCursorFromCache(requestId: String?, requestIdProtocolEnabled: Boolean) {
        require(!requestIdProtocolEnabled || requestId != null) {
            "request-id protocol enabled without a paid first-page id"
        }
        cursorFromCache = true
        cachedFirstRequestId = requestId
        cachedFirstRequestIdRequired = requestIdProtocolEnabled
    }

    /**
     * Borrow for a cursor whose first page came out of the search cache. The paid first-page id is
     * offered first so the server hands over an account without charging a second search. The
     * server only honours that id for a bounded replay window (30 minutes) after the hit; past it
     * the dispatch answers 409 `request_id_conflict`. That means "this needs a fresh search charge",
     * not "no account", so retry once with a fresh id — otherwise a reader who lingers on a cached
     * first page would have pagination end silently on the first page turn that misses.
     */
    suspend fun fetchReadyForCachedCursor(): Nana7miResult {
        val paidRequestId = cachedFirstRequestId
        if (cachedFirstRequestIdRequired && paidRequestId == null) {
            throw BorrowedAccountUnavailableException(
                IllegalStateException("cached cursor lost its paid request id"),
            )
        }
        val first = fetchReady(paidRequestId)
        if (paidRequestId == null || !isPaidRequestIdRejected(first)) return first
        Timber.tag(LOG_TAG).w(
            "stage=fetch result=paid_request_id_rejected action=retry_fresh_search",
        )
        return fetchReady(Nana7miSearchCache.newRequestId())
    }

    /**
     * Fetch one account. The server classifies it at 55 minutes; an expired account is refreshed
     * on the client and re-reported before it is returned to the search request.
     */
    suspend fun fetchReady(requestId: String? = null): Nana7miResult {
        // Defense in depth: repository routing already disables borrowing in Lite, but keeping the
        // network boundary closed prevents a future caller from accidentally bypassing that gate.
        if (BuildConfig.IS_LITE) return Nana7miResult.DisabledForLite
        val requesterUid = SessionManager.loggedInUid
        Timber.tag(LOG_TAG).d(
            "stage=fetch event=request requester_uid=%d",
            requesterUid,
        )
        val fetched = if (requestId == null) {
            // Legacy servers cannot deduplicate quota consumption, so never replay their dispatch.
            Client.pixshaft.fetchNana7mi(requesterUid, null)
        } else {
            retryNana7miNetworkResult(
                stage = "dispatch",
                failureOf = { (it as? Nana7miResult.NetworkFailure)?.cause },
            ) {
                // The same id is mandatory: the first request may have reached the server even if
                // its response did not reach us. Server-side idempotency makes that replay free.
                Client.pixshaft.fetchNana7mi(requesterUid, requestId)
            }
        }
        logFetchResult(requesterUid, fetched)
        if (fetched is Nana7miResult.NotPremium) {
            // 服务端派发池只收 is_premium = 1，走到这里说明那一行的分类和 blob 对不上。把这份
            // AccountResponse 原样报回去，saveOnline 会按 blob 里的真实会员状态重新分类并停止派发。
            reportNotPremium(fetched, "fetch")
        }
        val ready = when {
            fetched !is Nana7miResult.Success -> fetched
            !fetched.value.expired -> {
                Timber.tag(LOG_TAG).d(
                    "stage=expiry action=use_current account_uid=%d",
                    fetched.value.uid,
                )
                fetched
            }

            else -> renew(fetched.value, "server_expired")
        }
        payload = (ready as? Nana7miResult.Success)?.value
        return ready
    }

    /**
     * Execute a first or next page with the borrowed account. If Pixiv reports OAuth expiration,
     * refresh the borrowed account and replay this page exactly once.
     *
     * [successDetails] is deliberately supplied by the caller because illustration and novel
     * response models expose different list fields.
     */
    suspend fun <T : Any> requestWithRefresh(
        initial: Nana7miPayload,
        stage: String,
        lease: Nana7miSearchLease,
        successDetails: (T) -> String,
        request: suspend (String) -> T,
    ): T {
        var activePayload = initial
        var refreshedForThisPage = false

        suspend fun execute(current: Nana7miPayload): T = retryNana7miNetworkCall(stage) {
            // Search first/next-page calls are GETs, so replaying one transient transport failure
            // cannot duplicate a mutation. The shared helper caps both attempts at 15 seconds.
            request("Bearer ${current.account.access_token}")
        }

        suspend fun renewAndExecute(reason: String): T {
            // Token rotation + NonCancellable persistence run inside the lease's guarded block:
            // cancellation must not release the serial permit before they have unwound.
            val renewed = lease.guarded { renew(activePayload, reason) }
            val current = (renewed as? Nana7miResult.Success)?.value
            if (current == null) {
                // The caller may fall back to an unauthenticated preview page. Do not leave
                // pagination attached to the borrowed account whose renewal just failed.
                payload = null
                borrowedAccountLost = true
                val cause = when (renewed) {
                    is Nana7miResult.InvalidResponse -> renewed.cause
                    // Losing premium mid-pagination is not a token failure, but it is just as
                    // terminal for this borrowed account. Report it as unavailable so a first
                    // page can still fall back to the preview endpoint.
                    is Nana7miResult.NotPremium ->
                        IllegalStateException("nana7mi account is no longer premium")
                    else -> null
                } ?: IllegalStateException("nana7mi refresh failed")
                throw BorrowedAccountUnavailableException(cause)
            }
            refreshedForThisPage = true
            activePayload = current
            payload = current
            return execute(current)
        }

        try {
            val response = try {
                if (initial.expiresAt <= System.currentTimeMillis()) {
                    Timber.tag(LOG_TAG).d(
                        "stage=%s event=local_55m_expired account_uid=%d action=refresh_before_request",
                        stage,
                        initial.uid,
                    )
                    renewAndExecute("client_55m_expired")
                } else {
                    execute(initial)
                }
            } catch (ce: CancellationException) {
                throw ce
            } catch (error: Throwable) {
                if (refreshedForThisPage || !isPixivOAuthExpired(error)) throw error
                Timber.tag(LOG_TAG).w(
                    "stage=%s result=oauth_expired account_uid=%d action=refresh_and_retry",
                    stage,
                    activePayload.uid,
                )
                renewAndExecute("pixiv_oauth_400")
            }
            Timber.tag(LOG_TAG).d(
                "stage=%s result=success account_uid=%d %s",
                stage,
                payload?.uid ?: initial.uid,
                successDetails(response),
            )
            return response
        } catch (ce: CancellationException) {
            throw ce
        } catch (error: Throwable) {
            Timber.tag(LOG_TAG).w(
                error,
                "stage=%s result=failure account_uid=%d error_type=%s",
                stage,
                payload?.uid ?: initial.uid,
                error.javaClass.simpleName,
            )
            throw error
        }
    }

    /**
     * Hand a lapsed borrowed account back to the server. The plain online report *is* the
     * notification: `saveOnline` derives membership from `user.is_premium` and pauses dispatch for
     * anything that is not premium, so no separate endpoint is involved.
     */
    private suspend fun reportNotPremium(result: Nana7miResult.NotPremium, stage: String) {
        // `lean` 删掉了上报服务（AccountOnlineReportOutbox），没有渠道把「这个号已掉会员」交回
        // 服务端，只能记日志：本进程内这个号不再被当作可用借号，调用方按既有 fallback 退回。
        Timber.tag(LOG_TAG).w(
            "stage=premium result=not_premium account_uid=%d source=%s report=disabled",
            result.uid,
            stage,
        )
    }

    fun resultLabel(result: Nana7miResult): String = when (result) {
        is Nana7miResult.Success -> if (result.value.expired) "expired" else "success"
        Nana7miResult.DisabledForLite -> "disabled_for_lite"
        Nana7miResult.NoAccount -> "no_account"
        is Nana7miResult.NotPremium -> "not_premium"
        is Nana7miResult.RateLimited -> "rate_limited"
        is Nana7miResult.HttpFailure -> "http_${result.status}"
        Nana7miResult.InvalidRequest -> "invalid_request"
        is Nana7miResult.NetworkFailure -> "network_failure"
        is Nana7miResult.InvalidResponse -> "invalid_response"
    }

    /** Refresh one borrowed account without touching the app's logged-in account. */
    private suspend fun renew(stale: Nana7miPayload, reason: String): Nana7miResult {
        // `classic` 在这里用借来的 refresh_token 换新 token，并把新 token 交给上报服务写回服务端 ——
        // Pixiv 轮换 refresh_token 后旧 token 立刻作废，所以「不交回去」等于把公共借号池刷坏。
        // `lean` 没有上报服务，正确的选择是不再续期：这个号当场判失效，调用方按既有 fallback
        // 路径退回热度预览 / 普通直连搜索。要恢复续期，得先把上报通道加回来。
        Timber.tag(LOG_TAG).w(
            "stage=expiry action=renew_disabled account_uid=%d reason=%s",
            stale.uid,
            reason,
        )
        return Nana7miResult.InvalidResponse(
            IllegalStateException("borrowed account renewal disabled: no report channel"),
        )
    }

    private fun isPixivOAuthExpired(error: Throwable): Boolean {
        val http = generateSequence(error) { it.cause }
            .filterIsInstance<HttpException>()
            .firstOrNull()
            ?: return false
        if (http.code() != 400) return false
        val body = runCatching { http.response()?.errorBody()?.string().orEmpty() }
            .getOrDefault("")
        return body.contains(PIXIV_OAUTH_ERROR) || body.contains(PIXIV_INVALID_REFRESH_TOKEN)
    }

    private fun logFetchResult(requesterUid: Long, result: Nana7miResult) {
        val logger = Timber.tag(LOG_TAG)
        when (result) {
            is Nana7miResult.Success -> {
                val now = System.currentTimeMillis()
                logger.d(
                    "stage=fetch result=success requester_uid=%d account_uid=%d expired=%s updated_at=%d expires_at=%d age_ms=%d remaining_ms=%d",
                    requesterUid,
                    result.value.uid,
                    result.value.expired,
                    result.value.updatedAt,
                    result.value.expiresAt,
                    (now - result.value.updatedAt).coerceAtLeast(0L),
                    (result.value.expiresAt - now).coerceAtLeast(0L),
                )
            }

            Nana7miResult.DisabledForLite -> logger.d(
                "stage=fetch result=disabled_for_lite requester_uid=%d",
                requesterUid,
            )

            Nana7miResult.NoAccount -> logger.w(
                "stage=fetch result=no_account requester_uid=%d",
                requesterUid,
            )

            is Nana7miResult.NotPremium -> logger.w(
                "stage=fetch result=not_premium requester_uid=%d account_uid=%d",
                requesterUid,
                result.uid,
            )

            is Nana7miResult.RateLimited -> logger.w(
                "stage=fetch result=rate_limited requester_uid=%d retry_after_seconds=%s",
                requesterUid,
                result.retryAfterSeconds?.toString() ?: "null",
            )

            is Nana7miResult.HttpFailure -> logger.w(
                "stage=fetch result=http_failure requester_uid=%d status=%d",
                requesterUid,
                result.status,
            )

            Nana7miResult.InvalidRequest -> logger.w(
                "stage=fetch result=invalid_request requester_uid=%d",
                requesterUid,
            )

            is Nana7miResult.NetworkFailure -> logger.w(
                result.cause,
                "stage=fetch result=network_failure requester_uid=%d error_type=%s",
                requesterUid,
                result.cause.javaClass.simpleName,
            )

            is Nana7miResult.InvalidResponse -> logger.w(
                result.cause,
                "stage=fetch result=invalid_response requester_uid=%d error_type=%s",
                requesterUid,
                result.cause?.javaClass?.simpleName ?: "unknown",
            )
        }
    }

    private companion object {
        const val LOG_TAG = "sadadsdasdw2"
        const val VALID_MS = 55L * 60_000L

        const val PIXIV_OAUTH_ERROR = "Error occurred at the OAuth process"
        const val PIXIV_INVALID_REFRESH_TOKEN = "Invalid refresh token"
    }
}

/** Only this error is eligible for a first-page fallback to the preview endpoint. */
internal class BorrowedAccountUnavailableException(cause: Throwable) : IOException(
    "borrowed Pixiv account could not be renewed",
    cause,
)

/** 409 is the only status dispatch reserves for a request id it will no longer honour. */
internal fun isPaidRequestIdRejected(result: Nana7miResult): Boolean =
    result is Nana7miResult.HttpFailure && result.status == 409

internal fun isBorrowedAccountUnavailable(error: Throwable): Boolean =
    generateSequence(error) { it.cause }.any { it is BorrowedAccountUnavailableException }

/**
 * One fair process-wide permit around fetch/refresh/report/search. It covers first pages and
 * pagination from both illustration and novel tabs, so a quick tab switch queues rather than
 * running two borrowed-account flows concurrently.
 */
internal object Nana7miSearchSerial {
    private val semaphore = Semaphore(1)

    /**
     * Acquires the permit (suspending, FIFO), runs [source] with a [Nana7miSearchLease], and
     * releases once [source] has fully unwound — including any [Nana7miSearchLease.guarded]
     * block that cancellation could not interrupt.
     */
    suspend fun <T : Any> run(
        stage: String,
        source: suspend (Nana7miSearchLease) -> T,
    ): T {
        val startedAt = System.nanoTime()
        semaphore.acquire()
        Timber.tag(LOG_TAG).d(
            "stage=serial event=acquired flow=%s waited_ms=%d",
            stage,
            (System.nanoTime() - startedAt) / 1_000_000L,
        )
        val lease = Nana7miSearchLease(stage, semaphore)
        try {
            return source(lease)
        } finally {
            lease.requestRelease()
        }
    }

    private const val LOG_TAG = "sadadsdasdw2"
}

/**
 * Keeps the serial permit alive while blocking token work unwinds after cancellation.
 *
 * Cancelling a coroutine cannot stop a blocking OAuth call already running on an IO thread, and
 * NonCancellable persistence deliberately finishes anyway. [guarded] runs such work on
 * [Dispatchers.IO] without thread interruption, so `withContext` only returns — and
 * [Nana7miSearchSerial.run] only reaches its release — after the block has actually exited. The
 * counter is belt-and-braces: should a release ever be requested while work is active, the permit
 * is handed back by the last block to finish rather than early.
 */
internal class Nana7miSearchLease(
    private val stage: String,
    private val semaphore: Semaphore,
) {
    private val stateLock = Any()
    private var activeBlockingWork = 0
    private var releaseRequested = false
    private var released = false

    /**
     * Runs [block] on IO under the lease. Throws [CancellationException] without running it when
     * the lease has already been released.
     */
    suspend fun <T : Any> guarded(block: suspend () -> T): T {
        if (!beginBlockingWork()) {
            throw CancellationException("nana7mi serial lease already released")
        }
        try {
            return withContext(Dispatchers.IO) { block() }
        } finally {
            endBlockingWork()
        }
    }

    private fun beginBlockingWork(): Boolean = synchronized(stateLock) {
        if (releaseRequested) return@synchronized false
        activeBlockingWork += 1
        true
    }

    private fun endBlockingWork() {
        val releaseNow = synchronized(stateLock) {
            check(activeBlockingWork > 0)
            activeBlockingWork -= 1
            markReleasedIfIdle()
        }
        if (releaseNow) releasePermit()
    }

    fun requestRelease() {
        val releaseNow = synchronized(stateLock) {
            releaseRequested = true
            markReleasedIfIdle()
        }
        if (releaseNow) releasePermit()
    }

    private fun markReleasedIfIdle(): Boolean {
        if (!releaseRequested || activeBlockingWork != 0 || released) return false
        released = true
        return true
    }

    private fun releasePermit() {
        semaphore.release()
        Timber.tag(LOG_TAG).d("stage=serial event=released flow=%s", stage)
    }

    private companion object {
        const val LOG_TAG = "sadadsdasdw2"
    }
}

/**
 * The membership a token refresh is allowed to speak for, or `null` when it
 * cannot speak for this account at all.
 *
 * `uid` is guaranteed `> 0` by the caller, and pixiv-login reports `0` when
 * pixiv omits or mangles the id, so the equality check doubles as a reject
 * for responses that cannot be tied to the account being renewed.
 */
internal fun freshMembershipOf(user: PixivOAuthUser?, uid: Long): Boolean? =
    user?.takeIf { it.id == uid }?.isPremium

/**
 * Folds a refresh response's membership into the stored account.
 *
 * Only `is_premium` is touched: pixiv's token-response user is narrower than
 * [User] (no pixiv_id / gender / comment), so replacing it wholesale would
 * shave off richer data the server already holds.
 *
 * [fresh] being `null` means pixiv said nothing about membership this time —
 * it omits the field on some refresh responses — and "said nothing" must not
 * be written down as "not a member", which would demote a paying account and
 * drop it out of the lending pool. `null` therefore keeps [stored] verbatim.
 */
internal fun mergeMembership(stored: User?, fresh: Boolean?): User? =
    if (fresh == null) stored else stored?.copy(is_premium = fresh)
