package dev.glint.app

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.glint.core.LenientJson
import dev.glint.core.Platform
import dev.glint.data.Store
import dev.glint.model.BookmarkRecord
import dev.glint.model.PersistedState
import dev.glint.model.Pin
import dev.glint.model.SearchHistoryEntry
import dev.glint.model.TagSuggestion
import dev.glint.platform.DriveSync
import dev.glint.sources.Accounts
import dev.glint.sources.MirrorNotice
import dev.glint.sources.Net
import dev.glint.sources.Sources
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer

/** Screens behind the bottom pill. */
enum class Screen { Home, Search, Profile }

/** Overlay pages/sheets, kept as a stack so back behaves like the PWA history. */
sealed class Overlay {
    data class PostDetail(val pinId: String, val showInfo: Boolean = false) : Overlay()
    data class ImageViewer(val pinId: String) : Overlay()
    data class RelatedPage(val pinId: String) : Overlay()
    data class TagFeed(val key: String) : Overlay()
    object SettingsSheet : Overlay()
    object SourcesSheet : Overlay()
    object AccountsSheet : Overlay()
    data class AccountEdit(val sourceId: String) : Overlay()
    data class SourceInfo(val sourceId: String) : Overlay()
    data class CustomSourceSheet(val editId: String = "") : Overlay()
    object LibrarySheet : Overlay()
    object AdvancedSheet : Overlay()
    object SavedSourcesSheet : Overlay()
    data class ConfirmDeleteSource(val sourceId: String) : Overlay()
    object LikesSearchSheet : Overlay()
}

class FeedStatus {
    var loading by mutableStateOf(false)
    var more by mutableStateOf(true)
    var error by mutableStateOf("")
}

class FavState {
    val pins = mutableStateListOf<Pin>()
    var page by mutableStateOf(0)
    var done by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var err by mutableStateOf("")
    var order by mutableStateOf("newest")
    var total by mutableStateOf<Int?>(null)
    var cursor by mutableStateOf<String?>(null)
    var loadedAt by mutableStateOf(0L)
    var authVersion by mutableStateOf(0)
}

class RemoteLikeState {
    var known by mutableStateOf(false)
    var liked by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var error by mutableStateOf("")
    var checkedAt by mutableStateOf(0L)
}

class ExploreSectionState(val key: String) {
    val pins = mutableStateListOf<Pin>()
    var scale by mutableStateOf("")
    var page by mutableStateOf(0)
    var busy by mutableStateOf(false)
    var done by mutableStateOf(false)
    var error by mutableStateOf("")
    var lastBatch by mutableStateOf("")
}

class RelatedGroup(
    val kind: String,
    val key: String,
    val title: String,
    val tag: String,
    val query: String,
) {
    val items = mutableStateListOf<Pin>()
    var shown by mutableStateOf(5)
    var page by mutableStateOf(1)
    var busy by mutableStateOf(false)
    var loaded by mutableStateOf(false)
    var done by mutableStateOf(false)
    var error by mutableStateOf(false)
    var lastBatch by mutableStateOf("")
}

class RelatedPageState(val id: String, val src: String, val signature: String, val order: String) {
    val groups = mutableStateListOf<RelatedGroup>()
    var metadataPending by mutableStateOf(false)
}

class TagFeedState(
    val key: String,
    val src: String,
    val kind: String,
    val title: String,
    val tag: String,
    val query: String,
    val parentId: String,
) {
    val pins = mutableStateListOf<Pin>()
    var page by mutableStateOf(0)
    var cursor by mutableStateOf<String?>(null)
    var loaded by mutableStateOf(false)
    var done by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var err by mutableStateOf("")
    var order by mutableStateOf("newest")
    var total by mutableStateOf<Int?>(null)
    var countTried by mutableStateOf(false)
    var confirmedEnd by mutableStateOf(false)
}

data class RelatedKind(val key: String, val field: String, val title: String)

val RELATED_KINDS = listOf(
    RelatedKind("character", "characters", "Character"),
    RelatedKind("artist", "artists", "Artist"),
    RelatedKind("series", "series", "Series"),
)

val TAG_FEED_KINDS = RELATED_KINDS + RelatedKind("general", "tags", "Tag")

class GlintStore(val scope: CoroutineScope) {

    var state by mutableStateOf(Store.load())
        private set

    var screen by mutableStateOf(
        when (state.screen) {
            "search" -> Screen.Search
            "profile" -> Screen.Profile
            else -> Screen.Home
        },
    )
        private set

    val overlays = mutableStateListOf<Overlay>()
    var toast by mutableStateOf("")
        private set
    private var toastJob: Job? = null

    val feedStatus = FeedStatus()
    val liveSerial = mutableStateOf(0)
    private var liveJob: Job? = null

    /* search */
    var searchDraft by mutableStateOf(state.q)
    var searchQuery by mutableStateOf(state.q)
    var searchResults = mutableStateListOf<Pin>()
    var searchPage by mutableStateOf(0)
    var searchBusy by mutableStateOf(false)
    var searchMore by mutableStateOf(true)
    var searchError by mutableStateOf("")
    var searchCount by mutableStateOf<Int?>(null)
    var searchOrder by mutableStateOf("newest")
    var searchCursor by mutableStateOf<String?>(null)
    val searchSuggestions = mutableStateListOf<TagSuggestion>()
    val recentSearches = mutableStateListOf<SearchHistoryEntry>()
    private var searchJob: Job? = null
    private var suggestJob: Job? = null

    /* saved / bookmarks view */
    var bookmarkSource by mutableStateOf("all")
    var bookmarkOrder by mutableStateOf("newest")
    var bookmarkQuery by mutableStateOf("")
    var bookmarkSearchOpen by mutableStateOf(false)

