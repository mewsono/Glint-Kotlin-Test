package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.glint.app.GlintStore
import dev.glint.app.Overlay
import dev.glint.model.Pin
import dev.glint.sources.Accounts
import dev.glint.sources.Sources

@Composable
fun SavedScreen(store: GlintStore) {
    val tab = store.state.bt.takeIf { it in store.savedTabs() } ?: "Bookmarks"
    when (tab) {
        "Likes" -> LikesPane(store)
        "Explore" -> ExplorePane(store)
        else -> BookmarksPane(store)
    }
}

@Composable
fun SavedTabsRow(store: GlintStore) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        store.savedTabs().forEach { t ->
            Chip(t, on = store.state.bt == t) { store.setSavedTab(t) }
        }
    }
}

/* ------------------------------------------------------------ bookmarks */

@Composable
fun BookmarksPane(store: GlintStore) {
    val colors = G.colors
    val rows = store.bookmarkRows()
    val sources = store.bookmarkSourceOptions(rows)
    if (store.bookmarkSource != "all" && sources.none { it.first == store.bookmarkSource }) {
        store.bookmarkSource = "all"
    }
    val visible = store.visibleBookmarkRows(rows)
    val pins = visible.map { row ->
        row.p ?: Pin(id = row.record.id, t = "Saved post", r = 1.0)
    }
    val selected = sources.firstOrNull { it.first == store.bookmarkSource }
    val oldest = store.bookmarkOrder == "oldest"

    PinWall(
        store = store,
        pins = pins,
        cols = store.state.cols,
        header = {
            Column(Modifier.fillMaxWidth()) {
                GlintHeader(store, "saved") {
                    FilterButton(if (oldest) "Old" else "New") {
                        store.bookmarkOrder = if (oldest) "newest" else "oldest"
                    }
                    FilterButton(selected?.second ?: "All", Glyph.Chevron) { store.push(Overlay.SavedSourcesSheet) }
                    HeaderIconButton(Glyph.Search, "Search bookmarks") {
                        store.bookmarkSearchOpen = !store.bookmarkSearchOpen
                        if (!store.bookmarkSearchOpen) store.bookmarkQuery = ""
                    }
                }
                SavedTabsRow(store)
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("${visible.size} " + if (visible.size == 1) "bookmark" else "bookmarks", size = 16f, weight = FontWeight.SemiBold)
                        Text(
                            if (store.bookmarkSearchNormalize(store.bookmarkQuery).isNotEmpty()) "Search results" else "Saved on this device",
                            color = colors.mu, size = 12f,
                        )
                    }
                }
                if (store.bookmarkSearchOpen) {
                    SearchField(
                        value = store.bookmarkQuery,
                        placeholder = "Search bookmarks",
                        onChange = { store.bookmarkQuery = it },
                        onSubmit = {},
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp),
                        onClear = { store.bookmarkQuery = "" },
                    )
                }
            }
        },
        footer = {
            if (pins.isEmpty()) {
                if (store.bookmarkSearchNormalize(store.bookmarkQuery).isNotEmpty()) {
                    Empty("No bookmarks match \u201C${store.bookmarkQuery.trim()}\u201D.\nTry another search or source.")
                } else {
                    Empty("No bookmarks yet.\nTap the bookmark icon on a post to save it here.")
                }
            }
        },
    )
}

/* ---------------------------------------------------------------- likes */

