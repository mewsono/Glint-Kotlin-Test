package ceui.pixiv.ui.common

import android.content.Context
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import com.blankj.utilcode.util.ColorUtils

/**
 * 一组互斥档位的连通按钮（MD3-E 风格）。
 *
 * `lean` 删掉了 `ui/library`，但乌戈拉剪辑页仍需要「选帧 | 片段」「GIF | MP4」两组切换 ——
 * 它们原来借用的是收藏库筛选面板的 `LibraryFilterViews`。这里保留同样用法的最小实现：
 * 一个横向容器、一个 `select(index)`、一个回调，托管层不需要知道收藏库曾经存在。
 */
class ConnectedChoices internal constructor(private val buttons: List<TextView>) {

    /** 调用方直接 `addView(choices.view, ...)` 用。 */
    val view: LinearLayout = LinearLayout(buttons.first().context).apply {
        orientation = LinearLayout.HORIZONTAL
        clipToOutline = true
        buttons.forEach { addView(it, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)) }
    }

    var selectedIndex: Int = 0
        private set

    fun select(index: Int) {
        if (index !in buttons.indices) return
        if (index == selectedIndex && view.isAttachedToWindow) return
        selectedIndex = index
        applyState()
    }

    internal fun applyState() {
        buttons.forEachIndexed { i, button ->
            val active = i == selectedIndex
            button.background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = 999f
                setColor(if (active) PRIMARY else 0x00000000)
            }
            button.setTextColor(if (active) 0xFFFFFFFF.toInt() else PRIMARY)
        }
    }

    private companion object {
        // 与 v3 主色一致；直接取资源会多背一层主题依赖，这里用固定色保持托管层零上下文。
        const val PRIMARY = 0xFF3B6CF6.toInt()
    }
}

/** 造一组互斥档位；[onSelect] 只在用户点击时回调，初始选中第 0 项。 */
fun connectedChoices(
    context: Context,
    labels: List<CharSequence>,
    onSelect: (Int) -> Unit,
): ConnectedChoices {
    val buttons = labels.mapIndexed { index, label ->
        TextView(context).apply {
            text = label
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            val padV = (10 * resources.displayMetrics.density).toInt()
            setPadding(0, padV, 0, padV)
            setOnClickListener { onSelect(index) }
        }
    }
    return ConnectedChoices(buttons).also { it.applyState() }
}

/**
 * 一行可横滑的胶囊选项（滤镜「调节」项那种）。同样是从删掉的 `ui/library` 里接手过来的最小实现：
 * `select(index)` 换高亮，`view` 是一个 [android.widget.HorizontalScrollView]（调用方会往里塞 padding）。
 * 文案会随状态变（滤镜「调节」项的数值），所以还留了一个 [setLabels] 做原地重建。
 */
class ChoiceChips internal constructor(
    private val scroller: android.widget.HorizontalScrollView,
    private val row: LinearLayout,
    private val onSelect: (Int) -> Unit,
) {
    val view: android.view.View get() = scroller

    var selectedIndex: Int = 0
        private set

    private val buttons get() = (0 until row.childCount).map { row.getChildAt(it) as TextView }

    fun select(index: Int) {
        if (index !in 0 until row.childCount) return
        selectedIndex = index
        buttons.forEachIndexed { i, button ->
            val active = i == selectedIndex
            button.background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = 999f
                setColor(if (active) 0xFF3B6CF6.toInt() else 0x00000000)
            }
            button.setTextColor(if (active) 0xFFFFFFFF.toInt() else 0x993B6CF6.toInt())
        }
    }

    /** 换一套文案（数量可以不同），选中项尽量保持在原位。 */
    fun setLabels(labels: List<CharSequence>) {
        val active = selectedIndex
        row.removeAllViews()
        val density = row.resources.displayMetrics.density
        labels.forEachIndexed { index, label ->
            val chip = TextView(row.context).apply {
                text = label
                gravity = Gravity.CENTER
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setPadding(
                    (14 * density).toInt(), (8 * density).toInt(),
                    (14 * density).toInt(), (8 * density).toInt(),
                )
                setOnClickListener { onSelect(index) }
            }
            row.addView(chip, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = (8 * density).toInt() })
        }
        if (row.childCount > 0) select(active.coerceIn(0, row.childCount - 1))
    }
}

/** 造一行可横滑的胶囊选项；[onSelect] 只在用户点击时回调。 */
fun choiceChips(
    context: Context,
    labels: List<CharSequence>,
    scroll: Boolean = true,
    onSelect: (Int) -> Unit,
): ChoiceChips {
    val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
    val scroller = android.widget.HorizontalScrollView(context).apply {
        isHorizontalScrollBarEnabled = false
        if (scroll) addView(row, android.widget.FrameLayout.LayoutParams(-2, -2))
        else addView(row, android.widget.FrameLayout.LayoutParams(-1, -2))
    }
    return ChoiceChips(scroller, row, onSelect).also { it.setLabels(labels) }
}
