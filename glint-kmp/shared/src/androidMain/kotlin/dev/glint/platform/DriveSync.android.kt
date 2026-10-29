package dev.glint.platform

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.glint.app.GlintStore
import dev.glint.core.AndroidBridge
import dev.glint.core.LenientJson
import dev.glint.core.Platform
import dev.glint.core.el
import dev.glint.core.encodeURIComponent
import dev.glint.core.objOrNull
import dev.glint.core.parseJsonOrNull
import dev.glint.core.asStringOr
import dev.glint.data.Store
import dev.glint.model.AuthRecord
import dev.glint.model.BookmarkRecord
import dev.glint.model.CustomSourceRecord
import dev.glint.model.Pin
import dev.glint.sources.Accounts
import dev.glint.sources.Sources
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.security.MessageDigest
import java.security.SecureRandom

private const val FILE_NAME = "pinboard-data.json"
private const val SCOPE = "https://www.googleapis.com/auth/drive.appdata"
private const val DRIVE = "https://www.googleapis.com/drive/v3"
private const val UPLOAD = "https://www.googleapis.com/upload/drive/v3"
private const val TOKEN_KEY = "pb-drive-android-token"
private const val REDIRECT = "dev.glint:/oauth2redirect"
private const val TOMBSTONE_DAYS = 90L

@Serializable
private data class DriveTokens(
    val access: String = "",
    val refresh: String = "",
    val expiresAt: Long = 0,
)

/**
 * Google Drive appDataFolder sync — the drive.js design on Android:
 * OAuth (PKCE, system browser, dev.glint:/oauth2redirect), one hidden JSON
 * file, merge-by-newest with deletion tombstones, debounced auto-upload.
 */
class DriveSyncAndroid(private val store: GlintStore) : DriveSyncApi {
    override val available: Boolean = true

    private var busy by mutableStateOf(false)
    private var error by mutableStateOf("")
    private var note by mutableStateOf("")
    private var tokens = loadTokens()
    private var verifier = ""
    private var dirtyJob: Job? = null

    init {
        AndroidBridge.onOAuthRedirect = { uri -> onRedirect(uri) }
    }

    override fun statusLine(): String = when {
        busy -> "Syncing…"
        error.isNotEmpty() -> error
        !store.state.driveOn -> "Not connected. Save an Android OAuth Client ID, then Connect & sync."
        else -> {
            val who = store.state.driveEmail
            val last = store.state.lastSync
            val ago = if (last > 0) dev.glint.app.uploadTimeLabel(last) else "never"
            (if (who.isNotEmpty()) "$who · " else "") + "Last sync: $ago" + (if (note.isNotEmpty()) " · $note" else "")
        }
    }

    override fun isBusy(): Boolean = busy

    /* -------------------------------------------------------------- OAuth */

    override fun connect() {
        val clientId = store.state.driveClientId.trim()
        if (clientId.isEmpty()) {
            store.showToast("Save your Google OAuth Client ID (Android) in Advanced settings first.")
            return
        }
        val random = ByteArray(48)
        SecureRandom().nextBytes(random)
        verifier = base64Url(random)
        val challenge = base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        val url = "https://accounts.google.com/o/oauth2/v2/auth" +
            "?client_id=" + encodeURIComponent(clientId) +
            "&redirect_uri=" + encodeURIComponent(REDIRECT) +
            "&response_type=code" +
            "&scope=" + encodeURIComponent(SCOPE) +
            "&access_type=offline&prompt=consent" +
            "&code_challenge=" + challenge + "&code_challenge_method=S256"
        Platform.openUrl(url)
    }