@Composable
fun LikesPane(store: GlintStore) {
    val colors = G.colors
    val src = store.state.src
    val f = store.favState(src)
    LaunchedEffect(src, Accounts.authVersion(src)) {
        if (f.pins.isEmpty() && !f.busy && f.err.isEmpty()) store.loadFavorites(reset = true)
    }
    val searching = store.likesApiQuery().isNotEmpty()
    val pins = if (searching) store.likesApiPins.toList() else f.pins.toList()

    PinWall(
        store = store,
        pins = pins,
        cols = store.state.cols,
        header = {
            Column(Modifier.fillMaxWidth()) {
                GlintHeader(store, "likes") {
                    FilterButton(if (f.order == "oldest") "Old" else "New") { store.toggleFavOrder() }
                    HeaderIconButton(Glyph.Search, "Search likes") {
                        store.likesSearchOpen = !store.likesSearchOpen
                        if (!store.likesSearchOpen) store.submitLikesSearch("")
                    }
                }
                SavedTabsRow(store)
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("Likes on " + (Sources.all[src]?.name ?: src), size = 16f, weight = FontWeight.SemiBold)
                        Text(store.likesSearchCountLabel(), color = colors.mu, size = 12f)
                    }
                }
                if (store.likesSearchOpen) {
                    SearchField(
                        value = store.likesSearchDraft,
                        placeholder = "Search your likes",
                        onChange = { store.likesSearchDraft = it },
                        onSubmit = { store.submitLikesSearch(it) },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp),
                        onClear = { store.submitLikesSearch("") },
                    )
                }
                if (searching && store.likesApiError.isNotEmpty()) {
                    FeedError(store.likesApiError) { store.submitLikesSearch(store.likesSearchDraft) }
                } else if (!searching && f.err.isNotEmpty()) {
                    FeedError(f.err) { store.loadFavorites(reset = f.pins.isEmpty()) }
                }
            }
        },
        footer = {
            Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                when {
                    (if (searching) store.likesApiBusy else f.busy) -> Spinner()
                    pins.isEmpty() && (if (searching) store.likesApiError else f.err).isEmpty() ->
                        Empty(if (searching) "No likes match this search." else "No likes here yet.")
                    (if (searching) store.likesApiMore else !f.done) ->
                        RetrySpinButton("More") {
                            if (searching) store.scope.launchLikesMore(store) else store.loadFavorites(reset = false)
                        }
                    else -> {}
                }
            }
        },
        onEndReached = {
            if (searching) { if (!store.likesApiBusy && store.likesApiMore) store.scope.launchLikesMore(store) }
            else if (!f.busy && !f.done && f.err.isEmpty()) store.loadFavorites(reset = false)
        },
    )
}

private fun kotlinx.coroutines.CoroutineScope.launchLikesMore(store: GlintStore) {
    kotlinx.coroutines.launch { store.loadLikesApiSearch() }
}

/* -------------------------------------------------------------- explore */

@Composable
fun ExplorePane(store: GlintStore) {
    val colors = G.colors
    val src = store.state.src
    LaunchedEffect(src) { store.ensureExplore() }
    val sections = Sources.exploreSections(src)

    Column(Modifier.fillMaxWidth()) {
        PinWall(
            store = store,
            pins = emptyList(),
            cols = 1,
            header = {
                Column(Modifier.fillMaxWidth()) {
                    GlintHeader(store, "explore") {}
                    SavedTabsRow(store)
                    if (sections.isEmpty()) {
                        Empty("Explore is not available on " + (Sources.all[src]?.name ?: src) + " yet.")
                    }
                    sections.forEach { section ->
                        val st = store.exploreStates[section.key]
                        Column(Modifier.fillMaxWidth().padding(top = 14.dp)) {
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(section.title, size = 18f, weight = FontWeight.SemiBold)
                                    if (section.note.isNotEmpty()) Text(section.note, color = colors.mu, size = 12f)
                                }
                            }
                            if (section.scales.size > 1) {
                                Row(
                                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    section.scales.forEach { scale ->
                                        Chip(
                                            Sources.EX_SCALE_LABEL[scale] ?: scale,
                                            on = (st?.scale ?: section.def) == scale,
                                        ) { store.loadExploreSection(section.key, scale = scale) }
                                    }
                                }
                            }
                            when {
                                st == null || (st.busy && st.pins.isEmpty()) ->
                                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { Spinner() }
                                st.error.isNotEmpty() && st.pins.isEmpty() ->
                                    FeedError(st.error) { store.loadExploreSection(section.key, scale = st.scale) }
                                st.pins.isEmpty() -> Empty("Nothing here for this period.")
                                else -> ExploreGrid(store, st.pins.toList())
                            }
                            if (st != null && st.pins.isNotEmpty() && section.paged && !st.done) {
                                Box(Modifier.fillMaxWidth().padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                                    if (st.busy) Spinner() else RetrySpinButton("More") { store.loadExploreSection(section.key, more = true) }
                                }
                            }
                            Hairline(Modifier.padding(top = 12.dp))
                        }
                    }
                }
            },
        )
    }
}

/** Compact two-column static grid for explore sections. */
@Composable
fun ExploreGrid(store: GlintStore, pins: List<Pin>) {
    val context = pins.map { it.id }
    Column(Modifier.fillMaxWidth().padding(horizontal = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // Shortest-column masonry (sections hold ≤ ~48 pins, no laziness needed).
        val columns = masonryColumns(pins, 2) { pinRatio(it) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            columns.forEach { column ->
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    column.forEach { p -> PinCard(store, p) { id -> store.openPost(id, context) } }
                }
            }
        }
    }
}
