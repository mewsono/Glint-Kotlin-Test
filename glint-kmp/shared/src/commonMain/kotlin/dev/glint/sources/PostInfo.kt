package dev.glint.sources

import dev.glint.core.*
import dev.glint.model.SourceLink
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.max
import kotlin.math.min

/* ------------------------------------------------------------- utilities */

fun pbClip(s: String?, n: Int): String {
    val v = s ?: return ""
    return if (v.length > n) v.take(n - 1) + "…" else v
}

fun pbTags(value: JsonElement?): List<String> = when (value) {
    is JsonPrimitive -> value.content.split(Regex("\\s+")).filter { it.isNotBlank() }
    is JsonArray -> value.mapNotNull { el ->
        when (el) {
            is JsonPrimitive -> el.content
            is JsonObject -> el.el("name_en").asStringOr("").ifEmpty { el.el("name").asStringOr("").ifEmpty { el.el("tag").asStringOr("") } }
            else -> null
        }
    }.filter { it.isNotBlank() }
    else -> emptyList()
}

fun pbRatio(w: Int, h: Int): Double =
    if (w > 0 && h > 0) max(0.4, min(2.6, h.toDouble() / w)) else 1.2

/** Parse number-or-ISO date like pbDate; falls back to now(). */
fun pbDate(value: JsonElement?): Long {
    val stamp = pbParseStamp(value)
    return stamp ?: Platform.epochMillis()
}

/** Parse number-or-ISO date; null when unparseable (used by upload info). */
fun pbParseStamp(value: JsonElement?): Long? {
    if (value == null) return null
    val p = value as? JsonPrimitive ?: return null
    val text = p.content.trim()
    if (text.isEmpty() || text == "true" || text == "false") return null
    if (Regex("^-?\\d+(?:\\.\\d+)?$").matches(text)) {
        val n = text.toDoubleOrNull() ?: return null
        if (n <= 0) return null
        val ms = if (n > 1e11) n else n * 1000
        if (!ms.isFinite() || ms <= 0 || ms > 8.64e15) return null
        return ms.toLong()
    }
    return parseIsoDate(text)
}

/** Minimal ISO-8601 parser (no kotlinx-datetime dependency). */
fun parseIsoDate(text: String): Long? {
    val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,3}))?)?\\s*(Z|[+-]\\d{2}:?\\d{2})?$")
        .find(text.trim()) ?: run {
        val d = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$").find(text.trim()) ?: return null
        return utcMillis(d.groupValues[1].toInt(), d.groupValues[2].toInt(), d.groupValues[3].toInt(), 0, 0, 0, 0)
    }
    val year = m.groupValues[1].toInt()
    val month = m.groupValues[2].toInt()
    val day = m.groupValues[3].toInt()
    val hour = m.groupValues[4].toInt()
    val minute = m.groupValues[5].toInt()
    val second = m.groupValues[6].ifEmpty { "0" }.toInt()
    val millis = m.groupValues[7].padEnd(3, '0').ifEmpty { "0" }.toInt()
    var stamp = utcMillis(year, month, day, hour, minute, second, millis) ?: return null
    val zone = m.groupValues[8]
    if (zone.isNotEmpty() && zone != "Z") {
        val sign = if (zone[0] == '-') -1 else 1
        val digits = zone.drop(1).replace(":", "")
        val zh = digits.take(2).toIntOrNull() ?: 0
        val zm = digits.drop(2).toIntOrNull() ?: 0
        stamp -= sign * (zh * 3600_000L + zm * 60_000L)
    }
    return stamp
}

private fun utcMillis(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int, millis: Int): Long? {
    if (month !in 1..12 || day !in 1..31) return null
    // days since epoch (civil-from-days algorithm)
    val y = if (month <= 2) year - 1 else year
    val era = (if (y >= 0) y else y - 399) / 400
    val yoe = y - era * 400
    val mp = (month + 9) % 12
    val doy = (153 * mp + 2) / 5 + day - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    val days = era * 146097L + doe - 719468L
    return days * 86400_000L + hour * 3600_000L + minute * 60_000L + second * 1000L + millis
}

/* -------------------------------------------------- categorized metadata */

private val TYPE_CODES = mapOf("0" to "general", "1" to "artist", "3" to "copyright", "4" to "character")

