package dev.glint.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/** Streaming video through Media3/ExoPlayer, equivalent to the PWA <video>. */
@Composable
actual fun VideoPlayer(
    url: String,
    modifier: Modifier,
    autoPlay: Boolean,
    loop: Boolean,
    muted: Boolean,
) {
    AndroidView(
        factory = { context ->
            val player = ExoPlayer.Builder(context).build().apply {
                setMediaItem(MediaItem.fromUri(url))
                repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
                volume = if (muted) 0f else 1f
                playWhenReady = autoPlay
                prepare()
            }
            PlayerView(context).apply {
                this.player = player
                useController = true
                tag = player
            }
        },
        update = { view ->
            val player = view.tag as? ExoPlayer ?: return@AndroidView
            val current = player.currentMediaItem?.localConfiguration?.uri?.toString()
            if (current != url) {
                player.setMediaItem(MediaItem.fromUri(url))
                player.prepare()
                if (autoPlay) player.play()
            }
        },
        onRelease = { view -> (view.tag as? ExoPlayer)?.release() },
        modifier = modifier,
    )
}
