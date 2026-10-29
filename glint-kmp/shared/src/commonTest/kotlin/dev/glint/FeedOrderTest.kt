package dev.glint

import dev.glint.sources.Sources
import kotlin.test.Test
import kotlin.test.assertEquals

/** Port of tests/feed-order.test.cjs: Popular maps to genuine native orders. */
class FeedOrderTest {

    @Test
    fun popularitySupportMatchesThePwa() {
        Sources.ensureLoaded()
        val supports = mapOf(
            "danbooru" to true, "yandere" to true, "konachan" to true, "sakuga" to true,
            "e621" to true, "gelbooru" to true, "derpibooru" to true,
            "animepictures" to false, "eshuushuu" to true,
        )
        for ((source, supported) in supports) {
            assertEquals(supported, Sources.postPopularitySupported(source), "$source popularity support")
        }
    }

    @Test
    fun popularityTokensArePerEngine() {
        assertEquals("order:score", Sources.orderToken("danbooru", "popularity"))
        assertEquals("order:score", Sources.orderToken("moebooru", "popularity"))
        assertEquals("order:score", Sources.orderToken("e621", "popularity"))
        assertEquals("sort:score:desc", Sources.orderToken("gelbooru", "popularity"))
    }

    @Test
    fun oldestTokensArePerEngine() {
        assertEquals("order:id_asc", Sources.orderToken("danbooru", "oldest"))
        assertEquals("order:id", Sources.orderToken("moebooru", "oldest"))
        assertEquals("order:id_asc", Sources.orderToken("e621", "oldest"))
        assertEquals("sort:id:asc", Sources.orderToken("gelbooru", "oldest"))
    }

    @Test
    fun newestStaysTokenFree() {
        for (engine in listOf("danbooru", "moebooru", "e621", "gelbooru")) {
            assertEquals("", Sources.orderToken(engine, "newest"), "$engine newest token-free")
        }
    }
}
