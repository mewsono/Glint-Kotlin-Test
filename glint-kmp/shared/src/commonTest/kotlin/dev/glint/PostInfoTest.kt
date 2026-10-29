package dev.glint

import dev.glint.app.fileSizeLabel
import dev.glint.app.postRating
import dev.glint.app.postTagGroups
import dev.glint.app.uploadTimeLabel
import dev.glint.core.*
import dev.glint.model.Pin
import dev.glint.sources.displayName
import dev.glint.sources.postFileInfo
import dev.glint.sources.postMetadata
import kotlin.test.Test
import kotlin.test.assertEquals

/** Ports of tests/post-metadata.test.cjs and tests/file-info.test.cjs. */
class PostInfoTest {

    private fun obj(json: String) = parseJsonOrNull(json)?.objOrNull

    @Test
    fun danbooruCategorizedTagStrings() {
        val info = postMetadata(
            obj(
                """{"tag_string_character":"hatsune_miku kagamine_rin",
                    "tag_string_copyright":"vocaloid",
                    "tag_string_artist":"sakimichan",
                    "author":"uploader_not_artist"}""",
            ),
        )
        assertEquals(listOf("hatsune_miku", "kagamine_rin"), info.characters)
        assertEquals(listOf("vocaloid"), info.series)
        assertEquals(listOf("sakimichan"), info.artists)
        assertEquals(true, info.detailsReady)
    }

    @Test
    fun e621GroupedTagObjects() {
        val info = postMetadata(
            obj("""{"tags":{"character":["character_one"],"copyright":["series_one"],"artist":["artist_one"],"general":["1girl"]}}"""),
        )
        assertEquals(listOf("character_one"), info.characters)
        assertEquals(listOf("artist_one"), info.artists)
    }

    @Test
    fun moebooruTagTypesMap() {
        val info = postMetadata(
            obj("""{"tags":"char_one series_one artist_one general_tag","author":"not_the_artist"}"""),
            knownTypes = mapOf("char_one" to "character", "series_one" to "copyright", "artist_one" to "artist", "general_tag" to "general"),
        )
        assertEquals(listOf("char_one"), info.characters)
        assertEquals(listOf("series_one"), info.series)
        assertEquals(listOf("artist_one"), info.artists)
    }

    @Test
    fun uploaderIsNeverTheArtist() {
        val info = postMetadata(obj("""{"author":"just_the_uploader","tags":"some_general_tags"}"""))
        assertEquals(emptyList(), info.characters)
        assertEquals(emptyList(), info.series)
        assertEquals(emptyList(), info.artists)
    }

    @Test
    fun junkArtistNamesAreDropped() {
        val info = postMetadata(
            obj("""{"tag_string_character":"","tag_string_copyright":"","tag_string_artist":"unknown_artist artist_request"}"""),
        )
        assertEquals(emptyList(), info.artists)
        assertEquals(true, info.detailsReady)
    }

    @Test
    fun fileInfoNormalization() {
        var fi = postFileInfo(obj("""{"file_size":2500000,"file_ext":"png"}"""), "", "", "")
        assertEquals(2500000L, fi.fileSize); assertEquals("PNG", fi.fileType); assertEquals(true, fi.ready)

        fi = postFileInfo(obj("""{"file":{"size":2097152,"ext":"jpg"}}"""), "", "", "")
        assertEquals(2097152L, fi.fileSize); assertEquals("JPEG", fi.fileType)

        fi = postFileInfo(obj("""{"file_size":1000,"file_ext":".webp"}"""), "", "", "")
        assertEquals("WEBP", fi.fileType)

        assertEquals("JPEG", postFileInfo(obj("""{"mime_type":"image/jpeg"}"""), "", "", "").fileType)
        assertEquals(1234L, postFileInfo(obj("""{"file_size":1234,"sample_file_size":600}"""), "", "", "").fileSize)
        assertEquals(null, postFileInfo(obj("""{"file_size":0}"""), "", "", "").fileSize)
        assertEquals(null, postFileInfo(obj("""{"file_size":-3}"""), "", "", "").fileSize)

        // No metadata at all: honest missing-data handling, nothing invented.
        val empty = postFileInfo(null, "", "", "")
        assertEquals(null, empty.fileSize); assertEquals("", empty.fileType); assertEquals(false, empty.ready)
    }

    @Test
    fun proxiedMediaExtensionStillCounts() {
        val fi = postFileInfo(
            obj("""{}"""), "", "",
            "./api/proxy?u=" + dev.glint.core.encodeURIComponent("https://cdn.donmai.us/original/pic.png"),
        )
        assertEquals("PNG", fi.fileType)
    }

    @Test
    fun fileSizeLabels() {
        assertEquals("Not provided", fileSizeLabel(null))
        assertEquals("Not provided", fileSizeLabel(0))
        assertEquals("2.5 MB", fileSizeLabel(2_500_000))
        assertEquals("999 B", fileSizeLabel(999))
    }

    @Test
    fun uploadTimeLabels() {
        val now = 1_700_000_000_000L
        assertEquals("Just now", uploadTimeLabel(now - 30_000, now))
        assertEquals("a minute ago", uploadTimeLabel(now - 90_000, now))
        assertEquals("an hour ago", uploadTimeLabel(now - 3_700_000, now))
        assertEquals("3 days ago", uploadTimeLabel(now - 3L * 86_400_000 - 60_000, now))
        assertEquals("Not provided", uploadTimeLabel(null, now))
    }

    @Test
    fun ratingLabelsFollowEngineSemantics() {
        // Plain s is Safe for engines whose API predates Sensitive.
        assertEquals("S · Safe", postRating(Pin(id = "a", rating = "s")).label)
        assertEquals("E · Explicit", postRating(Pin(id = "a", rating = "explicit")).label)
        assertEquals("Not provided", postRating(Pin(id = "a", rating = "weird")).label)
    }

    @Test
    fun tagGroupsSeparateSpecialNames() {
        val p = Pin(
            id = "a",
            tags = listOf("hatsune_miku", "vocaloid", "1girl", "smile"),
            characters = listOf("hatsune_miku"),
            series = listOf("vocaloid"),
        )
        val groups = postTagGroups(p)
        assertEquals(listOf("character", "series", "general"), groups.map { it.key })
        assertEquals(listOf("1girl", "smile"), groups.last().tags)
    }

    @Test
    fun displayNamesHumanizeUnderscores() {
        assertEquals("Hatsune Miku", displayName("hatsune_miku"))
    }
}
