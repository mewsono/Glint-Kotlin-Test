package dev.glint.data

import dev.glint.core.*
import dev.glint.model.BookmarkRecord
import dev.glint.model.PersistedState
import dev.glint.model.Pin
import dev.glint.sources.Sources
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Persistence of the app state under the PWA's "pb2" key, with the same
 * bookmark JSON backup format ("pinboard-bookmarks" version 1).
 */
object Store {
    const val KEY = "pb2"
    const val RECOVERY_KEY = "pb2-recovery-v65"
    const val BACKUP_FORMAT = "pinboard-bookmarks"
    const val IMPORT_LIMIT = 8L * 1024 * 1024

    var storageWarning: String = ""
        private set

    /* -------------------------------------------------------------- load */

    fun load(): PersistedState {
        Sources.ensureLoaded()
        val text = try { Platform.storage().get(KEY) ?: "" } catch (_: Throwable) { "" }
        val raw = if (text.isNotEmpty()) parseJsonOrNull(text)?.objOrNull else null
        if (text.isNotEmpty() && raw == null) {
            storageWarning = "Invalid saved data was preserved. Download a recovery copy before replacing it."
            try { if (Platform.storage().get(RECOVERY_KEY) == null) Platform.storage().put(RECOVERY_KEY, text) } catch (_: Throwable) {}
        }
        val decoded = if (raw != null) {
            try { LenientJson.decodeFromString(PersistedState.serializer(), text) } catch (_: Throwable) { fromLegacyJson(raw) }
        } else PersistedState()
        return normalize(decoded)
    }

    /** Accept the PWA's own pb2 blob (it has a different field layout). */
    fun fromLegacyJson(raw: JsonObject): PersistedState {
        fun strList(key: String): List<String> =
            raw.el(key).arrOrNull?.mapNotNull { el ->
                when (el) {
                    is JsonPrimitive -> el.content.trim().takeIf { it.isNotEmpty() && it.length <= 240 }
                    is JsonObject -> el.str("id").takeIf { it.isNotEmpty() }
                    else -> null
                }
            } ?: emptyList()

        val bookmarks = raw.el("bookmarks").arrOrNull?.mapNotNull { el ->
            when (el) {
                is JsonObject -> {
                    val id = el.str("id").trim()
                    if (id.isEmpty()) null else BookmarkRecord(id, el.el("savedAt").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0)
                }
                is JsonPrimitive -> el.content.trim().takeIf { it.isNotEmpty() }?.let { BookmarkRecord(it, 0) }
                else -> null
            }
        } ?: emptyList()

        val pinCache = raw.el("pinCache")?.objOrNull?.mapNotNull { (k, v) ->
            decodePin(v)?.let { p -> if (p.id == k) k to p else null }
        }?.toMap() ?: emptyMap()

        val live = raw.el("live")?.objOrNull?.mapValues { (_, v) ->
            v.arrOrNull?.mapNotNull { decodePin(it) } ?: emptyList()
        } ?: emptyMap()

        val iq = raw.el("iq")?.objOrNull

        return PersistedState(
            bookmarks = bookmarks,
            hidden = strList("hidden"),
            likes = strList("likes"),
            pinCache = pinCache,
            custom = raw.el("custom").arrOrNull?.mapNotNull { decodePin(it) } ?: emptyList(),
            live = live,
            lpage = raw.el("lpage")?.objOrNull?.mapNotNull { (k, v) ->
                v.asStringOr("").toDoubleOrNull()?.toInt()?.let { k to it }
            }?.toMap() ?: emptyMap(),
            src = raw.str("src", "danbooru"),
            srcs = strList("srcs").ifEmpty { listOf("danbooru", "yandere") },
            mode = raw.str("mode", "live"),
            screen = raw.str("screen", "home"),
            theme = raw.str("theme", "dark"),
            cols = raw.el("cols").asStringOr("2").toDoubleOrNull()?.toInt() ?: 2,
            bt = raw.str("bt", "Bookmarks"),
            q = raw.str("q"),
            stags = raw.el("stags")?.objOrNull?.mapValues { it.value.asStringOr("") } ?: emptyMap(),
            forder = raw.el("forder")?.objOrNull?.mapValues { it.value.asStringOr("") } ?: emptyMap(),
            iqFeed = iq?.str("feed", "thumb") ?: "thumb",
            iqDetail = iq?.str("detail", "sample") ?: "sample",
            iqViewer = iq?.str("viewer", "orig") ?: "orig",
            sw = raw.str("sw", "left"),
            driveOn = raw.el("driveOn").asStringOr("false") == "true",
            driveAuto = raw.el("driveAuto").asStringOr("true") != "false",
            driveClientId = raw.str("driveClientId"),
            driveFileId = raw.str("driveFileId"),
            driveMod = raw.str("driveMod"),
            driveEmail = raw.str("driveEmail"),
            lastSync = raw.el("lastSync").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0,
            syncKeys = raw.el("syncKeys").asStringOr("false") == "true",
            bmDeleted = raw.el("bmDeleted")?.objOrNull?.mapNotNull { (k, v) ->
                v.asStringOr("").toDoubleOrNull()?.toLong()?.let { k to it }
            }?.toMap() ?: emptyMap(),
        )
    }