    private fun onRedirect(uri: Uri) {
        val code = uri.getQueryParameter("code")
        if (code.isNullOrEmpty()) {
            error = uri.getQueryParameter("error") ?: "Google sign-in was cancelled."
            return
        }
        store.scope.launch {
            try {
                busy = true; error = ""
                val body = "code=" + encodeURIComponent(code) +
                    "&client_id=" + encodeURIComponent(store.state.driveClientId.trim()) +
                    "&redirect_uri=" + encodeURIComponent(REDIRECT) +
                    "&grant_type=authorization_code" +
                    "&code_verifier=" + verifier
                val data = tokenRequest(body)
                tokens = DriveTokens(
                    access = data.el("access_token").asStringOr(""),
                    refresh = data.el("refresh_token").asStringOr(tokens.refresh),
                    expiresAt = Platform.epochMillis() + ((data.el("expires_in").asStringOr("3600").toDoubleOrNull() ?: 3600.0) * 1000).toLong() - 60_000,
                )
                saveTokens()
                store.update { it.copy(driveOn = true) }
                loadAccount()
                busy = false
                syncNow()
            } catch (e: Throwable) {
                busy = false
                error = e.message ?: "Google sign-in failed."
                store.showToast(error)
            }
        }
    }

    private suspend fun tokenRequest(body: String): JsonObject {
        val response = Platform.httpClient().request("https://oauth2.googleapis.com/token") {
            method = HttpMethod.Post
            header("Content-Type", "application/x-www-form-urlencoded")
            setBody(body)
        }
        val text = response.bodyAsText()
        val json = parseJsonOrNull(text)?.objOrNull
            ?: throw IllegalStateException("Google's token endpoint did not answer.")
        if (response.status.value !in 200..299) {
            throw IllegalStateException(
                json.el("error_description").asStringOr("").ifEmpty { "Google sign-in failed (HTTP ${response.status.value})." },
            )
        }
        return json
    }

    private suspend fun accessToken(): String {
        if (tokens.access.isNotEmpty() && Platform.epochMillis() < tokens.expiresAt) return tokens.access
        if (tokens.refresh.isEmpty()) throw IllegalStateException("Connect Google Drive again — the saved session expired.")
        val data = tokenRequest(
            "client_id=" + encodeURIComponent(store.state.driveClientId.trim()) +
                "&refresh_token=" + encodeURIComponent(tokens.refresh) +
                "&grant_type=refresh_token",
        )
        tokens = tokens.copy(
            access = data.el("access_token").asStringOr(""),
            expiresAt = Platform.epochMillis() + ((data.el("expires_in").asStringOr("3600").toDoubleOrNull() ?: 3600.0) * 1000).toLong() - 60_000,
        )
        saveTokens()
        return tokens.access
    }

    private fun loadTokens(): DriveTokens = try {
        Platform.storage().get(TOKEN_KEY)?.let { LenientJson.decodeFromString(DriveTokens.serializer(), it) } ?: DriveTokens()
    } catch (_: Throwable) { DriveTokens() }

    private fun saveTokens() {
        try { Platform.storage().put(TOKEN_KEY, LenientJson.encodeToString(DriveTokens.serializer(), tokens)) } catch (_: Throwable) {}
    }

    private fun base64Url(bytes: ByteArray): String =
        android.util.Base64.encodeToString(bytes, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP)

    /* -------------------------------------------------------------- Drive */

    private suspend fun gfetch(url: String, method: HttpMethod = HttpMethod.Get, contentType: String = "", body: String = ""): Pair<Int, String> {
        val token = accessToken()
        val response = Platform.httpClient().request(url) {
            this.method = method
            header("Authorization", "Bearer $token")
            if (contentType.isNotEmpty()) header("Content-Type", contentType)
            if (body.isNotEmpty()) setBody(body)
        }
        return response.status.value to response.bodyAsText()
    }

    private suspend fun findRemote(): Pair<String, String> {
        val (status, text) = gfetch("$DRIVE/files?spaces=appDataFolder&q=" + encodeURIComponent("name='$FILE_NAME'") + "&fields=files(id,modifiedTime)&pageSize=1")
        if (status !in 200..299) throw IllegalStateException(driveError("list", status, text))
        val file = (parseJsonOrNull(text)?.objOrNull?.el("files") as? JsonArray)?.firstOrNull()?.objOrNull
        return (file?.el("id").asStringOr("")) to (file?.el("modifiedTime").asStringOr(""))
    }