    /* likes */
    val favStates = mutableStateMapOf<String, FavState>()
    var likesSearchOpen by mutableStateOf(false)
    var likesSearchDraft by mutableStateOf("")
    val likesApiQueries = mutableStateMapOf<String, String>()
    val likesApiPins = mutableStateListOf<Pin>()
    var likesApiBusy by mutableStateOf(false)
    var likesApiPage by mutableStateOf(0)
    var likesApiTotal by mutableStateOf<Int?>(null)
    var likesApiMore by mutableStateOf(false)
    var likesApiError by mutableStateOf("")
    private var likesApiJob: Job? = null

    /* source-confirmed likes on thumbnails/viewer */
    val sourceLikes = mutableStateMapOf<String, RemoteLikeState>()

    /* explore */
    val exploreStates = mutableStateMapOf<String, ExploreSectionState>()
    var exploreSource by mutableStateOf("")

    /* related + tag feeds */
    val relatedPages = mutableStateMapOf<String, RelatedPageState>()
    val tagFeeds = mutableStateMapOf<String, TagFeedState>()

    /* demo artwork (procedural, same seeded PRNG as app.js) */
    val demoPins: List<Pin> = buildDemoPins()

    val drive = DriveSync.create(this)

    private val SEARCH_HISTORY_KEY = "pb-search-history-v1"
    private val SEARCH_HISTORY_LIMIT = 20

    init {
        Sources.ensureLoaded()
        MirrorNotice.listener = { showToast(it) }
        Accounts.onChange = { sourceId ->
            favStates.remove(sourceId)
            sourceLikes.keys.filter { it.startsWith("$sourceId|") }.forEach { sourceLikes.remove(it) }
        }
        loadSearchHistory()
        if (state.mode == "live") queueLive(reset = false)
        if (Store.storageWarning.isNotEmpty()) showToast(Store.storageWarning)
    }

    /* ------------------------------------------------------------ basics */

    fun update(transform: (PersistedState) -> PersistedState) {
        state = transform(state)
        save()
    }

    private var savePending = false
    fun save(now: Boolean = false) {
        if (now) { Store.persist(state); return }
        if (savePending) return
        savePending = true
        scope.launch {
            delay(400)
            savePending = false
            Store.persist(state)
            if (state.driveOn && state.driveAuto) drive.markDirty()
        }
    }

    fun showToast(message: String) {
        toast = message
        toastJob?.cancel()
        toastJob = scope.launch {
            delay(1600)
            toast = ""
        }
    }

    fun nav(target: Screen) {
        if (screen == target) {
            if (target == Screen.Home) wantTop++
            return
        }
        screen = target
        update { it.copy(screen = when (target) { Screen.Home -> "home"; Screen.Search -> "search"; Screen.Profile -> "profile" }) }
        if (target == Screen.Home && state.mode == "live" && livePins().isEmpty()) queueLive(reset = false)
        if (target == Screen.Profile && state.bt == "Likes") refreshLikesIfNeeded()
        if (target == Screen.Profile && state.bt == "Explore") ensureExplore()
    }

    var wantTop by mutableStateOf(0)
        private set

    fun wantTopBump() { wantTop++ }

    fun push(overlay: Overlay) { overlays.add(overlay) }

    fun pop() { if (overlays.isNotEmpty()) overlays.removeAt(overlays.size - 1) }

    fun closeAllOverlays() { overlays.clear() }

    fun goBack(): Boolean {
        if (overlays.isNotEmpty()) { pop(); return true }
        return false
    }

    /* ------------------------------------------------------------- pins */

    fun livePins(): List<Pin> = state.live[state.src] ?: emptyList()

    fun pin(id: String): Pin? {
        livePins().firstOrNull { it.id == id }?.let { return it }
        state.custom.firstOrNull { it.id == id }?.let { return it }
        state.pinCache[id]?.let { return it }
        demoPins.firstOrNull { it.id == id }?.let { return it }
        state.live.values.flatten().firstOrNull { it.id == id }?.let { return it }
        favStates.values.forEach { f -> f.pins.firstOrNull { it.id == id }?.let { return it } }
        likesApiPins.firstOrNull { it.id == id }?.let { return it }
        searchResults.firstOrNull { it.id == id }?.let { return it }
        exploreStates.values.forEach { st -> st.pins.firstOrNull { it.id == id }?.let { return it } }
        relatedPages.values.forEach { page -> page.groups.forEach { g -> g.items.firstOrNull { it.id == id }?.let { return it } } }
        tagFeeds.values.forEach { f -> f.pins.firstOrNull { it.id == id }?.let { return it } }
        return null
    }

    fun rememberPin(p: Pin) {
        state = state.copy(pinCache = state.pinCache + (p.id to p))
    }

    fun upgradePin(p: Pin) {
        // Replace this pin wherever it is shown so detail data sticks.
        state = state.copy(
            pinCache = if (state.pinCache.containsKey(p.id) || bookmarked(p.id)) state.pinCache + (p.id to p) else state.pinCache,
            live = state.live.mapValues { (_, list) -> list.map { if (it.id == p.id) p else it } },
        )
        val replace: (MutableList<Pin>) -> Unit = { list ->
            val at = list.indexOfFirst { it.id == p.id }
            if (at >= 0) list[at] = p
        }
        replace(searchResults)
        replace(likesApiPins)
        favStates.values.forEach { replace(it.pins) }
        exploreStates.values.forEach { replace(it.pins) }
        relatedPages.values.forEach { page -> page.groups.forEach { replace(it.items) } }
        tagFeeds.values.forEach { replace(it.pins) }
        save()
    }

    /* -------------------------------------------------------- bookmarks */

    fun bookmarked(id: String): Boolean = state.bookmarks.any { it.id == id }

