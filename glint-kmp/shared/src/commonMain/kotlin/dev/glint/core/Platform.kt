package dev.glint.core

import io.ktor.client.HttpClient

/** Simple key/value storage: localStorage on web, SharedPreferences-backed on Android. */
interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String): Boolean
    fun remove(key: String)
}

/** Platform facts and services. */
expect object Platform {
    val isWeb: Boolean
    val name: String
    fun storage(): KeyValueStore
    fun httpClient(): HttpClient
    fun epochMillis(): Long

    /** Save text to a user-visible file (download on web, SAF on Android). */
    fun saveTextFile(filename: String, mimeType: String, content: String)

    /** Ask the user for a JSON file; calls back with its text (or null if cancelled/too large). */
    fun pickTextFile(accept: String, maxBytes: Long, onResult: (String?) -> Unit)

    /** Native share where available. Returns false when not supported (web). */
    fun shareText(title: String, text: String): Boolean

    /** Open a URL in the system browser / a new tab. */
    fun openUrl(url: String)

    /** Base URL of the CORS dev proxy (web preview only; empty on Android). */
    fun proxyBase(): String

    /** Local calendar date as [year, month(1-12), day(1-31)] (explore stamps). */
    fun localDate(): IntArray
}

/** SHA-1 used for the Moebooru password hash: pure Kotlin so every target agrees. */
object Sha1 {
    fun hex(input: String): String {
        val message = input.encodeToByteArray()
        val ml = message.size.toLong() * 8
        val withOne = message + byteArrayOf(0x80.toByte())
        val padLen = ((56 - withOne.size % 64) + 64) % 64
        val padded = withOne + ByteArray(padLen) + ByteArray(8) { i -> ((ml ushr ((7 - i) * 8)) and 0xff).toByte() }

        var h0 = 0x67452301
        var h1 = 0xEFCDAB89.toInt()
        var h2 = 0x98BADCFE.toInt()
        var h3 = 0x10325476
        var h4 = 0xC3D2E1F0.toInt()

        val w = IntArray(80)
        var chunk = 0
        while (chunk < padded.size) {
            for (i in 0 until 16) {
                w[i] = ((padded[chunk + i * 4].toInt() and 0xff) shl 24) or
                    ((padded[chunk + i * 4 + 1].toInt() and 0xff) shl 16) or
                    ((padded[chunk + i * 4 + 2].toInt() and 0xff) shl 8) or
                    (padded[chunk + i * 4 + 3].toInt() and 0xff)
            }
            for (i in 16 until 80) w[i] = (w[i - 3] xor w[i - 8] xor w[i - 14] xor w[i - 16]).rotateLeft(1)
            var a = h0; var b = h1; var c = h2; var d = h3; var e = h4
            for (i in 0 until 80) {
                val (f, k) = when {
                    i < 20 -> ((b and c) or (b.inv() and d)) to 0x5A827999
                    i < 40 -> (b xor c xor d) to 0x6ED9EBA1
                    i < 60 -> ((b and c) or (b and d) or (c and d)) to 0x8F1BBCDC.toInt()
                    else -> (b xor c xor d) to 0xCA62C1D6.toInt()
                }
                val temp = a.rotateLeft(5) + f + e + k + w[i]
                e = d; d = c; c = b.rotateLeft(30); b = a; a = temp
            }
            h0 += a; h1 += b; h2 += c; h3 += d; h4 += e
            chunk += 64
        }
        return listOf(h0, h1, h2, h3, h4).joinToString("") { v ->
            buildString { for (shift in 28 downTo 0 step 4) append("0123456789abcdef"[(v ushr shift) and 0xf]) }
        }
    }
}

/** Base64 (same alphabet/padding as sources.js pbBase64) for HTTP Basic auth. */
object B64 {
    private const val ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    fun encode(value: String): String {
        val bytes = value.encodeToByteArray()
        val out = StringBuilder()
        var i = 0
        while (i < bytes.size) {
            val a = bytes[i].toInt() and 0xff
            val b = if (i + 1 < bytes.size) bytes[i + 1].toInt() and 0xff else 0
            val c = if (i + 2 < bytes.size) bytes[i + 2].toInt() and 0xff else 0
            val n = (a shl 16) or (b shl 8) or c
            out.append(ABC[(n ushr 18) and 63])
            out.append(ABC[(n ushr 12) and 63])
            out.append(if (i + 1 < bytes.size) ABC[(n ushr 6) and 63] else '=')
            out.append(if (i + 2 < bytes.size) ABC[n and 63] else '=')
            i += 3
        }
        return out.toString()
    }
}

/** Minimal percent-encoding equal to JS encodeURIComponent. */
fun encodeURIComponent(value: String): String {
    val keep = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
    val sb = StringBuilder()
    for (byte in value.encodeToByteArray()) {
        val ch = byte.toInt().toChar()
        if (byte >= 0 && keep.indexOf(ch) >= 0) sb.append(ch)
        else sb.append('%').append(((byte.toInt() and 0xff) or 0x100).toString(16).substring(1).uppercase())
    }
    return sb.toString()
}

/** URLSearchParams-style builder that keeps insertion order. */
class QueryParams {
    private val entries = ArrayList<Pair<String, String>>()
    fun set(key: String, value: String): QueryParams {
        val at = entries.indexOfFirst { it.first == key }
        if (at >= 0) entries[at] = key to value else entries.add(key to value)
        return this
    }
    fun set(key: String, value: Int): QueryParams = set(key, value.toString())
    override fun toString(): String =
        entries.joinToString("&") { (k, v) -> encodeURIComponent(k) + "=" + encodeURIComponent(v) }
}

/** Tiny URL splitter (no java.net / browser URL in common code). */
data class UrlParts(val scheme: String, val host: String, val port: String, val path: String, val query: String) {
    val origin: String get() = "$scheme://$host" + if (port.isNotEmpty()) ":$port" else ""
}

fun parseUrl(value: String): UrlParts? {
    val m = Regex("^(https?)://([^/:?#]+)(?::(\\d+))?([^?#]*)(?:\\?([^#]*))?").find(value.trim()) ?: return null
    return UrlParts(m.groupValues[1], m.groupValues[2].lowercase(), m.groupValues[3], m.groupValues[4].ifEmpty { "/" }, m.groupValues[5])
}

fun urlHost(value: String): String = parseUrl(value)?.host ?: ""