    private suspend fun readRemote(id: String): JsonObject? {
        val (status, text) = gfetch("$DRIVE/files/" + encodeURIComponent(id) + "?alt=media")
        if (status !in 200..299) throw IllegalStateException(driveError("read", status, text))
        if (text.isBlank()) return null
        return parseJsonOrNull(text)?.objOrNull
            ?: throw IllegalStateException("The Drive copy is not readable (it may be from another app). Nothing was overwritten.")
    }

    private suspend fun uploadRemote(id: String, content: String): Pair<String, String> {
        if (id.isNotEmpty()) {
            val (status, text) = gfetch("$UPLOAD/files/" + encodeURIComponent(id) + "?uploadType=media&fields=id,modifiedTime", HttpMethod.Patch, "application/json", content)
            if (status !in 200..299) throw IllegalStateException(driveError("upload", status, text))
            val body = parseJsonOrNull(text)?.objOrNull
            return (body?.el("id").asStringOr(id)) to (body?.el("modifiedTime").asStringOr(""))
        }
        val boundary = "pb" + Platform.epochMillis().toString(36)
        val multipart = "--$boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
            "{\"name\":\"$FILE_NAME\",\"parents\":[\"appDataFolder\"]}" +
            "\r\n--$boundary\r\nContent-Type: application/json\r\n\r\n$content\r\n--$boundary--"
        val (status, text) = gfetch("$UPLOAD/files?uploadType=multipart&fields=id,modifiedTime", HttpMethod.Post, "multipart/related; boundary=$boundary", multipart)
        if (status !in 200..299) throw IllegalStateException(driveError("create", status, text))
        val body = parseJsonOrNull(text)?.objOrNull
        return (body?.el("id").asStringOr("")) to (body?.el("modifiedTime").asStringOr(""))
    }

    private fun driveError(what: String, status: Int, text: String): String {
        val message = parseJsonOrNull(text)?.objOrNull?.el("error")?.objOrNull?.el("message").asStringOr("")
        return "Drive $what failed: HTTP $status" + if (message.isNotEmpty()) " – $message" else ""
    }

    private suspend fun loadAccount() {
        try {
            val (status, text) = gfetch("$DRIVE/about?fields=user(emailAddress,displayName)")
            if (status !in 200..299) return
            val user = parseJsonOrNull(text)?.objOrNull?.el("user")?.objOrNull ?: return
            val who = user.el("emailAddress").asStringOr("").ifEmpty { user.el("displayName").asStringOr("") }
            store.update { it.copy(driveEmail = who) }
        } catch (_: Throwable) {}
    }

    /* ------------------------------------------------------------ payload */

    private fun leanPin(p: Pin): JsonObject = buildJsonObject {
        put("id", p.id); put("src", p.src); put("sid", p.sid); put("t", p.t)
        if (p.c.isNotEmpty()) put("c", p.c)
        put("srcName", p.srcName); put("grid", p.grid)
        put("width", p.width); put("height", p.height); put("date", p.date)
        put("rating", p.rating); put("score", p.score)
        put("tags", buildJsonArray { p.tags.forEach { add(JsonPrimitive(it)) } })
        put("artists", buildJsonArray { p.artists.forEach { add(JsonPrimitive(it)) } })
        put("characters", buildJsonArray { p.characters.forEach { add(JsonPrimitive(it)) } })
        put("series", buildJsonArray { p.series.forEach { add(JsonPrimitive(it)) } })
        put("detailsReady", p.detailsReady); put("fileInfoReady", p.fileInfoReady)
        put("sourceInfoReady", p.sourceInfoReady); put("uploadInfoReady", p.uploadInfoReady)
    }

    private fun tombstones(): Map<String, Long> {
        val cutoff = Platform.epochMillis() - TOMBSTONE_DAYS * 86_400_000L
        return store.state.bmDeleted.filterValues { it > cutoff }
    }