    fun toggleBookmark(id: String) {
        val p = pin(id)
        if (bookmarked(id)) {
            update {
                it.copy(
                    bookmarks = it.bookmarks.filter { b -> b.id != id },
                    bmDeleted = it.bmDeleted + (id to Platform.epochMillis()),
                )
            }
            showToast("Removed bookmark")
        } else {
            if (p != null) rememberPin(p)
            update {
                it.copy(
                    bookmarks = Store.migrateBookmarkRecords(
                        listOf(BookmarkRecord(id, Platform.epochMillis())) + it.bookmarks,
                    ),
                    bmDeleted = it.bmDeleted - id,
                )
            }
            showToast("Saved")
        }
        save(now = true)
    }

    data class BookmarkRow(val record: BookmarkRecord, val p: Pin?, val source: String, val index: Int)

    /** PWA bookmarkRows(): only rows whose source is in the enabled source row. */
    fun bookmarkRows(): List<BookmarkRow> {
        val enabled = state.srcs.filter { Sources.all[it]?.off == false }.toSet()
        return state.bookmarks.mapIndexed { index, record ->
            val p = pin(record.id)
            // Uncached legacy records still carry their source in the id prefix
            // ("danbooru-123" here, "danbooru:123" in old PWA backups).
            val candidate = p?.src?.ifEmpty { null }
                ?: record.id.substringBefore(":").takeIf { Sources.has(it) }
                ?: Sources.order.firstOrNull { record.id.startsWith("$it-") }
                ?: ""
            val source = if (Sources.has(candidate)) candidate else ""
            BookmarkRow(record, p, source, index)
        }.filter { it.source in enabled && it.record.id !in state.hidden }
    }

    fun bookmarkSourceOptions(rows: List<BookmarkRow> = bookmarkRows()): List<Triple<String, String, Int>> =
        state.srcs.distinct()
            .filter { Sources.all[it]?.off == false }
            .map { id -> Triple(id, Sources.source(id).name, rows.count { it.source == id }) }
            .filter { it.third > 0 }

    fun bookmarkSearchNormalize(value: String): String =
        value.replace('_', ' ').lowercase().replace(Regex("\\s+"), " ").trim()

    private fun bookmarkSearchText(row: BookmarkRow): String {
        val p = row.p
        return bookmarkSearchNormalize(
            listOf(
                row.record.id, row.source, Sources.all[row.source]?.name ?: "",
                p?.sid ?: "", p?.t ?: "", p?.srcName ?: "",
                (p?.tags ?: emptyList()).joinToString(" "),
                (p?.characters ?: emptyList()).joinToString(" "),
                (p?.artists ?: emptyList()).joinToString(" "),
                (p?.series ?: emptyList()).joinToString(" "),
            ).joinToString(" "),
        )
    }

    fun visibleBookmarkRows(rows: List<BookmarkRow> = bookmarkRows()): List<BookmarkRow> {
        val terms = bookmarkSearchNormalize(bookmarkQuery).split(" ").filter { it.isNotEmpty() }
        val filtered = rows.filter { row ->
            (bookmarkSource == "all" || row.source == bookmarkSource) &&
                (terms.isEmpty() || terms.all { bookmarkSearchText(row).contains(it) })
        }
        val newest = filtered.sortedWith(compareByDescending<BookmarkRow> { it.record.savedAt }.thenBy { it.index })
        return if (bookmarkOrder == "oldest") newest.reversed() else newest
    }

    /* ------------------------------------------------------------- feed */

    fun feedOrderFor(id: String): String =
        if (state.forder[id] == "popularity" && Sources.postPopularitySupported(id)) "popularity" else "newest"

    fun setFeedOrder(id: String, order: String) {
        update { it.copy(forder = it.forder + (id to order)) }
        queueLive(reset = true)
    }

    fun queueLive(reset: Boolean) {
        liveJob?.cancel()
        liveJob = scope.launch {
            loadLive(reset)
        }
    }

    suspend fun loadLive(reset: Boolean) {
        if (state.mode != "live") return
        val src = state.src
        if (reset) {
            state = state.copy(live = state.live + (src to emptyList()), lpage = state.lpage + (src to 0))
            feedStatus.more = true
            feedStatus.error = ""
        }
        if (feedStatus.loading) return
        feedStatus.loading = true
        feedStatus.error = ""
        val page = (state.lpage[src] ?: 0) + 1
        val tags = state.stags[src] ?: ""
        try {
            val batch = Sources.loadPosts(src, tags = tags, page = page, limit = 40, order = feedOrderFor(src))
            if (state.src != src) return
            val existing = state.live[src] ?: emptyList()
            val known = existing.map { it.id }.toSet()
            val merged = existing + batch.pins.filter { it.id !in known }
            state = state.copy(
                live = state.live + (src to merged.takeLast(400)),
                lpage = state.lpage + (src to page),
            )
            feedStatus.more = batch.hasMore
            liveSerial.value++
            save()
        } catch (e: Throwable) {
            if (state.src == src) feedStatus.error = e.message ?: "Could not reach the source."
        } finally {
            feedStatus.loading = false
        }
    }

    fun feedMore() {
        if (feedStatus.loading || !feedStatus.more) return
        queueLive(reset = false)
    }

    fun pickSource(id: String) {
        if (!Sources.has(id)) return
        update { it.copy(src = id, mode = "live") }
        feedStatus.more = true
        feedStatus.error = ""
        if (livePins().isEmpty()) queueLive(reset = false)
        exploreSource = ""
        showToast(Sources.source(id).name)
    }

    fun addSourceToRow(id: String) {
        if (id !in state.srcs) update { it.copy(srcs = it.srcs + id) }
    }

