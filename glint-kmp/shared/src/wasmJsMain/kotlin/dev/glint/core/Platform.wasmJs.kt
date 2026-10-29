package dev.glint.core

import io.ktor.client.HttpClient
import io.ktor.client.engine.js.Js
import kotlinx.browser.document
import kotlinx.browser.localStorage
import kotlinx.browser.window
import org.w3c.dom.HTMLAnchorElement
import org.w3c.dom.HTMLInputElement

/* ---- small JS interop helpers (Kotlin/Wasm js() must be a sole body) ---- */

private fun jsNow(): Double = js("Date.now()")
private fun jsYear(): Int = js("new Date().getFullYear()")
private fun jsMonth(): Int = js("new Date().getMonth() + 1")
private fun jsDay(): Int = js("new Date().getDate()")
private fun jsProxyOverride(): String = js("(window.GLINT_PROXY || '')")
private fun jsEncodeURIComponent(v: String): String = js("encodeURIComponent(v)")

/** Read the text of the first chosen file of an <input type=file>. */
private fun jsReadInputFile(
    input: HTMLInputElement,
    maxBytes: Double,
    onText: (String) -> Unit,
    onFail: () -> Unit,
): Unit = js(
    """{
        var file = input.files && input.files[0];
        if (!file) { onFail(); return; }
        if (file.size > maxBytes) { onFail(); return; }
        var reader = new FileReader();
        reader.onload = function () { onText(String(reader.result)); };
        reader.onerror = function () { onFail(); };
        reader.readAsText(file);
    }""",
)

private class LocalStorageStore : KeyValueStore {
    override fun get(key: String): String? = localStorage.getItem(key)
    override fun put(key: String, value: String): Boolean = try {
        localStorage.setItem(key, value); true
    } catch (_: Throwable) { false }
    override fun remove(key: String) { localStorage.removeItem(key) }
}

actual object Platform {
    actual val isWeb: Boolean = true
    actual val name: String = "web"

    private val store = LocalStorageStore()
    private var client: HttpClient? = null

    actual fun storage(): KeyValueStore = store

    actual fun httpClient(): HttpClient =
        client ?: HttpClient(Js) {
            followRedirects = true
            expectSuccess = false
        }.also { client = it }

    actual fun epochMillis(): Long = jsNow().toLong()

    actual fun saveTextFile(filename: String, mimeType: String, content: String) {
        val a = document.createElement("a") as HTMLAnchorElement
        a.href = "data:$mimeType;charset=utf-8," + jsEncodeURIComponent(content)
        a.download = filename
        document.body?.appendChild(a)
        a.click()
        a.remove()
    }

    actual fun pickTextFile(accept: String, maxBytes: Long, onResult: (String?) -> Unit) {
        val input = document.createElement("input") as HTMLInputElement
        input.type = "file"
        input.accept = accept
        input.style.display = "none"
        document.body?.appendChild(input)
        input.addEventListener("change", {
            jsReadInputFile(
                input,
                maxBytes.toDouble(),
                { text -> input.remove(); onResult(text) },
                { input.remove(); onResult(null) },
            )
        })
        input.click()
    }

    /** No Web Share in the wasm canvas shell — the UI shows the Android note. */
    actual fun shareText(title: String, text: String): Boolean = false

    actual fun openUrl(url: String) {
        window.open(url, "_blank", "noopener")
    }

    /** The local dev proxy (dev-proxy/server.cjs). window.GLINT_PROXY overrides. */
    actual fun proxyBase(): String {
        val override = jsProxyOverride()
        return override.ifEmpty { "http://localhost:8081/api/proxy" }
    }

    actual fun localDate(): IntArray = intArrayOf(jsYear(), jsMonth(), jsDay())
}
