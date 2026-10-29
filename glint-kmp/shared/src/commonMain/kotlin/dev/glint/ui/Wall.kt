package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.staggeredgrid.LazyStaggeredGridState
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.rememberLazyStaggeredGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.glint.app.GlintStore
import dev.glint.model.Pin
import dev.glint.platform.isVideoURL

/** Shortest-column placement (masonry in app.js): each item joins the column
 *  with the smallest cumulative height. */
fun <T> masonryColumns(items: List<T>, cols: Int, ratio: (T) -> Float): List<List<T>> {
    val n = cols.coerceIn(1, 3)
    val columns = List(n) { ArrayList<T>() }
    val heights = FloatArray(n)
    for (item in items) {
        var best = 0
        for (i in 1 until n) if (heights[i] < heights[best]) best = i
        columns[best].add(item)
        heights[best] += ratio(item)
    }
    return columns
}

/** First finite ratio of [r, h/w], clamped like masonryRatio in app.js. */
fun pinRatio(p: Pin): Float {
    val raw = when {
        p.r > 0 -> p.r
        p.width > 0 && p.height > 0 -> p.height.toDouble() / p.width
        else -> 4.0 / 3.0
    }
    return raw.coerceIn(0.05, 20.0).toFloat()
}

/**
 * The masonry wall: shortest-column placement via LazyVerticalStaggeredGrid,
 * 6dp gaps and 10dp tile radius like the PWA grid.
 */
@Composable
fun PinWall(
    store: GlintStore,
    pins: List<Pin>,
    cols: Int,
    modifier: Modifier = Modifier,
    state: LazyStaggeredGridState = rememberLazyStaggeredGridState(),
    header: (@Composable () -> Unit)? = null,
    footer: (@Composable () -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(start = 6.dp, end = 6.dp, bottom = 120.dp),
    onOpen: (String) -> Unit = { store.openPost(it, pins.map { p -> p.id }) },
    onEndReached: (() -> Unit)? = null,
) {
    LazyVerticalStaggeredGrid(
        columns = StaggeredGridCells.Fixed(cols),
        state = state,
        modifier = modifier.fillMaxSize(),
        verticalItemSpacing = 6.dp,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = contentPadding,
    ) {
        if (header != null) {
            item(key = "__header", span = StaggeredGridItemSpan.FullLine) { header() }
        }
        items(count = pins.size, key = { pins[it].id }) { index ->
            PinCard(store, pins[index], onOpen)
        }
        if (footer != null) {
            item(key = "__footer", span = StaggeredGridItemSpan.FullLine) { footer() }
        }
    }
    if (onEndReached != null) {
        LaunchedEffect(state, pins.size) {
            snapshotFlow {
                val info = state.layoutInfo
                val last = info.visibleItemsInfo.lastOrNull()?.index ?: -1
                last >= info.totalItemsCount - (3 * cols) - 1 && info.totalItemsCount > 0
            }.collect { nearEnd -> if (nearEnd) onEndReached() }
        }
    }
}

/** One tile (pc() in app.js): artwork + save badge + like marker + video tag. */
@Composable
fun PinCard(store: GlintStore, p: Pin, onOpen: (String) -> Unit) {
    val colors = G.colors
    val saved = store.bookmarked(p.id)
    val liked = store.isRemoteLiked(p)
    val url = store.iqURL(p, "feed")
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .press { onOpen(p.id) },
    ) {
        Column {
            PinArt(
                p, url,
                Modifier.fillMaxWidth().aspectRatio(1f / pinRatio(p)),
            )
            if (p.isDemo) {
                Column(Modifier.padding(horizontal = 4.dp, vertical = 6.dp)) {
                    Text(p.t, size = 13f, weight = FontWeight.Medium, maxLines = 1)
                    Text(p.c, color = colors.mu, size = 12f, maxLines = 1)
                }
            }
        }
        // Save badge: 34px dark circle, top-right.
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .padding(6.dp)
                .size(34.dp)
                .clip(CircleShape)
                .background(colors.badge)
                .press { store.toggleBookmark(p.id) },
            contentAlignment = Alignment.Center,
        ) {
            GlintIcon(
                if (saved) Glyph.BookmarkFill else Glyph.Bookmark,
                if (saved) colors.ac else androidx.compose.ui.graphics.Color.White,
                17.dp,
            )
        }
        if (liked) {
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(8.dp)
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(colors.badge),
                contentAlignment = Alignment.Center,
            ) {
                GlintIcon(Glyph.HeartFill, androidx.compose.ui.graphics.Color(0xFFFF6B81), 13.dp)
            }
        }
        if (isVideoURL(p.orig)) {
            Row(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(colors.badge)
                    .padding(horizontal = 7.dp, vertical = 3.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                GlintIcon(Glyph.Play, androidx.compose.ui.graphics.Color.White, 10.dp)
                Text("VIDEO", color = androidx.compose.ui.graphics.Color.White, size = 10f, weight = FontWeight.SemiBold)
            }
        }
    }
}