    fun removeSourceFromRow(id: String) {
        val s = Sources.all[id] ?: return
        if (s.custom) {
            Sources.removeCustomSource(id)
            update { st -> st.copy(srcs = st.srcs.filter { it != id }) }
            showToast("Deleted " + s.name)
        } else {
            update { st -> st.copy(srcs = st.srcs.filter { it != id }) }
            showToast(s.name + " removed. Re-add it from Manage sources.")
        }
        if (state.src == id) {
            val next = state.srcs.firstOrNull { Sources.all[it]?.off == false } ?: "danbooru"
            pickSource(next)
        }
    }

    /* ----------------------------------------------------------- search */

    private fun loadSearchHistory() {
        try {
            val raw = Platform.storage().get(SEARCH_HISTORY_KEY) ?: return
            val decoded = LenientJson.decodeFromString(ListSerializer(SearchHistoryEntry.serializer()), raw)
            recentSearches.clear()
            recentSearches.addAll(decoded.take(SEARCH_HISTORY_LIMIT))
        } catch (_: Throwable) {}
    }

    private fun persistSearchHistory() {
        try {
            Platform.storage().put(SEARCH_HISTORY_KEY, LenientJson.encodeToString(ListSerializer(SearchHistoryEntry.serializer()), recentSearches.toList()))
        } catch (_: Throwable) {}
    }

    fun recentSearchesFor(source: String): List<SearchHistoryEntry> =
        recentSearches.filter { it.source == source }

    fun rememberSearch(value: String) {
        val query = value.trim().replace(Regex("\\s+"), " ")
        if (query.isEmpty()) return
        recentSearches.removeAll { it.query == query && it.source == state.src }
        recentSearches.add(0, SearchHistoryEntry(query, state.src, Platform.epochMillis()))
        while (recentSearches.size > SEARCH_HISTORY_LIMIT) recentSearches.removeAt(recentSearches.size - 1)
        persistSearchHistory()
    }

    fun removeRecentSearch(query: String) {
        recentSearches.removeAll { it.query == query && it.source == state.src }
        persistSearchHistory()
    }

    fun clearRecentSearches() {
        recentSearches.removeAll { it.source == state.src }
        persistSearchHistory()
    }

    /** Nothing searches while you type: Enter/submit applies the draft. */
    fun submitSearch(value: String = searchDraft) {
        val query = value.trim().replace(Regex("\\s+"), " ")
        searchDraft = query
        searchQuery = query
        update { it.copy(q = query) }
        searchSuggestions.clear()
        if (query.isEmpty()) {
            searchResults.clear(); searchPage = 0; searchCount = null; searchMore = true; searchError = ""
            return
        }
        rememberSearch(query)
        runSearch(reset = true)
    }

    fun searchTokens(): List<String> = searchQuery.split(" ").filter { it.isNotEmpty() }

    fun removeSearchChip(tag: String) {
        val tokens = searchTokens().filter { it != tag }
        submitSearch(tokens.joinToString(" "))
    }

    fun setSearchOrder(order: String) {
        searchOrder = order
        if (searchQuery.isNotEmpty()) runSearch(reset = true)
    }

    fun runSearch(reset: Boolean) {
        if (reset) {
            searchResults.clear(); searchPage = 0; searchCursor = null
            searchMore = true; searchError = ""; searchCount = null
        }
        if (searchBusy || !searchMore) return
        val src = state.src
        val query = searchQuery
        if (query.isEmpty()) return
        searchBusy = true
        searchJob?.cancel()
        searchJob = scope.launch {
            try {
                val page = searchPage + 1
                val preserve = Regex("(?:^|\\s)(?:order|sort):\\S+", RegexOption.IGNORE_CASE).containsMatchIn(query)
                val batch = Sources.loadPosts(
                    src, tags = query, page = page, limit = 40,
                    order = if (preserve) null else searchOrder,
                    preserveQueryOrder = preserve,
                )
                if (state.src != src || searchQuery != query) return@launch
                val known = searchResults.map { it.id }.toSet()
                searchResults.addAll(batch.pins.filter { it.id !in known })
                searchPage = page
                searchMore = batch.hasMore
                if (page == 1 && searchCount == null) {
                    try { searchCount = Sources.loadPostCount(src, query) } catch (_: Throwable) {}
                }
            } catch (e: Throwable) {
                searchError = e.message ?: "Search failed."
            } finally {
                searchBusy = false
            }
        }
    }

    fun searchMoreResults() {
        if (!searchBusy && searchMore && searchQuery.isNotEmpty()) runSearch(reset = false)
    }

    /** Tag suggestions appear while typing (unlike results). */
    fun updateSearchDraft(value: String) {
        searchDraft = value
        suggestJob?.cancel()
        val token = value.split(Regex("\\s+")).lastOrNull()?.trim() ?: ""
        if (token.length < 2) { searchSuggestions.clear(); return }
        suggestJob = scope.launch {
            delay(220)
            try {
                val rows = Sources.autocomplete(state.src, token)
                searchSuggestions.clear()
                searchSuggestions.addAll(rows)
            } catch (_: Throwable) {}
        }
    }

    fun applySuggestion(name: String) {
        val tokens = searchDraft.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.toMutableList()
        if (tokens.isNotEmpty()) tokens[tokens.size - 1] = name else tokens.add(name)
        searchDraft = tokens.joinToString(" ")
        searchSuggestions.clear()
        submitSearch(searchDraft)
    }

    /* ------------------------------------------------------------ likes */

    fun hasLikesTab(): Boolean = Accounts.likesOk(state.src) && Accounts.hasAuth(state.src)

    fun savedTabs(): List<String> = if (hasLikesTab()) listOf("Likes", "Bookmarks", "Explore") else listOf("Bookmarks", "Explore")

    fun setSavedTab(tab: String) {
        update { it.copy(bt = tab) }
        if (tab == "Likes") refreshLikesIfNeeded()
        if (tab == "Explore") ensureExplore()
    }

