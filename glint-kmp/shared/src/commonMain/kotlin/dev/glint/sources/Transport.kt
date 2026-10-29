package dev.glint.sources

import dev.glint.core.*
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import io.ktor.http.content.TextContent
import io.ktor.http.ContentType
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Result of pbJSON: either parsed JSON or raw text (scraped HTML sources). */
sealed class JsonOrText {
    data class J(val element: JsonElement) : JsonOrText()
    data class T(val text: String) : JsonOrText()
}

class HttpError(
    val status: Int,
    val bodyText: String,
    val retryAfter: String? = null,
    message: String,
) : Exception(message)

data class FetchOptions(
    val method: String = "GET",
    val body: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val forceProxy: Boolean = false,
    val isPrivate: Boolean = false,
    val mutation: Boolean = false,
    val secrets: List<String> = emptyList(),
)

data class FetchResult(val status: Int, val text: String, val url: String)

/**
 * Transport rules ported from sources.js:
 *  - Android calls every source directly with the app User-Agent (no CORS).
 *  - The web preview routes proxy-only hosts (and failed direct fetches)
 *    through the local dev proxy; account traffic always uses the private
 *    same-origin POST envelope so credentials never sit in a URL.
 */
object Net {
    const val UA = "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

    val PROXY_HOSTS = mutableSetOf(
        "danbooru.donmai.us", "safebooru.donmai.us", "donmai.moe",
        "yande.re", "konachan.net", "konachan.com", "www.sakugabooru.com",
        "gelbooru.com", "illusioncards.booru.org", "e621.net", "e926.net",
        "anime-pictures.net", "api.anime-pictures.net", "szurubooru.com",
        "booru.funmaker.moe", "e-shuushuu.net", "rule34.paheal.net",
        "sankakuapi.com", "chan.sankakucomplex.com", "sankaku.app",
        "nozomi.la", "n.nozomi.la", "j.gold-usergeneratedcontent.net",
        "qtn.gold-usergeneratedcontent.net", "www.zerochan.net", "realbooru.com",
        "ponybooru.org", "aibooru.online", "testbooru.donmai.us",
    )

    /** Verified to answer a cross-origin browser fetch with ACAO: *. */
    val DIRECT_HOSTS = mutableSetOf(
        "derpibooru.org", "e621.net", "e926.net", "api.anime-pictures.net",
    )

    /** Image hosts that refuse requests carrying a Referer / block ORB on web. */
    val IMG_PROXY_HOSTS = setOf(
        "cdn.donmai.us",
        "static1.e621.net", "static2.e621.net", "static.e621.net",
        "static1.e926.net", "static2.e926.net", "static.e926.net",
        "opreviews.anime-pictures.net",
    )

    private val SECRET_PARAMS = Regex(
        "^(?:login|api_key|user_api_key|password_hash|pass_hash|password|token|access_token|refresh_token|key|user_id)$",
        RegexOption.IGNORE_CASE,
    )

    fun proxyUrl(url: String): String = Platform.proxyBase() + "?u=" + encodeURIComponent(url)

    /** Thumbnails/media: web preview proxies the hosts a browser cannot load. */
    fun img(url: String): String {
        if (url.isEmpty() || !Platform.isWeb) return url
        val host = parseUrl(url)?.host ?: return url
        return if (host in IMG_PROXY_HOSTS) proxyUrl(url) else url
    }

    /** All media URLs on web go through the proxy when their host needs it. */
    fun media(url: String): String = img(url)

    fun publicRequestURL(url: String): String {
        val parts = parseUrl(url) ?: return url
        if (parts.query.isEmpty()) return url
        val kept = parts.query.split("&").filter { param ->
            val key = param.substringBefore("=")
            !SECRET_PARAMS.matches(decodeComponent(key))
        }
        val base = url.substringBefore("?")
        return if (kept.isEmpty()) base else base + "?" + kept.joinToString("&")
    }