private fun names(value: JsonElement?): List<String> = when (value) {
    is JsonPrimitive -> value.content.split(Regex("\\s+"))
    is JsonArray -> value.map { el ->
        when (el) {
            is JsonPrimitive -> el.content
            is JsonObject -> el.el("name_en").asStringOr("").ifEmpty { el.el("name").asStringOr("").ifEmpty { el.el("tag").asStringOr("") } }
            else -> ""
        }
    }
    else -> emptyList()
}.map { it.trim() }.filter { it.isNotEmpty() }

data class PostMetadata(
    val characters: List<String>,
    val series: List<String>,
    val artists: List<String>,
    val detailsReady: Boolean,
)

/** Port of pbPostMetadata: keeps categorized names separate from general tags. */
fun postMetadata(meta: JsonObject?, knownTypes: Map<String, String>? = null): PostMetadata {
    val raw = meta ?: JsonObject(emptyMap())
    val groupedTags = raw.el("tags")?.objOrNull ?: JsonObject(emptyMap())
    val characters = ArrayList<String>()
    val series = ArrayList<String>()
    val artists = ArrayList<String>()
    characters += names(raw.el("tag_string_character"))
    characters += names(groupedTags.el("character") ?: groupedTags.el("characters"))
    characters += names(raw.el("characters"))
    series += names(raw.el("tag_string_copyright"))
    series += names(groupedTags.el("copyright") ?: groupedTags.el("series"))
    series += names(raw.el("copyright"))
    artists += names(raw.el("tag_string_artist"))
    artists += names(groupedTags.el("artist") ?: groupedTags.el("artists"))
    artists += names(raw.el("artists") ?: raw.el("artist"))

    val flatTags = names(raw.el("tags")?.takeIf { it !is JsonObject })
    val types = knownTypes ?: TagTypes.known(flatTags) ?: emptyMap()
    for (tag in flatTags) when (types[tag]) {
        "artist", "1" -> artists += tag
        "copyright", "series", "3" -> series += tag
        "character", "characters", "4" -> characters += tag
    }
    // tags as array of objects with type/category codes
    raw.el("tags")?.arrOrNull?.forEach { el ->
        if (el is JsonObject) {
            val type = (el.el("type") ?: el.el("category")).asStringOr("")
            val value = names(JsonArray(listOf(el)))
            when (TYPE_CODES[type] ?: type) {
                "artist" -> artists += value
                "copyright", "series" -> series += value
                "character" -> characters += value
            }
        } else if (el is JsonPrimitive) {
            val m = Regex("^(artist|character|series|copyright):(.+)$").find(el.content)
            if (m != null) when (m.groupValues[1]) {
                "artist" -> artists += m.groupValues[2]
                "character" -> characters += m.groupValues[2]
                else -> series += m.groupValues[2]
            }
        }
    }
    val junk = Regex("^(unknown_artist|artist_request|character_request|copyright_request)$")
    fun clean(list: List<String>) = list.distinct().filter { !junk.matches(it) }
    val ready = meta != null && (
        listOf("tag_string_character", "tag_string_copyright", "tag_string_artist", "_tagTypes").any { raw.containsKey(it) } ||
            listOf("artist", "artists", "character", "characters", "copyright").any { groupedTags.containsKey(it) } ||
            knownTypes != null
        )
    return PostMetadata(clean(characters), clean(series), clean(artists), ready)
}

/* ------------------------------------------------------------- file info */

data class FileInfo(val fileSize: Long?, val fileType: String, val ready: Boolean)

fun postFileInfo(meta: JsonObject?, grid: String, sample: String, orig: String): FileInfo {
    val raw = meta ?: JsonObject(emptyMap())
    val file = raw.el("file")?.objOrNull ?: JsonObject(emptyMap())
    val sizes = listOf(
        raw.el("file_size"), file.el("size"), raw.el("file_size_bytes"),
        raw.el("size_in_bytes"), raw.el("fileSize"), raw.el("contentSize"), raw.el("size"),
    )
    val bytes = sizes.firstNotNullOfOrNull { it.asDoubleOrNull()?.takeIf { n -> n.isFinite() && n > 0 } }?.toLong()
    var ext = listOf(raw.el("file_ext"), file.el("ext"), raw.el("ext"), raw.el("mime_type"), raw.el("mimeType"), file.el("mime"))
        .firstNotNullOfOrNull { it.asStringOr("").ifEmpty { null } } ?: ""
    ext = ext.substringBefore(";").replace(Regex("^image/", RegexOption.IGNORE_CASE), "")
        .replace(Regex("^video/", RegexOption.IGNORE_CASE), "").removePrefix(".").lowercase()
    if (ext.isEmpty()) {
        val url = listOf(orig, sample, grid).firstOrNull { it.isNotEmpty() } ?: ""
        val path = parseUrl(url)?.path ?: url
        val m = Regex("\\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|jxl|webm|mp4)$", RegexOption.IGNORE_CASE).find(path)
        if (m != null) ext = m.groupValues[1].lowercase()
    }
    if (ext == "jpg" || ext == "pjpeg") ext = "jpeg"
    if (ext == "svg+xml") ext = "svg"
    return FileInfo(bytes, if (ext.isNotEmpty()) ext.uppercase() else "", meta != null)
}