    fun favState(id: String = state.src): FavState {
        val f = favStates.getOrPut(id) { FavState() }
        if (f.authVersion != Accounts.authVersion(id)) {
            f.pins.clear(); f.page = 0; f.done = false; f.err = ""; f.total = null; f.cursor = null
            f.authVersion = Accounts.authVersion(id)
        }
        return f
    }

    fun refreshLikesIfNeeded() {
        val f = favState()
        if (f.page == 0 || Platform.epochMillis() - f.loadedAt > 30_000) loadFavorites(reset = f.page == 0)
    }

    fun loadFavorites(reset: Boolean) {
        val src = state.src
        val f = favState(src)
        if (f.busy) return
        if (reset) { f.pins.clear(); f.page = 0; f.done = false; f.err = ""; f.cursor = null }
        if (f.done) return
        f.busy = true
        scope.launch {
            try {
                if (f.total == null && f.order == "oldest") f.total = Accounts.loadFavoriteCount(src)
                val page = f.page + 1
                val batch = Accounts.loadFavorites(src, page = page, order = f.order, total = f.total, cursor = f.cursor)
                val known = f.pins.map { it.id }.toSet()
                f.pins.addAll(batch.pins.filter { it.id !in known })
                f.page = page
                f.cursor = batch.nextCursor
                f.done = !batch.hasMore
                f.loadedAt = Platform.epochMillis()
                // These are source-confirmed likes.
                batch.pins.forEach { seedRemoteLike(it) }
                if (f.total == null) {
                    try { f.total = Accounts.loadFavoriteCount(src) } catch (_: Throwable) {}
                }
            } catch (e: Throwable) {
                f.err = e.message ?: "Could not load likes."
            } finally {
                f.busy = false
            }
        }
    }

    fun toggleFavOrder() {
        val f = favState()
        f.order = if (f.order == "oldest") "newest" else "oldest"
        loadFavorites(reset = true)
    }

    fun likesApiQuery(): String = likesApiQueries[state.src] ?: ""

    fun submitLikesSearch(value: String) {
        likesSearchDraft = value
        likesApiQueries[state.src] = value.trim()
        likesApiJob?.cancel()
        likesApiPins.clear(); likesApiPage = 0; likesApiTotal = null; likesApiMore = false; likesApiError = ""
        if (likesApiQuery().isEmpty()) return
        likesApiBusy = true
        likesApiJob = scope.launch {
            delay(300)
            loadLikesApiSearch()
        }
    }

    suspend fun loadLikesApiSearch() {
        val src = state.src
        val query = likesApiQuery()
        if (query.isEmpty()) { likesApiBusy = false; return }
        likesApiBusy = true
        try {
            val page = likesApiPage + 1
            val (batch, total) = Accounts.searchFavorites(src, query, page)
            val known = likesApiPins.map { it.id }.toSet()
            likesApiPins.addAll(batch.pins.filter { it.id !in known })
            likesApiPage = page
            likesApiMore = batch.hasMore
            if (total != null) likesApiTotal = total
            batch.pins.forEach { seedRemoteLike(it) }
        } catch (e: Throwable) {
            likesApiError = e.message ?: "Search unavailable"
        } finally {
            likesApiBusy = false
        }
    }

    fun likesSearchCountLabel(): String {
        if (likesApiQuery().isEmpty()) {
            val f = favState()
            return f.total?.let { "$it liked posts" } ?: "${f.pins.size} loaded likes"
        }
        if (likesApiError.isNotEmpty() && likesApiPage == 0) return "Search unavailable"
        if (likesApiBusy && likesApiPage == 0) return "Searching likes…"
        likesApiTotal?.let { return "$it matching pictures" }
        return "${likesApiPins.size} " + if (likesApiMore) "loaded results" else "matching pictures"
    }

    /* -------------------------------------------- source-confirmed likes */

    fun canLikePost(p: Pin?): Boolean =
        p != null && p.src.isNotEmpty() && Regex("^\\d+$").matches(p.sid) && Accounts.canLike(p.src)

    fun canReadPostLike(p: Pin?): Boolean =
        p != null && p.src.isNotEmpty() && Regex("^\\d+$").matches(p.sid) &&
            Accounts.likesOk(p.src) && Accounts.hasAuth(p.src)

    fun sourceLikeKey(p: Pin): String = p.src + "|" + Accounts.authVersion(p.src) + "|" + p.sid

    fun remoteLikeState(p: Pin): RemoteLikeState = sourceLikes.getOrPut(sourceLikeKey(p)) { RemoteLikeState() }

    fun isRemoteLiked(p: Pin): Boolean {
        if (!canReadPostLike(p)) return false
        val s = sourceLikes[sourceLikeKey(p)] ?: return false
        return s.known && s.liked
    }

    fun seedRemoteLike(p: Pin) {
        if (!canReadPostLike(p)) return
        val s = remoteLikeState(p)
        if (!s.busy) { s.known = true; s.liked = true; s.checkedAt = Platform.epochMillis() }
    }

    fun ensureRemoteLike(p: Pin, force: Boolean = false) {
        if (!canReadPostLike(p)) return
        val s = remoteLikeState(p)
        if (s.busy) return
        if (s.known && !force && Platform.epochMillis() - s.checkedAt < 60_000) return
        s.busy = true
        scope.launch {
            try {
                val liked = Accounts.favoriteStatus(p.src, p.sid)
                s.known = true; s.liked = liked; s.error = ""; s.checkedAt = Platform.epochMillis()
            } catch (e: Throwable) {
                s.error = e.message ?: ""
            } finally {
                s.busy = false
            }
        }
    }