    /** Port of runtime.js pin(): sanitize one pin record from untrusted JSON. */
    fun decodePin(value: JsonElement?): Pin? {
        val o = value?.objOrNull ?: return null
        val id = o.str("id").trim()
        if (id.isEmpty() || id.length > 240) return null
        fun mediaURL(v: String): String {
            if (v.isEmpty() || v.length > 12 * 1024 * 1024) return ""
            if (v.startsWith("data:image/")) return v
            return if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(v)) v else ""
        }
        fun list(key: String): List<String> =
            o.el(key).arrOrNull?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList()
        return Pin(
            id = id,
            sid = o.str("sid"),
            src = o.str("src"),
            srcName = o.str("srcName"),
            t = o.str("t"),
            c = o.str("c"),
            tags = list("tags"),
            rating = o.str("rating", "s"),
            width = o.el("width").asStringOr("0").toDoubleOrNull()?.toInt() ?: 0,
            height = o.el("height").asStringOr("0").toDoubleOrNull()?.toInt() ?: 0,
            r = o.el("r").asStringOr("").toDoubleOrNull()
                ?: o.el("ar").asStringOr("").toDoubleOrNull() ?: 1.2,
            grid = mediaURL(o.str("grid")),
            sample = mediaURL(o.str("sample")),
            orig = mediaURL(o.str("orig")),
            score = o.el("score").asStringOr("0").toDoubleOrNull()?.toInt() ?: 0,
            author = o.str("author"),
            date = o.el("date").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0,
            artists = list("artists"),
            characters = list("characters"),
            series = list("series"),
            detailsReady = o.el("detailsReady").asStringOr("") == "true",
            fileSize = o.el("fileSize").asStringOr("").toDoubleOrNull()?.toLong(),
            fileType = o.str("fileType"),
            fileInfoReady = o.el("fileInfoReady").asStringOr("") == "true",
            uploadedAt = o.el("uploadedAt").asStringOr("").toDoubleOrNull()?.toLong(),
            uploadInfoReady = o.el("uploadInfoReady").asStringOr("") == "true",
            sourceInfoReady = o.el("sourceInfoReady").asStringOr("") == "true",
            h = o.el("h").asStringOr("0").toDoubleOrNull()?.toInt() ?: 0,
            h2 = o.el("h2").asStringOr("0").toDoubleOrNull()?.toInt() ?: 0,
            x = o.el("x").asStringOr("0").toDoubleOrNull()?.toInt() ?: 0,
        )
    }

    /* --------------------------------------------------------- normalize */

    fun normalize(s: PersistedState): PersistedState {
        Sources.ensureLoaded()
        var srcs = s.srcs.distinct().filter { Sources.has(it) }
        if (srcs.none { Sources.all[it]?.off == false }) srcs = listOf("danbooru") + srcs
        var src = s.src
        if (!Sources.has(src) || Sources.all[src]?.off == true || src !in srcs) {
            src = srcs.first { Sources.all[it]?.off == false }
        }
        return s.copy(
            bookmarks = migrateBookmarkRecords(s.bookmarks),
            bookmarkVersion = 1,
            srcs = srcs,
            src = src,
            screen = if (s.screen in listOf("home", "search", "profile")) s.screen else "home",
            theme = if (s.theme in listOf("light", "dark", "system")) s.theme else "dark",
            cols = if (s.cols in 1..3) s.cols else 2,
            mode = if (s.mode in listOf("live", "demo")) s.mode else "live",
            bt = if (s.bt in listOf("Likes", "Bookmarks", "Explore")) s.bt else "Bookmarks",
            sw = if (s.sw in listOf("left", "right")) s.sw else "left",
            iqFeed = if (s.iqFeed in listOf("thumb", "sharp")) s.iqFeed else "thumb",
            iqDetail = if (s.iqDetail in listOf("sample", "orig")) s.iqDetail else "sample",
            iqViewer = if (s.iqViewer in listOf("sample", "orig")) s.iqViewer else "orig",
            live = s.live.mapValues { (_, v) -> v.filter { it.id.isNotEmpty() } },
            pinCache = s.pinCache.filterValues { it.id.isNotEmpty() },
        )
    }

    /** Port of migrateBookmarkRecords: newest first, deduplicated by id. */
    fun migrateBookmarkRecords(records: List<BookmarkRecord>): List<BookmarkRecord> {
        val saved = LinkedHashMap<String, BookmarkRecord>()
        for (record in records) {
            val id = record.id.trim()
            if (id.isEmpty()) continue
            val savedAt = if (record.savedAt > 0) record.savedAt else 0
            val existing = saved[id]
            if (existing == null || savedAt > existing.savedAt) saved[id] = BookmarkRecord(id, savedAt)
        }
        return saved.values.sortedByDescending { it.savedAt }
    }

    /* ----------------------------------------------------------- persist */

    /**
     * Persist with the PWA's budget-shedding ladder: user saves and their
     * metadata are never evicted to make room for feeds.
     */
    fun persist(s: PersistedState): Boolean {
        val saved = s.bookmarks.map { it.id }.toSet()
        val cache = HashMap(s.pinCache)
        for (p in s.custom + s.live.values.flatten()) if (p.id in saved) cache[p.id] = p
        val snapshots = listOf(
            s.copy(pinCache = cache, live = s.live.mapValues { (_, v) -> v.takeLast(60) }),
            s.copy(pinCache = cache, live = emptyMap()),
            s.copy(pinCache = cache.filterKeys { it in saved }, live = emptyMap()),
        )
        for (candidate in snapshots) {
            val ok = try {
                Platform.storage().put(KEY, LenientJson.encodeToString(PersistedState.serializer(), candidate))
            } catch (_: Throwable) { false }
            if (ok) { storageWarning = ""; return true }
        }
        storageWarning = "Storage is unavailable or full. Changes could not be saved. Export your bookmarks before closing this app."
        return false
    }

    /* ----------------------------------------------------- import/export */

    private fun pinToBackupJson(p: Pin): JsonObject = buildJsonObject {
        put("id", p.id); put("sid", p.sid); put("src", p.src); put("srcName", p.srcName)
        put("t", p.t); if (p.c.isNotEmpty()) put("c", p.c)
        put("r", p.r); put("grid", p.grid); put("sample", p.sample); put("orig", p.orig)
        put("width", p.width); put("height", p.height)
        put("tags", buildJsonArray { p.tags.forEach { add(JsonPrimitive(it)) } })
        put("artists", buildJsonArray { p.artists.forEach { add(JsonPrimitive(it)) } })
        put("characters", buildJsonArray { p.characters.forEach { add(JsonPrimitive(it)) } })
        put("series", buildJsonArray { p.series.forEach { add(JsonPrimitive(it)) } })
        put("date", p.date)
        p.uploadedAt?.let { put("uploadedAt", it) }
        p.fileSize?.let { put("fileSize", it) }
        if (p.fileType.isNotEmpty()) put("fileType", p.fileType)
        put("rating", p.rating); put("score", p.score)
        put("detailsReady", p.detailsReady); put("fileInfoReady", p.fileInfoReady)
        put("sourceInfoReady", p.sourceInfoReady); put("uploadInfoReady", p.uploadInfoReady)
        if (p.h != 0) put("h", p.h); if (p.h2 != 0) put("h2", p.h2); if (p.x != 0) put("x", p.x)
    }

    /** The PWA's exact backup shape: format/version/exportedAt/bookmarks/pinCache/custom. */
    fun exportBackupJson(s: PersistedState, exportedAt: String): String {
        val saved = s.bookmarks.map { it.id }.toSet()
        val cache = HashMap<String, Pin>()
        for (p in s.pinCache.values + s.live.values.flatten() + s.custom) if (p.id in saved) cache[p.id] = p
        return buildJsonObject {
            put("format", BACKUP_FORMAT)
            put("version", 1)
            put("exportedAt", exportedAt)
            put("bookmarks", buildJsonArray {
                s.bookmarks.forEach { b ->
                    add(buildJsonObject { put("id", b.id); put("savedAt", b.savedAt) })
                }
            })
            put("pinCache", buildJsonObject { for ((k, v) in cache) put(k, pinToBackupJson(v)) })
            put("custom", buildJsonArray {
                s.custom.filter { it.id in saved }.forEach { add(pinToBackupJson(it)) }
            })
        }.toString()
    }

    data class ImportResult(val state: PersistedState, val added: Int)

    /** Merge a "pinboard-bookmarks" v1 backup. Throws a readable error otherwise. */
    fun importBackup(s: PersistedState, text: String): ImportResult {
        if (text.length > IMPORT_LIMIT) throw IllegalArgumentException("This backup exceeds the 8 MB import limit.")
        val data = parseJsonOrNull(text)?.objOrNull
            ?: throw IllegalArgumentException("This is not valid JSON. Nothing was imported.")
        val format = data.el("format").asStringOr("")
        val version = data.el("version").asStringOr("").toDoubleOrNull()?.toInt()
        val bookmarks = data.el("bookmarks") as? JsonArray
        if (format != BACKUP_FORMAT || version != 1 || bookmarks == null) {
            throw IllegalArgumentException("Choose a Glint bookmark backup JSON file.")
        }
        val records = migrateBookmarkRecords(bookmarks.mapNotNull { el ->
            when (el) {
                is JsonObject -> {
                    val id = el.str("id").trim()
                    if (id.isEmpty()) null else BookmarkRecord(id, el.el("savedAt").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0)
                }
                is JsonPrimitive -> el.content.trim().takeIf { it.isNotEmpty() }?.let { BookmarkRecord(it, 0) }
                else -> null
            }
        })
        val existing = s.bookmarks.map { it.id }.toSet()
        val added = records.filter { it.id !in existing }
        val cache = data.el("pinCache")?.objOrNull?.mapNotNull { (k, v) ->
            decodePin(v)?.let { p -> if (p.id == k) k to p else null }
        }?.toMap() ?: emptyMap()
        val custom = (data.el("custom") as? JsonArray)?.mapNotNull { decodePin(it) } ?: emptyList()
        val knownCustom = s.custom.map { it.id }.toSet()
        val next = s.copy(
            bookmarks = migrateBookmarkRecords(s.bookmarks + added),
            pinCache = cache + s.pinCache,
            custom = s.custom + custom.filter { it.id !in knownCustom },
        )
        return ImportResult(next, added.size)
    }
}