    private fun payload(): String {
        val s = store.state
        return buildJsonObject {
            put("app", "pinboard"); put("version", 1)
            put("savedAt", Platform.epochMillis().toString())
            put("device", "glint-android")
            put("data", buildJsonObject {
                put("bookmarks", buildJsonArray {
                    s.bookmarks.forEach { add(buildJsonObject { put("id", it.id); put("savedAt", it.savedAt) }) }
                })
                put("deleted", buildJsonObject { for ((k, v) in tombstones()) put(k, v) })
                put("pins", buildJsonObject {
                    s.bookmarks.forEach { record -> s.pinCache[record.id]?.let { put(record.id, leanPin(it)) } }
                })
                put("hidden", buildJsonArray { s.hidden.forEach { add(JsonPrimitive(it)) } })
                put("customSources", buildJsonArray {
                    Sources.customRecords().forEach { r ->
                        add(buildJsonObject {
                            put("id", r.id); put("name", r.name); put("base", r.base)
                            put("engine", r.engine); put("addedAt", r.addedAt); put("updatedAt", r.updatedAt)
                        })
                    }
                })
            })
            put("settings", buildJsonObject {
                put("setAt", s.setAt)
                put("cols", s.cols); put("theme", s.theme); put("sw", s.sw)
                put("iq", buildJsonObject { put("feed", s.iqFeed); put("detail", s.iqDetail); put("viewer", s.iqViewer) })
                put("srcs", buildJsonArray { s.srcs.forEach { add(JsonPrimitive(it)) } })
                put("src", s.src); put("mode", s.mode)
                put("forder", buildJsonObject { for ((k, v) in s.forder) put(k, v) })
                put("stags", buildJsonObject { for ((k, v) in s.stags) put(k, v) })
                if (s.syncKeys) {
                    put("keys", parseJsonOrNull(
                        LenientJson.encodeToString(MapSerializer(String.serializer(), AuthRecord.serializer()), Accounts.all()),
                    ) ?: JsonObject(emptyMap()))
                }
            })
        }.toString()
    }

    /* -------------------------------------------------------------- merge */

