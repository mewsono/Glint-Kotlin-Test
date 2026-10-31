package ceui.pixiv.utils

import android.content.Context
import ceui.lisa.R
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * 「把异常翻成一句能给用户看的话」。
 *
 * 这一对函数原本住在 `ceui.pixiv.chat.base`（`AppErrorExt.kt`），但那套实现依赖 chat 模块
 * 的 `AppError` 分类，随 chat 一起删掉了。宿主里若干与聊天无关的调用点（错误提示 toast、
 * 动态页的「网络类错误」判定、`ErrorCtrl` 的兜底）仍在用同样的语义，所以在 `utils` 里重建
 * 一个不依赖已删除类型的最小实现 —— 见 CLEANUP_MANIFEST.md 决策规则 5。
 */
fun Throwable.toUserMessage(context: Context): String =
    message?.takeIf { it.isNotBlank() } ?: context.getString(R.string.operate_failed)

/**
 * 网络类错误：断网 / 超时 / TLS。这类错误重试大概率还是失败，动态页据此给「网络测试」入口。
 */
fun Throwable.isNetworkClassError(): Boolean =
    this is UnknownHostException || this is SocketTimeoutException || this is SSLException ||
        (this is IOException && message?.contains("network", ignoreCase = true) == true)
