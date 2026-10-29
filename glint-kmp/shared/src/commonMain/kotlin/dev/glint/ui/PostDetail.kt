package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.glint.app.GlintStore
import dev.glint.app.Overlay
import dev.glint.app.fileSizeLabel
import dev.glint.app.postRating
import dev.glint.app.postTagGroups
import dev.glint.app.uploadTimeLabel
import dev.glint.model.Pin
import dev.glint.platform.VideoPlayer
import dev.glint.platform.isVideoURL
import dev.glint.sources.Net
import dev.glint.sources.Sources
import dev.glint.sources.displayName

/** Horizontal swipe → next/previous post in the opening context. */
private fun Modifier.postSwipe(store: GlintStore, id: String): Modifier =
    pointerInput(id, store.state.sw) {
        var total = 0f
        detectHorizontalDragGestures(
            onDragStart = { total = 0f },
            onDragEnd = {
                if (kotlin.math.abs(total) > 70f) {
                    val target = store.swipeAdvance(id, towardStart = total < 0)
                    if (target != null) store.replaceTopDetail(target)
                }
            },
        ) { _, dragAmount -> total += dragAmount }
    }

/** Full-page post details: media, actions, info panel, tags, related. */
@Composable
fun PostDetailPage(store: GlintStore, overlay: Overlay.PostDetail) {
    val colors = G.colors
    val p = store.pin(overlay.pinId)
    var showInfo by remember(overlay.pinId) { mutableStateOf(overlay.showInfo) }
    Box(Modifier.fillMaxSize().background(colors.bg)) {
        if (p == null) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("This post is no longer available.", color = colors.mu)
                Chip("Back") { store.pop() }
            }
            return@Box
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).postSwipe(store, p.id)) {
            // Top bar
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HeaderIconButton(Glyph.Back, "Back") { store.pop() }
                Box(Modifier.weight(1f))
                HeaderIconButton(Glyph.Dots, "More") { showInfo = !showInfo }
            }
            // Media (contain-fit through the natural aspect ratio).
            val url = store.iqURL(p, "detail")
            Box(
                Modifier.fillMaxWidth().padding(horizontal = 10.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .press { store.push(Overlay.ImageViewer(p.id)) },
            ) {
                if (isVideoURL(p.orig)) {
                    VideoPlayer(
                        url = Net.media(p.orig),
                        modifier = Modifier.fillMaxWidth().aspectRatio(1f / pinRatio(p)),
                        autoPlay = true, loop = true, muted = false,
                    )
                } else {
                    PinArt(p, url, Modifier.fillMaxWidth().aspectRatio(1f / pinRatio(p)), ContentScale.Fit)
                }
                // Floating bookmark
                val saved = store.bookmarked(p.id)
                Box(
                    Modifier.align(Alignment.TopEnd).padding(10.dp).size(40.dp)
                        .clip(CircleShape).background(colors.badge)
                        .press { store.toggleBookmark(p.id) },
                    contentAlignment = Alignment.Center,
                ) {
                    GlintIcon(if (saved) Glyph.BookmarkFill else Glyph.Bookmark, if (saved) colors.ac else Color.White, 19.dp)
                }
            }
            // Title + source
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                if (p.t.isNotEmpty()) Text(p.t, size = 18f, weight = FontWeight.SemiBold, maxLines = 2)
                val srcLabel = p.srcName.ifEmpty { Sources.all[p.src]?.name ?: "" }
                if (srcLabel.isNotEmpty()) Text(srcLabel + (if (p.author.isNotEmpty()) " · " + p.author else ""), color = colors.mu, size = 13f)
            }
            // Action row: like (when supported), share, download, info.
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (store.canLikePost(p)) {
                    val likeState = store.remoteLikeState(p)
                    val liked = likeState.known && likeState.liked
                    ActionButton(
                        if (liked) Glyph.HeartFill else Glyph.Heart,
                        if (liked) "Liked" else "Like",
                        busy = likeState.busy,
                        tint = if (liked) Color(0xFFFF6B81) else colors.tx,
                    ) { store.toggleSourceLike(p) }
                }
                ActionButton(Glyph.Share, "Share") { store.sharePost(p.id) }
                ActionButton(Glyph.Download, "Save file") { store.downloadPost(p.id) }
                ActionButton(Glyph.Info, "Info") { showInfo = !showInfo }
            }
            if (showInfo) PostInfoPanel(store, p)
            // Tags
            postTagGroups(p).forEach { group ->
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(group.label, size = 14f, weight = FontWeight.SemiBold)
                        Text(group.tags.size.toString(), color = colors.mu, size = 12f)
                    }
                    FlowTags(store, p, group.key, group.tags)
                }
            }
            if (!p.detailsReady && p.src.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().padding(14.dp), contentAlignment = Alignment.Center) { Spinner(20.dp) }
            }
            // Related art entry
            if (p.src.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().padding(16.dp)) {
                    Chip("Related art", leading = { GlintIcon(Glyph.Image, if (false) colors.glOn else colors.tx, 16.dp) }) {
                        store.openRelated(p.id)
                    }
                }
            }
            Box(Modifier.fillMaxWidth().padding(bottom = 40.dp))
        }
    }
}

