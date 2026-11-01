package ceui.pixiv.utils

import java.util.Locale

/**
 * 「用浏览器打开翻译」链接要用的目标语言。
 *
 * `classic` 里这个值来自 AI 翻译设置（`ceui.pixiv.ui.translate`），随翻译模块一起删掉了。
 * 选段翻译仍然保留「丢给 Google 翻译网页」这条不依赖模型的出口，用系统语言当目标足够。
 */
fun appTranslateTargetLang(): String =
    Locale.getDefault().language.takeIf { it.isNotBlank() && it != "und" } ?: "en"
