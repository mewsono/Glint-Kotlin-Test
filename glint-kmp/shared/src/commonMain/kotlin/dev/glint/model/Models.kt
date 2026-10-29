package dev.glint.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * A normalised post ("pin"), the same shape the PWA uses.
 * `id` is "<srcId>-<sid>" for live posts, matching app.js normPin().
 */
@Serializable
data class Pin(
    val id: String,
    val sid: String = "",
    val src: String = "",
    val srcName: String = "",
    val t: String = "",                 // title
    val tags: List<String> = emptyList(),
    val rating: String = "s",
    val width: Int = 0,
    val height: Int = 0,
    val r: Double = 1.2,                // aspect ratio h/w, clamped 0.4..2.6
    val grid: String = "",
    val sample: String = "",
    val orig: String = "",
    val score: Int = 0,
    val author: String = "",
    val date: Long = 0,
    // categorized metadata (filled by detail loads / list payloads)
    val artists: List<String> = emptyList(),
    val characters: List<String> = emptyList(),
    val series: List<String> = emptyList(),
    val detailsReady: Boolean = false,
    // file info
    val fileSize: Long? = null,
    val fileType: String = "",
    val fileInfoReady: Boolean = false,
    // upload info
    val uploadedAt: Long? = null,
    val uploadInfoReady: Boolean = false,
    // origin links
    val sourceLinks: List<SourceLink> = emptyList(),
    val sourceInfoReady: Boolean = false,
    // demo pins (procedural gradient artwork)
    val h: Int = 0,
    val h2: Int = 0,
    val x: Int = 0,
    val c: String = "",                 // demo category
) {
    val isDemo: Boolean get() = src.isEmpty() && grid.isEmpty()
}

@Serializable
data class SourceLink(val platform: String, val name: String, val url: String)

/** Bookmark record: id + savedAt, exactly the PWA's storage format. */
@Serializable
data class BookmarkRecord(val id: String, val savedAt: Long = 0)

/** Per-source account credentials, like PB_AUTH records. */
@Serializable
data class AuthRecord(
    val login: String = "",
    val apiKey: String = "",
    val passHash: String = "",
    val session: String = "",           // gelbooru pass_hash cookie
    val hashVersion: Int = 0,           // sakuga salt fix marker (2 = current)
    val needsReentry: Boolean = false,
    val verifiedAt: Long? = null,
)

/** A user-added custom source record (pb-custom-sources-v1). */
@Serializable
data class CustomSourceRecord(
    val id: String,
    val name: String,
    val base: String,
    val engine: String,
    val addedAt: Long = 0,
    val updatedAt: Long = 0,
)

@Serializable
data class SearchHistoryEntry(val query: String, val source: String, val at: Long = 0)

/** Raw post payload: engines parse provider JSON into these before mapping. */
data class RawPost(val json: JsonObject? = null, val html: HtmlPost? = null, val tagTypes: Map<String, String>? = null)

data class HtmlPost(val id: String, val thumb: String, val path: String = "")

/** A page request produced by an engine's list(). */
data class ListRequest(
    val url: String = "",
    val method: String = "GET",
    val body: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val html: Boolean = false,
    val inline: List<RawPost>? = null,
)

/** The result of loading one page of posts. */
data class PostBatch(
    val pins: List<Pin>,
    val rawCount: Int,
    val batchKey: String,
    val nextCursor: String? = null,
    val hasMore: Boolean,
    val endConfirmed: Boolean = false,
    val total: Int? = null,
)

data class TagSuggestion(val name: String, val count: Int?, val category: String?)

data class ExploreSection(
    val key: String,
    val title: String,
    val scales: List<String>,
    val def: String,
    val paged: Boolean,
    val note: String = "",
)

/** The persisted application state: a faithful subset of the PWA's `pb2` blob. */
@Serializable
data class PersistedState(
    val bookmarks: List<BookmarkRecord> = emptyList(),
    val bookmarkVersion: Int = 1,
    val hidden: List<String> = emptyList(),
    val likes: List<String> = emptyList(),
    val pinCache: Map<String, Pin> = emptyMap(),
    val custom: List<Pin> = emptyList(),
    val live: Map<String, List<Pin>> = emptyMap(),
    val lpage: Map<String, Int> = emptyMap(),
    val src: String = "danbooru",
    val srcs: List<String> = listOf("danbooru", "yandere"),
    val mode: String = "live",
    val screen: String = "home",
    val theme: String = "dark",         // "dark" | "light" | "system"
    val cols: Int = 2,
    val bt: String = "Bookmarks",
    val q: String = "",
    val stags: Map<String, String> = emptyMap(),
    val forder: Map<String, String> = emptyMap(),
    val iqFeed: String = "thumb",
    val iqDetail: String = "sample",
    val iqViewer: String = "orig",
    val sw: String = "left",
    val driveOn: Boolean = false,
    val driveAuto: Boolean = true,
    val driveClientId: String = "",
    val driveFileId: String = "",
    val driveMod: String = "",
    val driveDirty: Boolean = false,
    val driveEmail: String = "",
    val lastSync: Long = 0,
    val syncKeys: Boolean = false,
    val bmDeleted: Map<String, Long> = emptyMap(),
    val setAt: Long = 0,
)