    fun toggleSourceLike(p: Pin) {
        if (!canLikePost(p)) { showToast("Connect this source account first."); return }
        val s = remoteLikeState(p)
        if (s.busy) return
        val target = !(s.known && s.liked)
        s.busy = true
        scope.launch {
            try {
                val actual = Accounts.setFavorite(p.src, p.sid, target)
                s.known = true; s.liked = actual; s.error = ""; s.checkedAt = Platform.epochMillis()
                showToast(if (actual) "Liked on " + Sources.source(p.src).name else "Like removed")
                favStates[p.src]?.let { f -> if (!actual) f.pins.removeAll { it.id == p.id } }
            } catch (e: Throwable) {
                s.error = e.message ?: ""
                showToast(e.message ?: "The source rejected the Like.")
            } finally {
                s.busy = false
            }
        }
    }

    /* ---------------------------------------------------------- explore */

    fun ensureExplore(force: Boolean = false) {
        val src = state.src
        if (exploreSource != src || force) {
            exploreSource = src
            exploreStates.clear()
            for (section in Sources.exploreSections(src)) {
                val st = ExploreSectionState(section.key)
                st.scale = section.def
                exploreStates[section.key] = st
                loadExploreSection(section.key)
            }
        }
    }

    fun loadExploreSection(key: String, scale: String? = null, more: Boolean = false) {
        val src = state.src
        val section = Sources.exploreSections(src).firstOrNull { it.key == key } ?: return
        val st = exploreStates.getOrPut(key) { ExploreSectionState(key).also { it.scale = section.def } }
        if (scale != null && scale != st.scale) {
            st.scale = scale; st.pins.clear(); st.page = 0; st.done = false; st.error = ""; st.lastBatch = ""
        }
        if (st.busy || (st.done && more)) return
        st.busy = true
        st.error = ""
        scope.launch {
            try {
                val page = if (more) st.page + 1 else maxOf(1, st.page).let { if (st.pins.isEmpty()) 1 else it }
                val batch = Sources.loadExplore(src, kind = key, scale = st.scale.ifEmpty { "day" }, page = page, limit = 24)
                if (exploreSource != src) return@launch
                val known = st.pins.map { it.id }.toSet()
                val added = batch.pins.filter { it.id !in known }
                if (batch.batchKey == st.lastBatch && more) { st.done = true } else {
                    st.pins.addAll(added)
                    st.lastBatch = batch.batchKey
                    st.page = page
                    st.done = !batch.hasMore || added.isEmpty() && more
                }
            } catch (e: Throwable) {
                st.error = e.message ?: "Could not load this section."
            } finally {
                st.busy = false
            }
        }
    }

    /* -------------------------------------------------- related art */

    fun relatedTagKey(value: String): String =
        value.replace(Regex("^(character|artist|copyright|series):"), "").replace(Regex("\\s+"), "_").lowercase()

    fun relatedQuery(p: Pin, kind: String, tag: String): String {
        val source = Sources.all[p.src]
        val raw = p.tags.firstOrNull { relatedTagKey(it) == relatedTagKey(tag) }
        var value = if (source?.engine == "philomena") (raw ?: "$kind:$tag") else tag
        value = value.replace(Regex("\\s+"), "_")
        val sticky = state.stags[p.src] ?: ""
        return listOf(value, sticky).filter { it.isNotEmpty() }.joinToString(" ")
    }

    fun relatedPage(p: Pin): RelatedPageState {
        val order = feedOrderFor(p.src)
        val signature = listOf(
            p.src,
            p.characters.joinToString(","), p.artists.joinToString(","), p.series.joinToString(","),
            state.stags[p.src] ?: "", order,
        ).joinToString("|")
        val existing = relatedPages[p.id]
        if (existing != null && existing.signature == signature) return existing
        val page = RelatedPageState(p.id, p.src, signature, order)
        page.metadataPending = !p.detailsReady
        for (def in RELATED_KINDS) {
            val values = when (def.field) {
                "characters" -> p.characters
                "artists" -> p.artists
                else -> p.series
            }.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
            val tags = values.ifEmpty { listOf("") }
            tags.forEachIndexed { index, tag ->
                val group = RelatedGroup(def.key, def.key + "-" + index, def.title, tag, if (tag.isEmpty()) "" else relatedQuery(p, def.key, tag))
                if (tag.isEmpty() || Sources.all[p.src] == null) { group.loaded = true; group.done = true }
                page.groups.add(group)
            }
        }
        relatedPages[p.id] = page
        while (relatedPages.size > 12) relatedPages.remove(relatedPages.keys.first())
        return page
    }

    fun loadRelatedGroup(page: RelatedPageState, group: RelatedGroup, more: Boolean = false) {
        if (group.busy || group.tag.isEmpty()) return
        if (group.done && more) return
        group.busy = true
        group.error = false
        scope.launch {
            try {
                val pageNumber = if (more) group.page + 1 else group.page
                val batch = Sources.loadPosts(page.src, tags = group.query, page = pageNumber, limit = 20, order = page.order)
                val known = group.items.map { it.id }.toSet()
                val added = batch.pins.filter { it.id !in known && it.id != page.id }
                if (batch.batchKey == group.lastBatch && more) group.done = true
                else {
                    group.items.addAll(added)
                    group.lastBatch = batch.batchKey
                    group.page = pageNumber
                    group.done = !batch.hasMore
                }
                group.loaded = true
            } catch (_: Throwable) {
                group.error = true
                group.loaded = true
            } finally {
                group.busy = false
            }
        }
    }

    fun relatedHeading(g: RelatedGroup): String {
        val name = if (g.tag.isNotEmpty()) dev.glint.sources.displayName(g.tag) else ""
        return if (name.isNotEmpty()) (if (g.kind == "character") name else g.title + ": " + name) else g.title
    }

    /* --------------------------------------------------------- tag feeds */

    fun tagFeedOrders(src: String): List<String> =
        listOf("newest") + (if (Sources.postPopularitySupported(src)) listOf("popularity") else emptyList()) +
            (if (Sources.postSortSupported(src)) listOf("oldest") else emptyList())