/* ----------------------------------------------------------- upload info */

data class UploadInfo(val uploadedAt: Long?, val ready: Boolean)

/** Port of pbPostUploadInfo: a real source timestamp only, never a fabricated "now". */
fun postUploadInfo(meta: JsonObject?): UploadInfo {
    val raw = meta ?: JsonObject(emptyMap())
    val candidates = listOf("created_at", "createdAt", "creationTime", "creation_time", "pubtime", "datetime", "uploaded_at", "uploadedAt")
    var uploadedAt: Long? = null
    for (key in candidates) {
        val stamp = pbParseStamp(raw.el(key))
        if (stamp != null && stamp > 0) { uploadedAt = stamp; break }
    }
    return UploadInfo(uploadedAt, meta != null || uploadedAt != null)
}

/* ---------------------------------------------------------- origin links */

/** Port of pbPostSourceInfo: origin links come from the post's source fields only. */
fun postSourceInfo(meta: JsonObject?): List<SourceLink> {
    val raw = meta ?: return emptyList()
    val urls = ArrayList<String>()
    fun collect(value: JsonElement?) {
        when (value) {
            is JsonArray -> value.forEach { collect(it) }
            is JsonObject -> collect(value.el("url") ?: value.el("source_url"))
            is JsonPrimitive -> {
                val text = value.content.trim().replace("&amp;", "&")
                if (text.startsWith("//")) { urls.add("https:$text"); return }
                Regex("(?:^|\\s)(https?://[^\\s<>\"']+)", RegexOption.IGNORE_CASE).findAll(text).forEach { urls.add(it.groupValues[1]) }
            }
            else -> {}
        }
    }
    listOf("source", "sources", "source_url", "source_urls", "sourceUrl").forEach { collect(raw.el(it)) }
    val links = ArrayList<SourceLink>()
    val seen = HashSet<String>()
    for (value in urls) {
        val u = parseUrl(value) ?: continue
        val host = u.host
        fun isDomain(domain: String) = host == domain || host.endsWith(".$domain")
        var platform = "website"
        var name = host.removePrefix("www.")
        var href = value
        if (isDomain("pixiv.net") || isDomain("pximg.net")) {
            platform = "pixiv"; name = "Pixiv"
            var id = Regex("/artworks/(\\d+)(?:/|$)").find(u.path)?.groupValues?.get(1)
                ?: Regex("(?:^|&)illust_id=(\\d+)").find(u.query)?.groupValues?.get(1)
            if (id == null && (isDomain("pximg.net") || Regex("^img\\d*\\.pixiv\\.net$").matches(host))) {
                val fileName = u.path.substringAfterLast('/')
                id = Regex("^(\\d+)(?:_p\\d+|_ugoira|_[ms]|\\.)").find(fileName)?.groupValues?.get(1)
            }
            if (id != null && Regex("^\\d+$").matches(id)) href = "https://www.pixiv.net/artworks/$id"
        } else if (isDomain("x.com") || isDomain("twitter.com") || isDomain("twimg.com")) { platform = "x"; name = "X" }
        else if (isDomain("deviantart.com") || isDomain("sta.sh")) { platform = "deviantart"; name = "DeviantArt" }
        else if (isDomain("artstation.com")) { platform = "artstation"; name = "ArtStation" }
        else if (isDomain("tumblr.com")) { platform = "tumblr"; name = "Tumblr" }
        else if (isDomain("instagram.com")) { platform = "instagram"; name = "Instagram" }
        else if (isDomain("patreon.com")) { platform = "patreon"; name = "Patreon" }
        val key = if (platform == "website") host else platform
        if (!seen.add(key)) continue
        links.add(SourceLink(platform, name, href))
    }
    return links
}

/* ------------------------------------------------------- display helpers */

fun displayName(value: String): String =
    value.replace('_', ' ').split(" ").joinToString(" ") { word ->
        if (word.isNotEmpty() && word[0] in 'a'..'z') word.replaceFirstChar { it.uppercaseChar() } else word
    }
