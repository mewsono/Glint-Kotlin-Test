package dev.glint.core

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import java.util.Calendar

/** Set by the Activity so platform services can reach Android APIs. */
@SuppressLint("StaticFieldLeak")
object AndroidBridge {
    lateinit var appContext: Context
    var activity: android.app.Activity? = null

    /** Wired by MainActivity to an ACTION_CREATE_DOCUMENT launcher. */
    var createDocument: ((filename: String, mimeType: String, content: String) -> Unit)? = null

    /** Wired by MainActivity to an ACTION_OPEN_DOCUMENT launcher. */
    var openDocument: ((accept: String, maxBytes: Long, onResult: (String?) -> Unit) -> Unit)? = null

    /** Wired by DriveSync for the OAuth redirect. */
    var onOAuthRedirect: ((Uri) -> Unit)? = null
}

private class PrefsStore(context: Context) : KeyValueStore {
    private val prefs = context.getSharedPreferences("glint", Context.MODE_PRIVATE)
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String): Boolean =
        prefs.edit().putString(key, value).commit()
    override fun remove(key: String) { prefs.edit().remove(key).apply() }
}

actual object Platform {
    actual val isWeb: Boolean = false
    actual val name: String = "android"

    private var store: KeyValueStore? = null
    private var client: HttpClient? = null

    actual fun storage(): KeyValueStore =
        store ?: PrefsStore(AndroidBridge.appContext).also { store = it }

    actual fun httpClient(): HttpClient =
        client ?: HttpClient(OkHttp) {
            followRedirects = true
            expectSuccess = false
        }.also { client = it }

    actual fun epochMillis(): Long = System.currentTimeMillis()

    actual fun saveTextFile(filename: String, mimeType: String, content: String) {
        AndroidBridge.createDocument?.invoke(filename, mimeType, content)
    }

    actual fun pickTextFile(accept: String, maxBytes: Long, onResult: (String?) -> Unit) {
        val open = AndroidBridge.openDocument
        if (open != null) open(accept, maxBytes, onResult) else onResult(null)
    }

    actual fun shareText(title: String, text: String): Boolean {
        val activity = AndroidBridge.activity ?: return false
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TITLE, title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        activity.startActivity(Intent.createChooser(intent, title))
        return true
    }

    actual fun openUrl(url: String) {
        val context = AndroidBridge.activity ?: AndroidBridge.appContext
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        if (context !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(intent) } catch (_: Throwable) {}
    }

    /** Android talks to every source directly; no proxy exists or is needed. */
    actual fun proxyBase(): String = ""

    actual fun localDate(): IntArray {
        val c = Calendar.getInstance()
        return intArrayOf(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }
}