    fun tagFeed(src: String, kind: String, tag: String, query: String? = null, parentId: String = "", order: String? = null): TagFeedState? {
        val def = TAG_FEED_KINDS.firstOrNull { it.key == kind } ?: return null
        if (!Sources.has(src) || tag.trim().isEmpty()) return null
        val effectiveQuery = query ?: tag
        val key = listOf(src, def.key, tag, effectiveQuery).joinToString("\u0000")
        val existing = tagFeeds[key]
        if (existing != null) {
            tagFeeds.remove(key); tagFeeds[key] = existing
            return existing
        }
        val orders = tagFeedOrders(src)
        val preferred = order?.takeIf { it in orders } ?: feedOrderFor(src)
        val f = TagFeedState(key, src, def.key, def.title, tag, effectiveQuery, parentId)
        f.order = if (preferred in orders) preferred else "newest"
        tagFeeds[key] = f
        while (tagFeeds.size > 12) tagFeeds.remove(tagFeeds.keys.first())
        return f
    }

    fun loadTagFeed(f: TagFeedState, reset: Boolean = false) {
        if (f.busy) return
        if (reset) { f.pins.clear(); f.page = 0; f.cursor = null; f.done = false; f.err = ""; f.confirmedEnd = false }
        if (f.done) return
        f.busy = true
        f.err = ""
        scope.launch {
            try {
                val page = f.page + 1
                val batch = Sources.loadPosts(f.src, tags = f.query.replace(Regex("\\s+"), " "), page = page, limit = 40, order = f.order)
                val known = f.pins.map { it.id }.toSet()
                val added = batch.pins.filter { it.id !in known }
                f.pins.addAll(added)
                f.page = page
                f.cursor = batch.nextCursor
                f.done = !batch.hasMore
                f.confirmedEnd = batch.endConfirmed
                f.loaded = true
                if (!f.countTried) {
                    f.countTried = true
                    try { f.total = Sources.loadPostCount(f.src, f.query) } catch (_: Throwable) {}
                }
            } catch (e: Throwable) {
                f.err = e.message ?: "Could not load this feed."
                f.loaded = true
            } finally {
                f.busy = false
            }
        }
    }

    fun applyTagFeedOrder(f: TagFeedState, order: String) {
        if (f.order == order) return
        f.order = order
        loadTagFeed(f, reset = true)
    }

    /* -------------------------------------------------------- post pages */

    /** Ids of the list the open post came from — powers swipe next/previous. */
    var detailContext by mutableStateOf<List<String>>(emptyList())

    fun openPost(id: String, context: List<String> = emptyList()) {
        val p = pin(id) ?: return
        rememberPin(p)
        if (context.isNotEmpty()) detailContext = context
        push(Overlay.PostDetail(id))
        fetchPostInfo(p)
        ensureRemoteLike(p)
    }

    /** Swipe navigation target inside the viewer/detail. dir = +1 next, -1 previous. */
    fun neighborPost(id: String, dir: Int): String? {
        val list = detailContext
        val at = list.indexOf(id)
        if (at < 0) return null
        val next = at + dir
        return list.getOrNull(next)
    }

    fun swipeAdvance(id: String, towardStart: Boolean): String? {
        // S.sw "left" = swiping left advances; "right" = swiping right advances.
        val advance = if (state.sw == "left") towardStart else !towardStart
        return neighborPost(id, if (advance) 1 else -1)
    }

    fun replaceTopDetail(id: String) {
        val p = pin(id) ?: return
        rememberPin(p)
        val top = overlays.lastOrNull()
        if (top is Overlay.PostDetail) overlays[overlays.size - 1] = Overlay.PostDetail(id, top.showInfo)
        else if (top is Overlay.ImageViewer) overlays[overlays.size - 1] = Overlay.ImageViewer(id)
        fetchPostInfo(p)
        ensureRemoteLike(p)
    }

    fun fetchPostInfo(p: Pin) {
        if (p.detailsReady && p.fileInfoReady && p.uploadInfoReady && p.sourceInfoReady) return
        if (p.src.isEmpty()) return
        scope.launch {
            try {
                val fresh = Sources.loadPostDetails(p.src, p.sid) ?: return@launch
                upgradePin(fresh)
            } catch (_: Throwable) {}
        }
    }

    fun postTagQuery(p: Pin, kind: String, tag: String): String = when (kind) {
        "character", "artist", "series" -> relatedQuery(p, kind, tag)
        else -> {
            val sticky = state.stags[p.src] ?: ""
            listOf(tag.replace(Regex("\\s+"), "_"), sticky).filter { it.isNotEmpty() }.joinToString(" ")
        }
    }

    fun openPostTag(p: Pin, kind: String, tag: String) {
        val f = tagFeed(p.src, kind, tag, postTagQuery(p, kind, tag), parentId = p.id) ?: return
        push(Overlay.TagFeed(f.key))
        if (!f.loaded) loadTagFeed(f)
    }

    fun openRelated(id: String) {
        val p = pin(id) ?: return
        val page = relatedPage(p)
        push(Overlay.RelatedPage(id))
        page.groups.forEach { g -> if (!g.loaded && !g.busy) loadRelatedGroup(page, g) }
    }

    fun sharePost(id: String) {
        val p = pin(id) ?: return
        val url = postLink(p)
        if (!Platform.shareText(p.t.ifEmpty { "Glint" }, url)) {
            showToast("Sharing is available on Android only")
        }
    }

    fun postLink(p: Pin): String {
        val s = Sources.all[p.src] ?: return p.orig.ifEmpty { p.sample }
        val base = s.bases[0]
        val sid = dev.glint.core.encodeURIComponent(p.sid.ifEmpty { p.id })
        return when (s.engine) {
            "danbooru", "e621", "anime-pictures" -> base + "posts/" + sid
            "moebooru" -> base + "post/show/" + sid
            "gelbooru" -> base + "index.php?page=post&s=view&id=" + sid
            "philomena" -> base + "images/" + sid
            "eshuushuu" -> base + "image/" + sid + "/"
            else -> p.orig.ifEmpty { p.sample }
        }
    }

