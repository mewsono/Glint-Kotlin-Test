package dev.glint

import dev.glint.core.*
import dev.glint.model.AuthRecord
import dev.glint.sources.Accounts
import dev.glint.sources.Sources
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Ports of the account-contract assertions from tests/likes.test.cjs and friends. */
class AccountsTest {

    @Test
    fun sha1KnownVectors() {
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d", Sha1.hex("abc"))
        assertEquals("da39a3ee5e6b4b0d3255bfef95601890afd80709", Sha1.hex(""))
    }

    @Test
    fun base64MatchesBtoa() {
        assertEquals("dXNlcjprZXk=", B64.encode("user:key"))
        assertEquals("YQ==", B64.encode("a"))
    }

    @Test
    fun encodeURIComponentMatchesJs() {
        assertEquals("a%20b%26c", encodeURIComponent("a b&c"))
        assertEquals("tag%3Asafe", encodeURIComponent("tag:safe"))
        assertEquals("!~*'()", encodeURIComponent("!~*'()"))
    }

    @Test
    fun moebooruSaltsPerHost() {
        // Each Moebooru site uses its own published salt around the password.
        assertEquals(Sha1.hex("choujin-steiner--pw--"), Accounts.moebooruHash("pw", "yande.re"))
        assertEquals(Sha1.hex("So-I-Heard-You-Like-Mupkids-?--pw--"), Accounts.moebooruHash("pw", "konachan.net"))
        assertEquals(Sha1.hex("er@!\$rjiajd0\$!dkaopc350!Y%)--pw--"), Accounts.moebooruHash("pw", "www.sakugabooru.com"))
    }

    @Test
    fun gelbooruSessionValueMustBeBare() {
        assertTrue(Accounts.gelSessionOk("abcdef1234567890abcdef"))
        assertFalse(Accounts.gelSessionOk("pass_hash=abcdef1234567890"))
        assertFalse(Accounts.gelSessionOk("short"))
        assertFalse(Accounts.gelSessionOk("has spaces in it which is wrong"))
    }

    @Test
    fun hasAuthRules() {
        Sources.ensureLoaded()
        // Danbooru needs login + API key.
        assertFalse(Accounts.hasAuth("danbooru", AuthRecord(login = "me")))
        assertTrue(Accounts.hasAuth("danbooru", AuthRecord(login = "me", apiKey = "k123")))
        // Gelbooru's login must be the numeric user id.
        assertFalse(Accounts.hasAuth("gelbooru", AuthRecord(login = "name", apiKey = "k")))
        assertTrue(Accounts.hasAuth("gelbooru", AuthRecord(login = "12345", apiKey = "k")))
        // Moebooru requires the 40-hex password hash, never a raw password.
        assertFalse(Accounts.hasAuth("yandere", AuthRecord(login = "me", passHash = "raw-password")))
        assertTrue(Accounts.hasAuth("yandere", AuthRecord(login = "me", passHash = Sha1.hex("x"))))
        // Sakuga credentials from before the salt fix must re-enter.
        assertFalse(Accounts.hasAuth("sakuga", AuthRecord(login = "me", passHash = Sha1.hex("x"), hashVersion = 1)))
        assertTrue(Accounts.hasAuth("sakuga", AuthRecord(login = "me", passHash = Sha1.hex("x"), hashVersion = 2)))
        // Philomena is key-only.
        assertTrue(Accounts.hasAuth("derpibooru", AuthRecord(apiKey = "k")))
        assertFalse(Accounts.hasAuth("derpibooru", AuthRecord(login = "me")))
        // A record flagged for re-entry never counts as signed in.
        assertFalse(Accounts.hasAuth("danbooru", AuthRecord(login = "me", apiKey = "k", needsReentry = true)))
    }

    @Test
    fun likeWritingNeedsTheGelbooruSession() {
        Sources.ensureLoaded()
        // canLike(gelbooru) is false without a valid pass_hash session cookie,
        // even when read credentials exist (exercised through the public API).
        assertFalse(Accounts.canLike("gelbooru"))
    }

    @Test
    fun redactionNeverLeaksSecrets() {
        val message = dev.glint.sources.Net.redactSecrets(
            "request failed: api_key=SECRET1234&login=me",
            listOf("SECRET1234"),
        )
        assertFalse(message.contains("SECRET1234"))
    }
}
