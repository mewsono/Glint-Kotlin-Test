package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.glint.app.GlintStore
import dev.glint.app.Overlay
import dev.glint.sources.Sources
import dev.glint.sources.displayName

/** "Related art" page: one group per character/artist/series tag. */
@Composable
fun RelatedPageView(store: GlintStore, overlay: Overlay.RelatedPage) {
    val colors = G.colors
    val p = store.pin(overlay.pinId)
    Box(Modifier.fillMaxSize().background(colors.bg)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                HeaderIconButton(Glyph.Back, "Back to post") { store.pop() }
                Text("Related art", size = 22f, serif = true)
            }
            if (p == null) {
                Empty("This post is no longer available.")
                return@Column
            }
            val page = store.relatedPage(p)
            LaunchedEffect(page) {
                page.groups.forEach { g -> if (!g.loaded && !g.busy && g.tag.isNotEmpty()) store.loadRelatedGroup(page, g) }
            }
            if (!p.detailsReady && page.groups.all { it.tag.isEmpty() }) {
                Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) { Spinner() }
                Empty("Reading this post's tags…")
            }
            page.groups.filter { it.tag.isNotEmpty() }.forEach { group ->
                Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(store.relatedHeading(group), size = 17f, weight = FontWeight.SemiBold, maxLines = 1)
                            Text(group.title, color = colors.mu, size = 12f)
                        }
                        Chip("Open feed") {
                            val f = store.tagFeed(page.src, group.kind, group.tag, group.query, parentId = p.id)
                            if (f != null) {
                                store.push(Overlay.TagFeed(f.key))
                                if (!f.loaded) store.loadTagFeed(f)
                            }
                        }
                    }
                    when {
                        group.busy && group.items.isEmpty() ->
                            Box(Modifier.fillMaxWidth().padding(18.dp), contentAlignment = Alignment.Center) { Spinner() }
                        group.error && group.items.isEmpty() ->
                            FeedError("Could not load this group.") { store.loadRelatedGroup(page, group) }
                        group.loaded && group.items.isEmpty() ->
                            Empty("No other posts share this tag.")
                        else -> {
                            val shown = group.items.take(maxOf(group.shown, 5))
                            ExploreGrid(store, shown)
                            if (group.items.size > shown.size || !group.done) {
                                Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                                    if (group.busy) Spinner() else RetrySpinButton("More") {
                                        group.shown += 10
                                        if (group.items.size < group.shown && !group.done) store.loadRelatedGroup(page, group, more = true)
                                    }
                                }
                            }
                        }
                    }
                    Hairline(Modifier.padding(top = 10.dp))
                }
            }
            Box(Modifier.padding(bottom = 40.dp))
        }
    }
}

/** A full tag feed page with order chips and count. */
@Composable
fun TagFeedPage(store: GlintStore, overlay: Overlay.TagFeed) {
    val colors = G.colors
    val f = store.tagFeeds[overlay.key]
    Box(Modifier.fillMaxSize().background(colors.bg)) {
        if (f == null) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("This feed is no longer available.", color = colors.mu)
                Chip("Back") { store.pop() }
            }
            return@Box
        }
        LaunchedEffect(f.key) { if (!f.loaded && !f.busy) store.loadTagFeed(f) }
        PinWall(
            store = store,
            pins = f.pins,
            cols = store.state.cols,
            header = {
                Column(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        HeaderIconButton(Glyph.Back, "Back") { store.pop() }
                        Column(Modifier.weight(1f)) {
                            Text(displayName(f.tag), size = 20f, serif = true, maxLines = 1)
                            Text(
                                f.title + " on " + (Sources.all[f.src]?.name ?: f.src) +
                                    (f.total?.let { " · $it posts" } ?: ""),
                                color = colors.mu, size = 12f, maxLines = 1,
                            )
                        }
                    }
                    val orders = store.tagFeedOrders(f.src)
                    if (orders.size > 1) {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            orders.forEach { order ->
                                Chip(
                                    when (order) { "popularity" -> "Popular"; "oldest" -> "Oldest"; else -> "Newest" },
                                    on = f.order == order,
                                ) { store.applyTagFeedOrder(f, order) }
                            }
                        }
                    }
                    if (f.err.isNotEmpty()) FeedError(f.err) { store.loadTagFeed(f) }
                }
            },
            footer = {
                Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                    when {
                        f.busy -> Spinner()
                        f.pins.isEmpty() && f.loaded && f.err.isEmpty() -> Empty("No posts carry this tag.")
                        !f.done -> RetrySpinButton("More") { store.loadTagFeed(f) }
                        f.confirmedEnd -> Text("End of this feed.", color = colors.mu, size = 13f)
                        else -> {}
                    }
                }
            },
            onEndReached = { if (!f.busy && !f.done && f.err.isEmpty()) store.loadTagFeed(f) },
        )
    }
}
