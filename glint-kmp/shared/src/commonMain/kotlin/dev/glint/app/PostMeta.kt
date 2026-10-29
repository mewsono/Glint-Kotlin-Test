package dev.glint.app

import dev.glint.core.Platform
import dev.glint.model.Pin
import dev.glint.sources.Sources
import dev.glint.sources.displayName
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.round

/** "1.23 MB" style label (PWA fileSizeLabel, decimal units). */
fun fileSizeLabel(bytes: Long?): String {
    val b = bytes ?: return "Not provided"
    if (b <= 0) return "Not provided"
    val units = listOf("B", "KB", "MB", "GB")
    val index = minOf(3, floor(ln(b.toDouble()) / ln(1000.0)).toInt())
    val value = b.toDouble() / 1000.0.pow(index.toDouble())
    val text = if (index == 0) value.toInt().toString() else {
        val rounded = round(value * 100) / 100
        if (rounded == floor(rounded)) rounded.toInt().toString() else rounded.toString()
    }
    return "$text ${units[index]}"
}

data class RatingLabel(val code: String, val label: String)

/** Port of postRating incl. the Danbooru S=Sensitive and Philomena tag scan. */
fun postRating(p: Pin): RatingLabel {
    val aliases = mapOf("safe" to "s", "general" to "g", "sensitive" to "s", "questionable" to "q", "explicit" to "e")
    var code = p.rating.lowercase()
    code = aliases[code] ?: code
    var label = mapOf("s" to "Safe", "g" to "General", "q" to "Questionable", "e" to "Explicit")[code]
    val source = Sources.all[p.src]
    if (code == "s" && source?.engine == "danbooru") label = "Sensitive"
    if (source?.engine == "philomena") {
        val tags = p.tags.map { it.lowercase() }.toSet()
        for ((tag, rating) in listOf("explicit" to "e", "questionable" to "q", "suggestive" to "s", "safe" to "s")) {
            if (tag in tags) { code = rating; label = displayName(tag); break }
        }
    }
    return if (label != null) RatingLabel(code, code.uppercase() + " · " + label) else RatingLabel("unknown", "Not provided")
}

/** "3 days ago" labels (PWA uploadTimeLabel). */
fun uploadTimeLabel(value: Long?, now: Long = Platform.epochMillis()): String {
    val stamp = value ?: return "Not provided"
    if (stamp <= 0) return "Not provided"
    val seconds = (now - stamp) / 1000
    val elapsed = abs(seconds)
    if (elapsed < 60) return "Just now"
    for ((duration, unit) in listOf(
        31_536_000L to "year", 2_592_000L to "month", 604_800L to "week",
        86_400L to "day", 3_600L to "hour", 60L to "minute",
    )) {
        if (elapsed >= duration) {
            val n = elapsed / duration
            if (seconds < 0) return "in $n $unit" + if (n == 1L) "" else "s"
            return if (n == 1L) (if (unit == "hour") "an hour ago" else "a $unit ago") else "$n ${unit}s ago"
        }
    }
    return "Just now"
}

data class TagGroup(val key: String, val label: String, val tags: List<String>)

/** Character / Artist / Series + Other tags (PWA postTagsMarkup grouping). */
fun postTagGroups(p: Pin): List<TagGroup> {
    fun clean(list: List<String>) = list.filter { it.isNotEmpty() }.distinct()
    val groups = mutableListOf(
        TagGroup("character", "Character", clean(p.characters)),
        TagGroup("artist", "Artist", clean(p.artists)),
        TagGroup("series", "Series", clean(p.series)),
    )
    val special = groups.flatMap { it.tags }.toSet()
    val other = clean(p.tags).filter { tag ->
        tag !in special && tag.replace(Regex("^(artist|character|copyright|series):"), "") !in special
    }
    groups.add(TagGroup("general", "Other tags", other))
    return groups.filter { it.tags.isNotEmpty() }
}
