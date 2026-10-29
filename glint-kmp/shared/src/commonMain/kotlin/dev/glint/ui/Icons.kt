package dev.glint.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Line icons matching the PWA's 24x24 stroke SVG set. */
enum class Glyph {
    Home, Search, User, Heart, HeartFill, Bookmark, BookmarkFill, Back, Close,
    Chevron, ChevronUp, Share, Download, Dots, Plus, Trash, Edit, External,
    Sort, Columns, Info, Check, Play, Gear, Sync, Image, Link,
}

@Composable
fun GlintIcon(
    glyph: Glyph,
    tint: Color,
    size: Dp = 22.dp,
    modifier: Modifier = Modifier,
    stroke: Float = 2f,
) {
    Canvas(modifier.size(size)) {
        drawGlyph(glyph, tint, stroke)
    }
}

private fun DrawScope.px(v: Float): Float = size.minDimension / 24f * v

private fun DrawScope.strokeStyle(w: Float) = Stroke(
    width = px(w),
    cap = StrokeCap.Round,
    join = StrokeJoin.Round,
)

fun DrawScope.drawGlyph(glyph: Glyph, tint: Color, strokeW: Float = 2f) {
    val s = strokeStyle(strokeW)
    fun p(block: Path.() -> Unit): Path = Path().apply(block)
    fun m(x: Float, y: Float) = Offset(px(x), px(y))
    when (glyph) {
        Glyph.Home -> {
            drawPath(p { moveTo(px(3f), px(11f)); lineTo(px(12f), px(3.5f)); lineTo(px(21f), px(11f)) }, tint, style = s)
            drawPath(p { moveTo(px(5.5f), px(10f)); lineTo(px(5.5f), px(20.5f)); lineTo(px(18.5f), px(20.5f)); lineTo(px(18.5f), px(10f)) }, tint, style = s)
        }
        Glyph.Search -> {
            drawCircle(tint, px(6.5f), m(10.5f, 10.5f), style = s)
            drawLine(tint, m(15.5f, 15.5f), m(21f, 21f), px(strokeW), StrokeCap.Round)
        }
        Glyph.User -> {
            drawCircle(tint, px(4f), m(12f, 8f), style = s)
            drawPath(p { moveTo(px(4.5f), px(20.5f)); cubicTo(px(5.5f), px(15.5f), px(18.5f), px(15.5f), px(19.5f), px(20.5f)) }, tint, style = s)
        }
        Glyph.Heart, Glyph.HeartFill -> {
            val heart = p {
                moveTo(px(12f), px(20.2f))
                cubicTo(px(5.2f), px(15.6f), px(2.6f), px(11.6f), px(3.6f), px(8f))
                cubicTo(px(4.4f), px(5.2f), px(7.6f), px(4f), px(9.9f), px(5.4f))
                cubicTo(px(10.9f), px(6f), px(11.6f), px(6.9f), px(12f), px(7.8f))
                cubicTo(px(12.4f), px(6.9f), px(13.1f), px(6f), px(14.1f), px(5.4f))
                cubicTo(px(16.4f), px(4f), px(19.6f), px(5.2f), px(20.4f), px(8f))
                cubicTo(px(21.4f), px(11.6f), px(18.8f), px(15.6f), px(12f), px(20.2f))
                close()
            }
            if (glyph == Glyph.HeartFill) drawPath(heart, tint, style = Fill) else drawPath(heart, tint, style = s)
        }
        Glyph.Bookmark, Glyph.BookmarkFill -> {
            val bm = p {
                moveTo(px(6.5f), px(3.5f)); lineTo(px(17.5f), px(3.5f)); lineTo(px(17.5f), px(20.5f))
                lineTo(px(12f), px(16f)); lineTo(px(6.5f), px(20.5f)); close()
            }
            if (glyph == Glyph.BookmarkFill) drawPath(bm, tint, style = Fill) else drawPath(bm, tint, style = s)
        }
        Glyph.Back -> {
            drawPath(p { moveTo(px(14.5f), px(5f)); lineTo(px(7.5f), px(12f)); lineTo(px(14.5f), px(19f)) }, tint, style = s)
        }
        Glyph.Close -> {
            drawLine(tint, m(6f, 6f), m(18f, 18f), px(strokeW), StrokeCap.Round)
            drawLine(tint, m(18f, 6f), m(6f, 18f), px(strokeW), StrokeCap.Round)
        }
        Glyph.Chevron -> drawPath(p { moveTo(px(7f), px(10f)); lineTo(px(12f), px(15f)); lineTo(px(17f), px(10f)) }, tint, style = s)
        Glyph.ChevronUp -> drawPath(p { moveTo(px(7f), px(14f)); lineTo(px(12f), px(9f)); lineTo(px(17f), px(14f)) }, tint, style = s)
        Glyph.Share -> {
            drawLine(tint, m(12f, 3.5f), m(12f, 14f), px(strokeW), StrokeCap.Round)
            drawPath(p { moveTo(px(8.5f), px(7f)); lineTo(px(12f), px(3.5f)); lineTo(px(15.5f), px(7f)) }, tint, style = s)
            drawPath(p { moveTo(px(7f), px(11f)); lineTo(px(5f), px(11f)); lineTo(px(5f), px(20.5f)); lineTo(px(19f), px(20.5f)); lineTo(px(19f), px(11f)); lineTo(px(17f), px(11f)) }, tint, style = s)
        }
        Glyph.Download -> {
            drawLine(tint, m(12f, 3.5f), m(12f, 14f), px(strokeW), StrokeCap.Round)
            drawPath(p { moveTo(px(8.5f), px(10.5f)); lineTo(px(12f), px(14f)); lineTo(px(15.5f), px(10.5f)) }, tint, style = s)
            drawPath(p { moveTo(px(4.5f), px(17f)); lineTo(px(4.5f), px(20.5f)); lineTo(px(19.5f), px(20.5f)); lineTo(px(19.5f), px(17f)) }, tint, style = s)
        }
        Glyph.Dots -> {
            drawCircle(tint, px(1.6f), m(5f, 12f))
            drawCircle(tint, px(1.6f), m(12f, 12f))
            drawCircle(tint, px(1.6f), m(19f, 12f))
        }
        Glyph.Plus -> {
            drawLine(tint, m(12f, 5f), m(12f, 19f), px(strokeW), StrokeCap.Round)
            drawLine(tint, m(5f, 12f), m(19f, 12f), px(strokeW), StrokeCap.Round)
        }
        Glyph.Trash -> {
            drawLine(tint, m(4f, 6.5f), m(20f, 6.5f), px(strokeW), StrokeCap.Round)
            drawPath(p { moveTo(px(9f), px(6.5f)); lineTo(px(9f), px(4f)); lineTo(px(15f), px(4f)); lineTo(px(15f), px(6.5f)) }, tint, style = s)
            drawPath(p { moveTo(px(6f), px(6.5f)); lineTo(px(7f), px(20.5f)); lineTo(px(17f), px(20.5f)); lineTo(px(18f), px(6.5f)) }, tint, style = s)
            drawLine(tint, m(10f, 10f), m(10.4f, 17f), px(strokeW * .8f), StrokeCap.Round)
            drawLine(tint, m(14f, 10f), m(13.6f, 17f), px(strokeW * .8f), StrokeCap.Round)
        }
        Glyph.Edit -> {
            drawPath(p { moveTo(px(4f), px(20f)); lineTo(px(4.8f), px(16.2f)); lineTo(px(16.5f), px(4.5f)); lineTo(px(19.5f), px(7.5f)); lineTo(px(7.8f), px(19.2f)); close() }, tint, style = s)
        }
        Glyph.External -> {
            drawPath(p { moveTo(px(10f), px(5f)); lineTo(px(5f), px(5f)); lineTo(px(5f), px(19f)); lineTo(px(19f), px(19f)); lineTo(px(19f), px(14f)) }, tint, style = s)
            drawLine(tint, m(10f, 14f), m(19.5f, 4.5f), px(strokeW), StrokeCap.Round)
            drawPath(p { moveTo(px(13.5f), px(4.5f)); lineTo(px(19.5f), px(4.5f)); lineTo(px(19.5f), px(10.5f)) }, tint, style = s)
        }
        Glyph.Sort -> {
            drawLine(tint, m(4f, 7f), m(16f, 7f), px(strokeW), StrokeCap.Round)
            drawLine(tint, m(4f, 12f), m(13f, 12f), px(strokeW), StrokeCap.Round)
            drawLine(tint, m(4f, 17f), m(10f, 17f), px(strokeW), StrokeCap.Round)
            drawPath(p { moveTo(px(18f), px(10f)); lineTo(px(18f), px(19f)) }, tint, style = s)
            drawPath(p { moveTo(px(15f), px(16f)); lineTo(px(18f), px(19f)); lineTo(px(21f), px(16f)) }, tint, style = s)
        }
        Glyph.Columns -> {
            drawRoundRect(tint, m(4f, 4f), Size(px(7f), px(16f)), CornerRadius(px(1.6f)), style = s)
            drawRoundRect(tint, m(13.5f, 4f), Size(px(7f), px(10f)), CornerRadius(px(1.6f)), style = s)
        }
        Glyph.Info -> {
            drawCircle(tint, px(8.6f), m(12f, 12f), style = s)
            drawLine(tint, m(12f, 11f), m(12f, 16.4f), px(strokeW), StrokeCap.Round)
            drawCircle(tint, px(1.1f), m(12f, 7.6f))
        }
        Glyph.Check -> drawPath(p { moveTo(px(5f), px(12f)); lineTo(px(9f), px(16f)); lineTo(px(19f), px(6f)) }, tint, style = s)
        Glyph.Play -> drawPath(p { moveTo(px(8f), px(5f)); lineTo(px(19f), px(12f)); lineTo(px(8f), px(19f)); close() }, tint, style = Fill)
        Glyph.Gear -> {
            drawCircle(tint, px(3.2f), m(12f, 12f), style = s)
            for (i in 0 until 8) {
                val a = i * (kotlin.math.PI / 4)
                val cx = px(12f); val cy = px(12f)
                val r1 = px(6.4f); val r2 = px(8.6f)
                drawLine(
                    tint,
                    Offset(cx + (r1 * kotlin.math.cos(a)).toFloat(), cy + (r1 * kotlin.math.sin(a)).toFloat()),
                    Offset(cx + (r2 * kotlin.math.cos(a)).toFloat(), cy + (r2 * kotlin.math.sin(a)).toFloat()),
                    px(strokeW), StrokeCap.Round,
                )
            }
        }
        Glyph.Sync -> {
            drawArc(tint, -30f, 240f, false, m(4f, 4f), Size(px(16f), px(16f)), style = s)
            drawPath(p { moveTo(px(17.2f), px(2.8f)); lineTo(px(18.2f), px(7f)); lineTo(px(14f), px(7.6f)) }, tint, style = s)
        }
        Glyph.Image -> {
            drawRoundRect(tint, m(3.5f, 5f), Size(px(17f), px(14f)), CornerRadius(px(2f)), style = s)
            drawCircle(tint, px(1.5f), m(8.5f, 9.5f), style = s)
            drawPath(p { moveTo(px(5f), px(17f)); lineTo(px(10.5f), px(12f)); lineTo(px(14f), px(15f)); lineTo(px(17f), px(12.5f)); lineTo(px(20f), px(15.5f)) }, tint, style = s)
        }
        Glyph.Link -> {
            drawArc(tint, 110f, 160f, false, m(3f, 7f), Size(px(10f), px(10f)), style = s)
            drawArc(tint, -70f, 160f, false, m(11f, 7f), Size(px(10f), px(10f)), style = s)
            drawLine(tint, m(9.5f, 12f), m(14.5f, 12f), px(strokeW), StrokeCap.Round)
        }
    }
}