    fun downloadPost(id: String) {
        val p = pin(id) ?: return
        Platform.openUrl(Net.media(p.orig.ifEmpty { p.sample.ifEmpty { p.grid } }))
    }

    /* --------------------------------------------------------- settings */

    fun setCols(cols: Int) { update { it.copy(cols = cols.coerceIn(1, 3)) } }

    fun setTheme(theme: String) { update { it.copy(theme = theme) } }

    fun setMode(mode: String) {
        update { it.copy(mode = mode) }
        if (mode == "live" && livePins().isEmpty()) queueLive(reset = false)
    }

    fun setStickyTags(src: String, tags: String) {
        update { it.copy(stags = it.stags + (src to tags.trim())) }
        queueLive(reset = true)
    }

    fun setImageQuality(kind: String, value: String) {
        update {
            when (kind) {
                "feed" -> it.copy(iqFeed = value)
                "detail" -> it.copy(iqDetail = value)
                else -> it.copy(iqViewer = value)
            }
        }
    }

    fun setSwipeDirection(value: String) { update { it.copy(sw = value) } }

    fun iqURL(p: Pin, kind: String): String {
        val order = when (kind) {
            "feed" -> if (state.iqFeed == "sharp") listOf(p.sample, p.orig, p.grid) else listOf(p.grid, p.sample, p.orig)
            "detail" -> if (state.iqDetail == "orig") listOf(p.orig, p.sample, p.grid) else listOf(p.sample, p.orig, p.grid)
            else -> if (state.iqViewer == "sample") listOf(p.sample, p.orig, p.grid) else listOf(p.orig, p.sample, p.grid)
        }
        return order.firstOrNull { it.isNotEmpty() } ?: p.grid.ifEmpty { p.sample.ifEmpty { p.orig } }
    }

    fun exportBookmarks() {
        val json = Store.exportBackupJson(state, isoNow())
        Platform.saveTextFile("pinboard-bookmarks-" + isoDateOnly() + ".json", "application/json", json)
        showToast("Bookmark backup exported")
    }

    fun importBookmarks() {
        Platform.pickTextFile("application/json,.json", Store.IMPORT_LIMIT) { text ->
            if (text == null) return@pickTextFile
            try {
                val result = Store.importBackup(state, text)
                state = result.state
                save(now = true)
                showToast("Imported " + result.added + " bookmarks. Existing saves and source accounts were kept.")
            } catch (e: Throwable) {
                showToast(e.message ?: "Could not import this backup.")
            }
        }
    }

    fun resetLocalData() {
        try { Platform.storage().remove(Store.KEY) } catch (_: Throwable) {}
        state = Store.load()
        searchResults.clear(); searchDraft = ""; searchQuery = ""
        favStates.clear(); sourceLikes.clear(); exploreStates.clear(); relatedPages.clear(); tagFeeds.clear()
        showToast("Local data reset. Source account credentials were kept.")
        if (state.mode == "live") queueLive(reset = true)
    }

    private fun isoNow(): String {
        val ms = Platform.epochMillis()
        val days = ms.floorDiv(86_400_000L)
        val msOfDay = ms.mod(86_400_000L)
        // Civil-from-days (Howard Hinnant's algorithm) for the UTC date.
        val z = days + 719_468L
        val era = (if (z >= 0) z else z - 146_096L) / 146_097L
        val doe = z - era * 146_097L
        val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
        val y = yoe + era * 400
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = doy - (153 * mp + 2) / 5 + 1
        val m = if (mp < 10) mp + 3 else mp - 9
        val year = if (m <= 2) y + 1 else y
        fun p(v: Long, n: Int = 2) = v.toString().padStart(n, '0')
        val h = msOfDay / 3_600_000; val min = msOfDay / 60_000 % 60
        val sec = msOfDay / 1000 % 60; val milli = msOfDay % 1000
        return "$year-${p(m)}-${p(d)}T${p(h)}:${p(min)}:${p(sec)}.${p(milli, 3)}Z"
    }

    private fun isoDateOnly(): String {
        val d = Platform.localDate()
        val mm = d[1].toString().padStart(2, '0')
        val dd = d[2].toString().padStart(2, '0')
        return "${d[0]}-$mm-$dd"
    }

    /* -------------------------------------------------------- demo pins */

    private fun buildDemoPins(): List<Pin> {
        val cats = listOf("Anime Art", "Aesthetic", "Games", "Travel", "Lights", "Gifs")
        val titles = listOf(
            "Soft pastel portrait", "Neon alley", "Retro console", "Cherry blossom tower", "Warm lamp glow",
            "Rainy window", "Pixel sunset", "Mountain railway", "Winter lights", "Cozy bedroom", "Dreamy clouds",
            "Night market", "Floral crown", "Old arcade", "Misty forest", "City rooftop", "Paper lanterns",
            "Coastal drive", "Velvet curtains", "Snowy street",
        )
        var sd = 7L
        fun r(): Double { sd = (sd * 16807) % 2147483647; return sd.toDouble() / 2147483647 }
        val ratios = listOf(1.3, 1.05, 1.5, 0.9, 1.4)
        return (0 until 48).map { i ->
            val h = (r() * 360).toInt()
            Pin(
                id = i.toString(),
                t = titles[i % titles.size],
                c = cats[i % cats.size],
                h = h,
                h2 = (h + 50 + (r() * 80).toInt()) % 360,
                r = ratios[i % 5],
                x = (r() * 50).toInt() + 15,
            )
        }
    }
}
