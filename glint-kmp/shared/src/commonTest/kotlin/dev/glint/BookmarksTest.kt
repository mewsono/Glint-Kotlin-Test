package dev.glint

import dev.glint.data.Store
import dev.glint.model.BookmarkRecord
import dev.glint.model.PersistedState
import dev.glint.model.Pin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Ports of tests/bookmarks.test.cjs (record migration) and the backup contract. */
class BookmarksTest {

    @Test
    fun migrationDeduplicatesKeepingNewest() {
        val records = Store.migrateBookmarkRecords(
            listOf(
                BookmarkRecord("danbooru-1", 123),
                BookmarkRecord("danbooru-1", 100),
                BookmarkRecord("", 999),
            ),
        )
        assertEquals(listOf(BookmarkRecord("danbooru-1", 123)), records)
    }

    @Test
    fun migrationSortsNewestFirst() {
        val records = Store.migrateBookmarkRecords(
            listOf(
                BookmarkRecord("a", 100),
                BookmarkRecord("b", 300),
                BookmarkRecord("c", 200),
            ),
        )
        assertEquals(listOf("b", "c", "a"), records.map { it.id })
    }

    @Test
    fun exportCarriesTheExactBackupShape() {
        val state = PersistedState(
            bookmarks = listOf(BookmarkRecord("danbooru-1", 5)),
            pinCache = mapOf("danbooru-1" to Pin(id = "danbooru-1", sid = "1", src = "danbooru", grid = "https://x/img.jpg")),
        )
        val json = Store.exportBackupJson(state, "2026-01-01T00:00:00.000Z")
        assertTrue(json.contains("\"format\":\"pinboard-bookmarks\""))
        assertTrue(json.contains("\"version\":1"))
        assertTrue(json.contains("\"exportedAt\":\"2026-01-01T00:00:00.000Z\""))
        assertTrue(json.contains("\"danbooru-1\""))
    }

    @Test
    fun importRejectsForeignJson() {
        assertFailsWith<IllegalArgumentException> {
            Store.importBackup(PersistedState(), "{\"other\":true}")
        }
        assertFailsWith<IllegalArgumentException> {
            Store.importBackup(PersistedState(), "not json at all")
        }
    }

    @Test
    fun importMergesSkippingExistingRecords() {
        val state = PersistedState(bookmarks = listOf(BookmarkRecord("danbooru-1", 50)))
        val backup = """
            {"format":"pinboard-bookmarks","version":1,"exportedAt":"x",
             "bookmarks":[{"id":"danbooru-1","savedAt":999},{"id":"yandere-2","savedAt":10}],
             "pinCache":{"yandere-2":{"id":"yandere-2","sid":"2","src":"yandere"}},
             "custom":[]}
        """.trimIndent()
        val result = Store.importBackup(state, backup)
        assertEquals(1, result.added)
        // Existing save keeps its own savedAt: imports never resurrect/replace it.
        assertEquals(50L, result.state.bookmarks.first { it.id == "danbooru-1" }.savedAt)
        assertTrue(result.state.bookmarks.any { it.id == "yandere-2" })
        assertTrue(result.state.pinCache.containsKey("yandere-2"))
    }

    @Test
    fun importEnforcesTheSizeLimit() {
        val big = "x".repeat((Store.IMPORT_LIMIT + 1).toInt())
        assertFailsWith<IllegalArgumentException> { Store.importBackup(PersistedState(), big) }
    }

    @Test
    fun exportOnlyShipsSavedPins() {
        val state = PersistedState(
            bookmarks = listOf(BookmarkRecord("keep", 1)),
            pinCache = mapOf(
                "keep" to Pin(id = "keep"),
                "stray" to Pin(id = "stray"),
            ),
        )
        val json = Store.exportBackupJson(state, "now")
        assertTrue(json.contains("\"keep\""))
        assertTrue(!json.contains("\"stray\""))
    }
}