    private fun mergeAndApply(remote: JsonObject?) {
        if (remote == null) return
        val s = store.state
        val data = remote.el("data")?.objOrNull ?: JsonObject(emptyMap())
        val remoteSaved = (data.el("bookmarks") as? JsonArray)?.mapNotNull { el ->
            el.objOrNull?.let { o ->
                val id = o.el("id").asStringOr("")
                if (id.isEmpty()) null else id to (o.el("savedAt").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0)
            }
        }?.toMap() ?: emptyMap()
        val remoteGone = data.el("deleted")?.objOrNull?.mapNotNull { (k, v) ->
            v.asStringOr("0").toDoubleOrNull()?.toLong()?.let { k to it }
        }?.toMap() ?: emptyMap()
        val localSaved = s.bookmarks.associate { it.id to it.savedAt }
        val localGone = tombstones()

        val ids = localSaved.keys + remoteSaved.keys + localGone.keys + remoteGone.keys
        val bookmarks = ArrayList<BookmarkRecord>()
        val deleted = HashMap<String, Long>()
        for (id in ids) {
            val savedAt = maxOf(localSaved[id] ?: 0L, remoteSaved[id] ?: 0L)
            val goneAt = maxOf(localGone[id] ?: 0L, remoteGone[id] ?: 0L)
            if (goneAt > 0 && goneAt >= savedAt) { deleted[id] = goneAt; continue }
            if (savedAt > 0) bookmarks.add(BookmarkRecord(id, savedAt))
        }
        bookmarks.sortByDescending { it.savedAt }

        // Pins: keep whichever copy knows more.
        val cache = HashMap(s.pinCache)
        data.el("pins")?.objOrNull?.forEach { (id, raw) ->
            val theirs = Store.decodePin(raw) ?: return@forEach
            val mine = cache[id]
            val richer = theirs.tags.size + theirs.artists.size
            val current = mine?.let { it.tags.size + it.artists.size } ?: -1
            if (richer >= current) cache[id] = theirs
        }

        val hidden = (s.hidden + ((data.el("hidden") as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList())).distinct()

        // Custom sources: merge by id.
        val remoteCustom = (data.el("customSources") as? JsonArray)?.mapNotNull { el ->
            el.objOrNull?.let { o ->
                val id = o.el("id").asStringOr("")
                if (id.isEmpty()) null else CustomSourceRecord(
                    id = id,
                    name = o.el("name").asStringOr(""),
                    base = o.el("base").asStringOr(""),
                    engine = o.el("engine").asStringOr(""),
                    addedAt = o.el("addedAt").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0,
                    updatedAt = o.el("updatedAt").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0,
                )
            }
        } ?: emptyList()
        if (remoteCustom.isNotEmpty()) {
            val known = Sources.customRecords().associateBy { it.id }.toMutableMap()
            for (row in remoteCustom) known[row.id] = row
            Sources.writeCustomRecords(known.values.toList())
        }

        // Settings: the newer setAt wins.
        var next = s.copy(bookmarks = bookmarks, bmDeleted = deleted, pinCache = cache, hidden = hidden)
        val settings = remote.el("settings")?.objOrNull
        val remoteSetAt = settings?.el("setAt").asStringOr("0").toDoubleOrNull()?.toLong() ?: 0
        if (settings != null && remoteSetAt > s.setAt) {
            val iq = settings.el("iq")?.objOrNull
            next = next.copy(
                cols = settings.el("cols").asStringOr(s.cols.toString()).toDoubleOrNull()?.toInt() ?: s.cols,
                theme = settings.el("theme").asStringOr(s.theme),
                sw = settings.el("sw").asStringOr(s.sw),
                iqFeed = iq?.el("feed").asStringOr(s.iqFeed),
                iqDetail = iq?.el("detail").asStringOr(s.iqDetail),
                iqViewer = iq?.el("viewer").asStringOr(s.iqViewer),
                srcs = (settings.el("srcs") as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content } ?: s.srcs,
                src = settings.el("src").asStringOr(s.src),
                mode = settings.el("mode").asStringOr(s.mode),
                forder = settings.el("forder")?.objOrNull?.mapValues { it.value.asStringOr("") } ?: s.forder,
                stags = settings.el("stags")?.objOrNull?.mapValues { it.value.asStringOr("") } ?: s.stags,
                setAt = remoteSetAt,
            )
            if (s.syncKeys) {
                settings.el("keys")?.objOrNull?.let { keys ->
                    try {
                        val records = LenientJson.decodeFromString(
                            MapSerializer(String.serializer(), AuthRecord.serializer()),
                            keys.toString(),
                        )
                        records.forEach { (id, record) -> Accounts.setAuth(id, record) }
                    } catch (_: Throwable) {}
                }
            }
        }
        store.update { Store.normalize(next) }
    }

    /* --------------------------------------------------------------- sync */

    override fun syncNow() {
        if (busy) return
        store.scope.launch {
            busy = true; error = ""
            try {
                val (foundId, mod) = findRemote()
                var id = foundId
                if (id.isNotEmpty() && mod != store.state.driveMod) {
                    mergeAndApply(readRemote(id))
                }
                val (newId, newMod) = uploadRemote(id, payload())
                store.update { it.copy(driveFileId = newId, driveMod = newMod, lastSync = Platform.epochMillis(), driveOn = true) }
                note = ""
                store.showToast("Drive sync complete")
            } catch (e: Throwable) {
                error = e.message ?: "Drive sync failed."
                store.showToast(error)
            } finally {
                busy = false
            }
        }
    }

    override fun disconnect() {
        tokens = DriveTokens()
        try { Platform.storage().remove(TOKEN_KEY) } catch (_: Throwable) {}
        store.update { it.copy(driveOn = false, driveEmail = "", driveMod = "", driveFileId = "") }
        store.showToast("Google Drive disconnected")
    }

    /** Debounced auto-upload after local changes (drive.js: 4–10 s waits). */
    override fun markDirty() {
        if (!store.state.driveOn || !store.state.driveAuto || tokens.refresh.isEmpty()) return
        dirtyJob?.cancel()
        dirtyJob = store.scope.launch {
            delay(10_000)
            if (!busy) syncNow()
        }
    }
}

actual object DriveSync {
    actual fun create(store: GlintStore): DriveSyncApi = DriveSyncAndroid(store)
}
