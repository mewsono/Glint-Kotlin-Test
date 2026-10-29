package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import coil3.ImageLoader
import coil3.compose.setSingletonImageLoaderFactory
import coil3.network.ktor3.KtorNetworkFetcherFactory
import dev.glint.app.GlintStore
import dev.glint.app.Overlay
import dev.glint.app.Screen
import dev.glint.core.Platform

/** Root of the whole app — identical composables on Android and web. */
@Composable
fun GlintApp(storeFactory: (kotlinx.coroutines.CoroutineScope) -> GlintStore = { GlintStore(it) }) {
    val scope = rememberCoroutineScope()
    val store = remember { storeFactory(scope) }
    setSingletonImageLoaderFactory { context ->
        ImageLoader.Builder(context)
            .components { add(KtorNetworkFetcherFactory(Platform.httpClient())) }
            .build()
    }
    GlintTheme(store.state.theme) {
        val colors = G.colors
        Box(Modifier.fillMaxSize().background(colors.bg)) {
            // Main screen
            when (store.screen) {
                Screen.Home -> FeedScreen(store)
                Screen.Search -> SearchScreen(store)
                Screen.Profile -> SavedScreen(store)
            }
            // Overlay stack (detail pages, viewers, sheets) in order.
            store.overlays.forEach { overlay ->
                when (overlay) {
                    is Overlay.PostDetail -> PostDetailPage(store, overlay)
                    is Overlay.ImageViewer -> ImageViewerPage(store, overlay)
                    is Overlay.RelatedPage -> RelatedPageView(store, overlay)
                    is Overlay.TagFeed -> TagFeedPage(store, overlay)
                    Overlay.SettingsSheet -> SettingsSheet(store)
                    Overlay.SourcesSheet -> SourcesSheet(store)
                    Overlay.AccountsSheet -> AccountsSheet(store)
                    is Overlay.AccountEdit -> AccountEditSheet(store, overlay)
                    is Overlay.SourceInfo -> SourceInfoSheet(store, overlay)
                    is Overlay.CustomSourceSheet -> CustomSourceSheet(store, overlay)
                    Overlay.LibrarySheet -> LibrarySheet(store)
                    Overlay.AdvancedSheet -> AdvancedSheet(store)
                    Overlay.SavedSourcesSheet -> SavedSourcesSheet(store)
                    is Overlay.ConfirmDeleteSource -> ConfirmDeleteSheet(store, overlay)
                    Overlay.LikesSearchSheet -> {}
                }
            }
            // Bottom nav pill — hidden under full-screen media pages, like the PWA.
            val top = store.overlays.lastOrNull()
            val hideNav = top is Overlay.ImageViewer || top is Overlay.PostDetail ||
                top is Overlay.RelatedPage || top is Overlay.TagFeed
            if (!hideNav) {
                NavPill(store, Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp))
            }
            // Toast
            if (store.toast.isNotEmpty()) {
                Box(
                    Modifier.align(Alignment.BottomCenter).padding(bottom = 86.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(colors.chip)
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Text(store.toast, size = 13.5f)
                }
            }
        }
    }
}
