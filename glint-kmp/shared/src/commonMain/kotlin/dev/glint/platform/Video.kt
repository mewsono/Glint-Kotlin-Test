package dev.glint.platform

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

val VIDEO_EXTENSIONS = listOf("mp4", "webm", "mov", "mkv", "m4v")

fun isVideoURL(url: String): Boolean {
    val clean = url.substringBefore('?').substringBefore('#').lowercase()
    return VIDEO_EXTENSIONS.any { clean.endsWith(".$it") }
}

/**
 * Streaming video player: ExoPlayer/Media3 on Android, an HTML `<video>`
 * element overlaid on the canvas on wasm.
 */
@Composable
expect fun VideoPlayer(
    url: String,
    modifier: Modifier,
    autoPlay: Boolean,
    loop: Boolean,
    muted: Boolean,
)
