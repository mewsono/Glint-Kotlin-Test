package dev.glint.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import dev.glint.resources.Res
import dev.glint.resources.figtree_medium
import dev.glint.resources.figtree_regular
import dev.glint.resources.figtree_semibold
import dev.glint.resources.instrument_serif
import org.jetbrains.compose.resources.Font as ResourceFont

/** Design tokens lifted from glint-theme.css. */
class GlintColors(
    val bg: Color,
    val tx: Color,
    val mu: Color,
    val chip: Color,
    val nav: Color,
    val ph: Color,
    val sh: Color,
    val ac: Color,
    val line: Color,
    val glOn: Color,
    val isDark: Boolean,
) {
    /** Save badge scrim (same in both themes). */
    val badge = Color(0x6B08060C)
    val viewerBg = Color(0xFF050408)
    val infoPanel = Color(0xF017151C)
    val danger = Color(0xFFE2574E)
}

val DarkColors = GlintColors(
    bg = Color(0xFF0B0A0E),
    tx = Color(0xFFF3F0F5),
    mu = Color(0xFF8E8895),
    chip = Color(0xFF211E27),
    nav = Color(0xC71E1B26),
    ph = Color(0xFF17151C),
    sh = Color(0xFF17151C),
    ac = Color(0xFFF3C25E),
    line = Color(0x19FFFFFF),
    glOn = Color(0xFF2A1C00),
    isDark = true,
)

val LightColors = GlintColors(
    bg = Color(0xFFF2F0ED),
    tx = Color(0xFF16141A),
    mu = Color(0xFF6B6570),
    chip = Color(0xFFE7E3DE),
    nav = Color(0xD1FFFFFF),
    ph = Color(0xFFE7E3DE),
    sh = Color(0xFFFFFFFF),
    ac = Color(0xFF805000),
    line = Color(0x1C16141A),
    glOn = Color(0xFFFFFFFF),
    isDark = false,
)

val LocalColors = staticCompositionLocalOf { DarkColors }
val LocalBodyFont = staticCompositionLocalOf<FontFamily> { FontFamily.Default }
val LocalSerifFont = staticCompositionLocalOf<FontFamily> { FontFamily.Serif }

object G {
    val colors: GlintColors
        @Composable get() = LocalColors.current
    val body: FontFamily
        @Composable get() = LocalBodyFont.current
    val serif: FontFamily
        @Composable get() = LocalSerifFont.current
}

@Composable
fun figtreeFamily(): FontFamily = FontFamily(
    ResourceFont(Res.font.figtree_regular, weight = FontWeight.Normal),
    ResourceFont(Res.font.figtree_medium, weight = FontWeight.Medium),
    ResourceFont(Res.font.figtree_semibold, weight = FontWeight.SemiBold),
)

@Composable
fun instrumentSerifFamily(): FontFamily = FontFamily(
    ResourceFont(Res.font.instrument_serif, weight = FontWeight.Normal),
)

@Composable
fun GlintTheme(theme: String, content: @Composable () -> Unit) {
    val dark = when (theme) {
        "light" -> false
        "dark" -> true
        else -> isSystemInDarkTheme()
    }
    val colors = if (dark) DarkColors else LightColors
    androidx.compose.runtime.CompositionLocalProvider(
        LocalColors provides colors,
        LocalBodyFont provides figtreeFamily(),
        LocalSerifFont provides instrumentSerifFamily(),
        content = content,
    )
}
