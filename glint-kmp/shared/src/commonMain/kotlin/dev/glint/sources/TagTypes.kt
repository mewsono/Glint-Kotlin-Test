package dev.glint.sources

import dev.glint.core.LenientJson
import dev.glint.core.Platform
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Port of PB_TAG_TYPES: Moebooru tag names carry no prefix, so the site's tag
 * map is remembered across launches and posts classify instantly.
 */
object TagTypes {
    const val KEY = "pb-tag-types-v1"
    const val MAX = 4000
    private val map = LinkedHashMap<String, String>()
    private var loaded = false

    private fun ensureLoaded() {
        if (loaded) return
        loaded = true
        try {
            val raw = Platform.storage().get(KEY) ?: return
            val decoded = LenientJson.decodeFromString(MapSerializer(String.serializer(), String.serializer()), raw)
            for ((tag, type) in decoded) if (map.size < MAX) map[tag] = type
        } catch (_: Throwable) {}
    }

    private fun save() {
        try {
            val entries = map.entries.toList().takeLast(MAX).associate { it.key to it.value }
            Platform.storage().put(KEY, LenientJson.encodeToString(MapSerializer(String.serializer(), String.serializer()), entries))
        } catch (_: Throwable) {}
    }

    /** Merge a {tag: type} map from the site; returns the merged view. */
    fun merge(types: JsonObject?): Map<String, String>? {
        ensureLoaded()
        if (types == null) return null
        var added = false
        for ((tag, type) in types) {
            if (tag.isEmpty()) continue
            val raw = (type as? JsonPrimitive)?.content ?: continue
            val value = mapOf("0" to "general", "1" to "artist", "3" to "copyright", "4" to "character")[raw] ?: raw
            if (map[tag] != value) { map[tag] = value; added = true }
        }
        if (added) save()
        return map.toMap()
    }

    /** Types for a set of tags, without a request when we already know them. */
    fun known(tags: List<String>): Map<String, String>? {
        ensureLoaded()
        if (tags.isEmpty()) return null
        val out = HashMap<String, String>()
        for (tag in tags) {
            val type = map[tag] ?: return null
            out[tag] = type
        }
        return out
    }
}
