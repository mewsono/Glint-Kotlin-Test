package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.glint.app.GlintStore
import dev.glint.app.Screen
import dev.glint.sources.Sources

/**
 * Top header (glint-top): serif brand, sync dot + context label on the left,
 * round action buttons on the right.
 */
@Composable
fun GlintHeader(
    store: GlintStore,
    view: String, // feed | saved | likes | explore
    actions: @Composable () -> Unit,
) {
    val colors = G.colors
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 10.dp, top = 14.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                if (view == "explore") "Explore" else "Glint",
                size = 32f,
                serif = true,
                modifier = Modifier.press { store.wantTopBump() },
            )
            if (view != "explore") {
                // Drive sync dot (glint-live)
                val ring = if (store.state.driveOn) colors.ac else colors.mu.copy(alpha = .55f)
                Box(Modifier.size(8.dp).clip(CircleShape).background(ring))
                when (view) {
                    "feed" -> {
                        val s = Sources.all[store.state.src]
                        val label = if (store.state.mode == "live") (s?.short ?: s?.name ?: "Source") else "Demo"
                        Text(label, color = colors.mu, size = 13f, weight = FontWeight.SemiBold)
                    }
                    else -> Text("Saved", color = colors.mu, size = 13f, weight = FontWeight.SemiBold)
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            actions()
        }
    }
}

/** Small filter pill with icon + label (glint-filter-btn). */
@Composable
fun FilterButton(label: String, glyph: Glyph = Glyph.Sort, onClick: () -> Unit) {
    val colors = G.colors
    Row(
        Modifier
            .clip(RoundedCornerShape(30.dp))
            .background(colors.chip)
            .press(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        GlintIcon(glyph, colors.tx, 16.dp)
        Text(label, size = 13f, weight = FontWeight.Medium)
    }
}

/** Bottom navigation: the floating glass pill with Home/Search/Profile + gear. */
@Composable
fun NavPill(store: GlintStore, modifier: Modifier = Modifier) {
    val colors = G.colors
    Row(
        modifier
            .clip(RoundedCornerShape(30.dp))
            .background(colors.nav)
            .border(1.dp, colors.line, RoundedCornerShape(30.dp))
            .padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        NavButton(Glyph.Home, "Home", store.screen == Screen.Home) { store.closeAllOverlays(); store.nav(Screen.Home) }
        NavButton(Glyph.Search, "Search", store.screen == Screen.Search) { store.closeAllOverlays(); store.nav(Screen.Search) }
        NavButton(Glyph.User, "Saved", store.screen == Screen.Profile) { store.closeAllOverlays(); store.nav(Screen.Profile) }
        NavButton(Glyph.Gear, "Settings", false) { store.push(dev.glint.app.Overlay.SettingsSheet) }
    }
}

@Composable
private fun NavButton(glyph: Glyph, label: String, on: Boolean, onClick: () -> Unit) {
    val colors = G.colors
    Box(
        Modifier
            .size(62.dp, 46.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(if (on) colors.ac else Color.Transparent)
            .press(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        GlintIcon(glyph, if (on) colors.glOn else colors.tx, 22.dp)
    }
}