@Composable
private fun ActionButton(glyph: Glyph, label: String, busy: Boolean = false, tint: Color = G.colors.tx, onClick: () -> Unit) {
    val colors = G.colors
    Row(
        Modifier.clip(RoundedCornerShape(30.dp)).background(colors.chip)
            .press(enabled = !busy, onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (busy) Spinner(15.dp) else GlintIcon(glyph, tint, 16.dp)
        Text(label, size = 13f, weight = FontWeight.Medium)
    }
}

/** The dark slide-up info panel with file facts (post-file-grid). */
@Composable
fun PostInfoPanel(store: GlintStore, p: Pin) {
    val colors = G.colors
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (colors.isDark) colors.infoPanel else colors.sh)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val rating = postRating(p)
        val resolution = if (p.width > 0 && p.height > 0) "${p.width} × ${p.height} px" else "Not provided"
        InfoRow("Size", fileSizeLabel(p.fileSize))
        InfoRow("Resolution", resolution)
        InfoRow("File type", p.fileType.ifEmpty { "Not provided" })
        InfoRow("Rating", rating.label)
        InfoRow("Uploaded", uploadTimeLabel(p.uploadedAt))
        if (p.score != 0) InfoRow("Score", p.score.toString())
        if (p.sourceLinks.isNotEmpty()) {
            Hairline()
            p.sourceLinks.forEach { link ->
                Row(
                    Modifier.fillMaxWidth().press { dev.glint.core.Platform.openUrl(link.url) }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    GlintIcon(Glyph.Link, colors.mu, 15.dp)
                    Text(link.name.ifEmpty { link.platform }, size = 13f, modifier = Modifier.weight(1f), maxLines = 1)
                    GlintIcon(Glyph.External, colors.mu, 14.dp)
                }
            }
        }
        Row(Modifier.fillMaxWidth().press { dev.glint.core.Platform.openUrl(store.postLink(p)) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GlintIcon(Glyph.External, colors.mu, 15.dp)
            Text("Open on " + (Sources.all[p.src]?.name ?: "source"), color = colors.mu, size = 13f)
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    val colors = G.colors
    Row(Modifier.fillMaxWidth()) {
        Text(label, color = colors.mu, size = 13f, modifier = Modifier.weight(.38f))
        Text(value, size = 13f, weight = FontWeight.Medium, modifier = Modifier.weight(.62f))
    }
}

/** Wrapping tag chips; tapping opens a tag feed. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun FlowTags(store: GlintStore, p: Pin, kind: String, tags: List<String>) {
    val colors = G.colors
    androidx.compose.foundation.layout.FlowRow(
        Modifier.fillMaxWidth().padding(top = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        tags.take(80).forEach { tag ->
            Box(
                Modifier.clip(RoundedCornerShape(30.dp)).background(colors.chip)
                    .press { store.openPostTag(p, kind, tag) }
                    .padding(horizontal = 11.dp, vertical = 7.dp),
            ) {
                Text(displayName(tag), size = 12.5f, maxLines = 1)
            }
        }
    }
}

/** Full-screen viewer: dark background, contain fit, swipe navigation. */
@Composable
fun ImageViewerPage(store: GlintStore, overlay: Overlay.ImageViewer) {
    val colors = G.colors
    val p = store.pin(overlay.pinId) ?: run { store.pop(); return }
    Box(
        Modifier.fillMaxSize().background(colors.viewerBg).postSwipe(store, p.id)
            .press { store.pop() },
        contentAlignment = Alignment.Center,
    ) {
        if (isVideoURL(p.orig)) {
            VideoPlayer(
                url = Net.media(p.orig),
                modifier = Modifier.fillMaxWidth().aspectRatio(1f / pinRatio(p)),
                autoPlay = true, loop = true, muted = false,
            )
        } else {
            PinArt(p, store.iqURL(p, "viewer"), Modifier.fillMaxSize(), ContentScale.Fit)
        }
        Box(Modifier.align(Alignment.TopStart).padding(12.dp)) {
            HeaderIconButton(Glyph.Close, "Close") { store.pop() }
        }
    }
}
