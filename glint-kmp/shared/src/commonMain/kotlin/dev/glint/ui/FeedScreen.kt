package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.glint.app.GlintStore
import dev.glint.app.Screen

@Composable
fun FeedScreen(store: GlintStore) {
    val colors = G.colors
    val live = store.state.mode == "live"
    val pins = if (live) {
        store.livePins().filter { (it.src.isEmpty() || it.src == store.state.src) && it.id !in store.state.hidden }
    } else {
        store.state.custom + store.demoPins
    }
    val grid = rememberLazyStaggeredGridState()
    LaunchedEffect(store.wantTop) { if (store.wantTop > 0) grid.animateScrollToItem(0) }
    LaunchedEffect(store.state.src, store.state.mode) {
        if (live && pins.isEmpty() && !store.feedStatus.loading && store.feedStatus.error.isEmpty()) {
            store.queueLive(reset = false)
        }
    }

    PinWall(
        store = store,
        pins = pins,
        cols = store.state.cols,
        state = grid,
        header = {
            GlintHeader(store, "feed") {
                HeaderIconButton(Glyph.Search, "Search") { store.nav(Screen.Search) }
                HeaderIconButton(Glyph.Columns, "Explore") {
                    store.nav(Screen.Profile)
                    store.setSavedTab("Explore")
                }
            }
        },
        footer = {
            Column(Modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                val error = store.feedStatus.error
                when {
                    !live -> if (pins.isEmpty()) Empty("Nothing here yet.\nLike or save pins and they will show up.")
                    error.isNotEmpty() -> FeedError(error) { store.feedMore() }
                    store.feedStatus.loading -> Spinner()
                    store.feedStatus.more -> RetrySpinButton("Load more posts") { store.feedMore() }
                    pins.isEmpty() -> Empty("No posts found.")
                }
            }
        },
        onEndReached = if (live) ({ if (store.feedStatus.error.isEmpty()) store.feedMore() }) else null,
    )
}

@Composable
fun FeedError(message: String, onRetry: () -> Unit) {
    val colors = G.colors
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(colors.chip)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(message, color = colors.mu, size = 14f, align = androidx.compose.ui.text.style.TextAlign.Center)
        Chip("Retry", onClick = onRetry)
    }
}

/** Idle "tap to load more" ring, like SPIN_IDLE. */
@Composable
fun RetrySpinButton(label: String, onClick: () -> Unit) {
    val colors = G.colors
    Box(
        Modifier
            .clip(RoundedCornerShape(30.dp))
            .background(colors.chip)
            .press(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GlintIcon(Glyph.Chevron, colors.mu, 15.dp)
            Text("More", color = colors.tx, size = 14f, weight = FontWeight.Medium)
        }
    }
}
