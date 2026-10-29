package dev.glint.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import dev.glint.model.Pin
import dev.glint.sources.Net

/** Click without ripple — the PWA has no material ripples. */
fun Modifier.press(enabled: Boolean = true, onClick: () -> Unit): Modifier =
    this.then(
        Modifier.clickable(
            interactionSource = MutableInteractionSource(),
            indication = null,
            enabled = enabled,
            onClick = onClick,
        ),
    )

/** HSL → Color (demo pins use hsl() gradients exactly like styles.css). */
fun hsl(h: Float, s: Float, l: Float): Color {
    val c = (1f - kotlin.math.abs(2 * l - 1f)) * s
    val hp = ((h % 360f) + 360f) % 360f / 60f
    val x = c * (1f - kotlin.math.abs(hp % 2f - 1f))
    val (r1, g1, b1) = when {
        hp < 1f -> Triple(c, x, 0f)
        hp < 2f -> Triple(x, c, 0f)
        hp < 3f -> Triple(0f, c, x)
        hp < 4f -> Triple(0f, x, c)
        hp < 5f -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    val m = l - c / 2f
    return Color(r1 + m, g1 + m, b1 + m)
}

fun demoBrush(p: Pin): Brush = Brush.linearGradient(
    listOf(
        hsl(p.h.toFloat(), .62f, .62f),
        hsl(p.h2.toFloat(), .58f, .48f),
    ),
)

/** A pin's artwork: network image, or the demo gradient when it has no media. */
@Composable
fun PinArt(p: Pin, url: String, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop) {
    val colors = G.colors
    if (p.isDemo || url.isEmpty()) {
        Box(modifier.background(demoBrush(p)))
    } else {
        AsyncImage(
            model = Net.img(url),
            contentDescription = p.t.ifEmpty { "Artwork" },
            modifier = modifier.background(colors.ph),
            contentScale = contentScale,
        )
    }
}

/** The rotating loader ring (PWA SPIN). */
@Composable
fun Spinner(size: Dp = 26.dp, modifier: Modifier = Modifier) {
    val colors = G.colors
    val transition = rememberInfiniteTransition()
    val angle by transition.animateFloat(
        0f, 360f,
        infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart),
    )
    androidx.compose.foundation.Canvas(modifier.size(size).rotate(angle)) {
        drawArc(
            color = colors.mu,
            startAngle = 0f,
            sweepAngle = 270f,
            useCenter = false,
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = this.size.minDimension / 9f, cap = androidx.compose.ui.graphics.StrokeCap.Round),
        )
    }
}

/** Pill chip (class="chip"), optionally lit (class="chip on"). */
@Composable
fun Chip(
    label: String,
    on: Boolean = false,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
) {
    val colors = G.colors
    Row(
        modifier
            .clip(RoundedCornerShape(30.dp))
            .background(if (on) colors.ac else colors.chip)
            .press(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        leading?.invoke()
        Text(
            label,
            color = if (on) colors.glOn else colors.tx,
            size = 14.sp.value,
            weight = FontWeight.Medium,
        )
    }
}

/** Body text helper using the Figtree family. */
@Composable
fun Text(
    value: String,
    color: Color = G.colors.tx,
    size: Float = 15f,
    weight: FontWeight = FontWeight.Normal,
    maxLines: Int = Int.MAX_VALUE,
    modifier: Modifier = Modifier,
    serif: Boolean = false,
    lineHeight: Float = 0f,
    align: androidx.compose.ui.text.style.TextAlign? = null,
) {
    androidx.compose.foundation.text.BasicText(
        text = value,
        modifier = modifier,
        style = TextStyle(
            color = color,
            fontSize = size.sp,
            fontWeight = weight,
            fontFamily = if (serif) G.serif else G.body,
            lineHeight = if (lineHeight > 0f) lineHeight.sp else androidx.compose.ui.unit.TextUnit.Unspecified,
            textAlign = align ?: androidx.compose.ui.text.style.TextAlign.Start,
        ),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

/** Segmented control (glint-seg): equal buttons in a chip-coloured track. */
@Composable
fun Seg(options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit) {
    val colors = G.colors
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.chip)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for ((value, label) in options) {
            val on = value == selected
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) colors.ac else Color.Transparent)
                    .press { onPick(value) }
                    .padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, color = if (on) colors.glOn else colors.tx, size = 14f, weight = FontWeight.Medium)
            }
        }
    }
}

/** Settings row list item (glint-rows li). */
@Composable
fun SheetRow(
    label: String,
    trailing: String = "↗",
    danger: Boolean = false,
    trailingContent: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
) {
    val colors = G.colors
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .press(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = if (danger) colors.danger else colors.tx, size = 15f, weight = FontWeight.Medium, modifier = Modifier.weight(1f))
        if (trailingContent != null) trailingContent() else Text(trailing, color = colors.mu, size = 14f)
    }
}

/** Divider line using var(--line). */
@Composable
fun Hairline(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(G.colors.line))
}

/** iOS-style switch (PWA .sw). */
@Composable
fun GlintSwitch(on: Boolean, onToggle: () -> Unit) {
    val colors = G.colors
    Box(
        Modifier
            .size(46.dp, 28.dp)
            .clip(RoundedCornerShape(30.dp))
            .background(if (on) colors.ac else colors.chip)
            .border(1.dp, colors.line, RoundedCornerShape(30.dp))
            .press(onClick = onToggle)
            .padding(3.dp),
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(if (on) colors.glOn else colors.mu))
    }
}

/** Round header icon button (glint-header-actions button, 38px). */
@Composable
fun HeaderIconButton(glyph: Glyph, label: String, onClick: () -> Unit) {
    val colors = G.colors
    Box(
        Modifier
            .size(38.dp)
            .clip(CircleShape)
            .background(colors.chip)
            .press(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        GlintIcon(glyph, colors.tx, 20.dp)
    }
}

/** Centered empty-state text block. */
@Composable
fun Empty(text: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
        Text(text, color = G.colors.mu, size = 15f, align = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/** Full-size scrim. */
@Composable
fun Scrim(onClick: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color(0x66000000)).press(onClick = onClick))
}