    private fun decodeComponent(value: String): String = try {
        buildString {
            var i = 0
            while (i < value.length) {
                val ch = value[i]
                if (ch == '%' && i + 2 < value.length + 1 && i + 2 < value.length + 1) {
                    val hex = value.substring(i + 1, minOf(i + 3, value.length))
                    val code = hex.toIntOrNull(16)
                    if (code != null && hex.length == 2) { append(code.toChar()); i += 3; continue }
                }
                append(if (ch == '+') ' ' else ch); i++
            }
        }
    } catch (_: Throwable) { value }

    fun hasRequestSecrets(url: String, opts: FetchOptions): Boolean {
        if (opts.isPrivate || opts.mutation) return true
        if (opts.headers.keys.any { it.equals("authorization", true) || it.equals("cookie", true) }) return true
        val query = parseUrl(url)?.query ?: return false
        return query.split("&").any { SECRET_PARAMS.matches(decodeComponent(it.substringBefore("="))) }
    }

    fun redactSecrets(value: String?, extra: List<String> = emptyList()): String {
        var text = value ?: ""
        for (secret in extra) if (secret.length >= 4) {
            text = text.replace(secret, "[redacted]").replace(encodeURIComponent(secret), "[redacted]")
        }
        for (record in Accounts.all().values) {
            val secrets = buildList {
                add(record.apiKey); add(record.passHash); add(record.session)
                if (record.login.isNotEmpty() && record.apiKey.isNotEmpty()) add(B64.encode(record.login + ":" + record.apiKey))
            }
            for (secret in secrets) if (secret.length >= 4) {
                text = text.replace(secret, "[redacted]").replace(encodeURIComponent(secret), "[redacted]")
            }
        }
        return text.replace(
            Regex("((?:api_key|user_api_key|password_hash|pass_hash|access_token|refresh_token|password)\\s*[=:]\\s*)[^\\s&;<>\"']+", RegexOption.IGNORE_CASE),
            "$1[redacted]",
        ).take(1200)
    }

    /** One place that turns an HTTP status into advice the user can act on. */
    fun statusMessage(status: Int, url: String = ""): String {
        var host = parseUrl(url)?.host ?: ""
        // `url` is often the proxy wrapper: read the real target out of it.
        val wrapped = Regex("[?&]u=([^&]+)").find(url)?.groupValues?.get(1)
        if (wrapped != null) host = parseUrl(decodeComponent(wrapped))?.host ?: host
        if (host.endsWith("gelbooru.com") && (status == 401 || status == 403)) {
            return "Gelbooru now needs a free API key for reads. Add your user id and API key in Settings → Source accounts → Gelbooru, then reload."
        }
        return when (status) {
            401 -> "The source rejected these credentials. Check this source's account settings."
            403 -> "The source denied access. Check account permissions, API-key scope or the site's security challenge — if this happens on every source, the site is blocking the network you are on."
            429 -> "The source is rate-limiting requests. Wait before trying again."
            503 -> "The source is temporarily unavailable. Try again later."
            else -> "HTTP $status"
        }
    }

    private suspend fun rawFetch(url: String, opts: FetchOptions): FetchResult {
        val client = Platform.httpClient()
        val response = withTimeout(25_000) {
            client.request(url) {
                method = HttpMethod.parse(opts.method.uppercase())
                header("Accept", opts.headers["Accept"] ?: "application/json")
                if (!Platform.isWeb) header("User-Agent", UA)
                for ((key, value) in opts.headers) if (!key.equals("Accept", true)) header(key, value)
                if (opts.body != null) {
                    val contentType = opts.headers.entries.firstOrNull { it.key.equals("content-type", true) }?.value
                        ?: "application/json"
                    setBody(TextContent(opts.body, ContentType.parse(contentType)))
                }
            }
        }
        val status = response.status.value
        val text = response.bodyAsText()
        if (status < 200 || status >= 300) {
            throw HttpError(status, redactSecrets(text, opts.secrets), response.headers["Retry-After"], statusMessage(status, url))
        }
        return FetchResult(status, text, url)
    }

