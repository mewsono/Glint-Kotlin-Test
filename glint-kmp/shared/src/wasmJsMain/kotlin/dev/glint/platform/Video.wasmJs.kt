package dev.glint.platform

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import kotlinx.browser.document
import kotlinx.browser.window
import org.w3c.dom.HTMLVideoElement

/**
 * wasm has no in-canvas media pipeline, so the player is a real HTML <video>
 * element positioned exactly over the composable's bounds — the same element
 * the PWA uses, with native streaming, controls and codecs.
 */
@Composable
actual fun VideoPlayer(
    url: String,
    modifier: Modifier,
    autoPlay: Boolean,
    loop: Boolean,
    muted: Boolean,
) {
    val video = remember {
        (document.createElement("video") as HTMLVideoElement).apply {
            controls = true
            setAttribute("playsinline", "")
            style.position = "fixed"
            style.zIndex = "30"
            style.background = "#050408"
            style.setProperty("object-fit", "contain")
            document.body?.appendChild(this)
        }
    }
    video.loop = loop
    video.muted = muted
    video.autoplay = autoPlay
    if (video.src != url) {
        video.src = url
        if (autoPlay) video.play()
    }
    DisposableEffect(Unit) {
        onDispose {
            video.pause()
            video.removeAttribute("src")
            video.remove()
        }
    }
    Box(
        modifier
            .background(Color(0xFF050408))
            .onGloballyPositioned { coords ->
                val dpr = window.devicePixelRatio
                val pos = coords.positionInRoot()
                val size = coords.size
                video.style.left = "${pos.x / dpr}px"
                video.style.top = "${pos.y / dpr}px"
                video.style.width = "${size.width / dpr}px"
                video.style.height = "${size.height / dpr}px"
            },
    )
}
