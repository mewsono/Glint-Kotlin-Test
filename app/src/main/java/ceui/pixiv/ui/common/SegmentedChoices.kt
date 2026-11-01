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
    labels: List<String>,
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