    /** Account traffic as a private envelope through the proxy (web only). */
    private suspend fun privateFetch(url: String, opts: FetchOptions): FetchResult {
        if (!Platform.isWeb) {
            // Native transport has no CORS: send the request directly, uncached.
            return rawFetch(url, opts)
        }
        val envelope = buildJsonObject {
            put("pb_private", 1)
            put("url", url)
            put("method", opts.method.uppercase())
            put("headers", buildJsonObject {
                put("Accept", "application/json")
                for ((key, value) in opts.headers) put(key, value)
                if (opts.body != null && opts.headers.keys.none { it.equals("content-type", true) }) {
                    put("Content-Type", "application/json")
                }
            })
            if (opts.body != null) put("body", opts.body) else put("body", null as String?)
            put("mutation", opts.mutation)
        }.toString()
        val response = rawFetch(
            proxyUrl(publicRequestURL(url)),
            FetchOptions(method = "POST", body = envelope, headers = mapOf("Content-Type" to "application/json")),
        )
        var status = response.status
        var text = response.text
        var retry: String? = null
        parseJsonOrNull(text)?.objOrNull?.let { data ->
            if (data.el("pb_private_response").asStringOr("") == "1") {
                status = data.el("status").asStringOr("0").toDoubleOrNull()?.toInt() ?: 0
                text = data.el("body").asStringOr("")
                retry = data.el("retry_after")?.asStringOr("")?.ifEmpty { null }
            }
        }
        if (status < 200 || status >= 300) {
            throw HttpError(status, redactSecrets(text, opts.secrets), retry, statusMessage(status, url))
        }
        return FetchResult(status, text, publicRequestURL(url))
    }

    /**
     * Fetch JSON/text. Native goes direct; web prefers direct only for CORS-open
     * hosts, falling back to (or starting with) the proxy.
     */
    suspend fun fetch(url: String, opts: FetchOptions = FetchOptions()): FetchResult {
        if (hasRequestSecrets(url, opts)) return privateFetch(url, opts)
        if (!Platform.isWeb) return rawFetch(url, opts)
        val host = parseUrl(url)?.host ?: ""
        val mustProxy = opts.forceProxy || host in PROXY_HOSTS || host !in DIRECT_HOSTS
        if (!mustProxy) {
            try { return rawFetch(url, opts) } catch (_: Throwable) { /* fall through to the proxy */ }
        }
        return rawFetch(proxyUrl(url), opts)
    }

    suspend fun json(url: String, opts: FetchOptions = FetchOptions()): JsonOrText? {
        val res = fetch(url, opts)
        val txt = res.text.trim()
        if (txt.isEmpty()) return null
        if (txt[0] == '{' || txt[0] == '[') {
            val parsed = parseJsonOrNull(txt) ?: return null
            return JsonOrText.J(parsed)
        }
        return JsonOrText.T(txt)
    }

    suspend fun text(url: String, opts: FetchOptions = FetchOptions()): String = fetch(url, opts).text

    /** pbJSONFriendly: turns API error payloads into readable errors. */
    suspend fun jsonFriendly(url: String, opts: FetchOptions = FetchOptions()): JsonOrText? {
        val result = try {
            json(url, opts)
        } catch (e: HttpError) {
            var message = ""
            parseJsonOrNull(e.bodyText)?.objOrNull?.let { data ->
                message = data.el("message").asStringOr("").ifEmpty {
                    data.el("reason").asStringOr("").ifEmpty { data.el("error").asStringOr("") }
                }
            }
            throw HttpError(e.status, e.bodyText, e.retryAfter, redactSecrets(message.ifEmpty { e.message ?: "Could not reach the source." }, opts.secrets))
        }
        (result as? JsonOrText.J)?.element?.objOrNull?.let { obj ->
            val failed = obj.el("success").asStringOr("") == "false" || obj.el("error") != null
            if (failed) {
                val message = obj.el("message").asStringOr("").ifEmpty {
                    obj.el("reason").asStringOr("").ifEmpty { obj.el("error").asStringOr("The source rejected the request.") }
                }
                throw HttpError(422, "", null, redactSecrets(message, opts.secrets))
            }
        }
        return result
    }
}
