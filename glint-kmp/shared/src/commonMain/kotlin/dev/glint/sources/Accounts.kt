package dev.glint.sources

import dev.glint.core.B64
import dev.glint.core.LenientJson
import dev.glint.core.Platform
import dev.glint.core.QueryParams
import dev.glint.core.Sha1
import dev.glint.core.arrOrNull
import dev.glint.core.asStringOr
import dev.glint.core.el
import dev.glint.core.encodeURIComponent
import dev.glint.core.int
import dev.glint.core.obj
import dev.glint.core.objOrNull
import dev.glint.core.parseUrl
import dev.glint.core.str
import dev.glint.model.AuthRecord
import dev.glint.model.Pin
import dev.glint.model.PostBatch
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

data class SupportLink(val label: String, val url: String)

data class SourceSupport(
    val engine: String,
    val siteLogin: String = "None",
    val appLogin: Boolean = false,
    val readLikes: Boolean = false,
    val writeLikes: Boolean = false,
    val session: Boolean = false,
    val boorusama: String = "Browsing",
    val steps: List<String> = emptyList(),
    val limits: List<String> = emptyList(),
    val links: List<SupportLink> = emptyList(),
)

/**
 * Port of the ACCOUNTS · FAVOURITES ("Likes") · CONNECTION TESTS section of
 * sources.js. Source Likes are remote favourites, never local bookmarks.
 */
object Accounts {
    const val AUTH_KEY = "pb-auth"
    private val auth = LinkedHashMap<String, AuthRecord>()
    private val versions = HashMap<String, Int>()
    private val writeLocks = HashMap<String, Mutex>()
    private val lastWrite = HashMap<String, Long>()
    private val moeAuthSeen = HashMap<String, Long>()
    private const val MOE_AUTH_MS = 5 * 60 * 1000L
    private var loaded = false
    var onChange: ((String) -> Unit)? = null

    const val MOEBOORU_SALT = "choujin-steiner--{0}--"
    const val KONACHAN_SALT = "So-I-Heard-You-Like-Mupkids-?--{0}--"
    const val SAKUGA_SALT = "er@!\$rjiajd0\$!dkaopc350!Y%)--{0}--"

    fun moebooruHash(password: String, host: String): String {
        val salt = when {
            host.contains("sakugabooru") -> SAKUGA_SALT
            host.contains("konachan") -> KONACHAN_SALT
            else -> MOEBOORU_SALT
        }
        return Sha1.hex(salt.replace("{0}", password))
    }

    /* --------------------------------------------------- support registry */

    val support: Map<String, SourceSupport> by lazy {
        val map = HashMap<String, SourceSupport>()
        map["danbooru"] = SourceSupport(
            engine = "Danbooru", siteLogin = "Username + API key", appLogin = true, readLikes = true, writeLikes = true,
            boorusama = "API login and source favourites",
            steps = listOf(
                "Sign in on Danbooru in your browser. Open your profile, then API keys.",
                "Create a key for this app and copy your username and API key below.",
                "Allow profile/users, posts and counts read access, plus favourites index/create/destroy access. A read-only key cannot Like.",
            ),
            limits = listOf(
                "These are native Danbooru favourites: adding one may also add your upvote, and removing it removes your existing positive vote. This is the website's own behaviour, not a separate local Like.",
                "Account-level tag limits still apply. Basic accounts commonly allow two search tokens; non-default sorts can consume a token.",
                "The site enforces write rate limits and API-key permissions. This app never retries a Like automatically.",
            ),
            links = listOf(
                SupportLink("Profile / API keys", "https://danbooru.donmai.us/profile"),
                SupportLink("API documentation", "https://danbooru.donmai.us/wiki_pages/help:api"),
            ),
        )
        for (id in listOf("yandere", "konachan", "sakuga")) {
            val name = mapOf("yandere" to "yande.re", "konachan" to "Konachan", "sakuga" to "Sakugabooru")[id]!!
            val base = mapOf("yandere" to "https://yande.re/", "konachan" to "https://konachan.net/", "sakuga" to "https://www.sakugabooru.com/")[id]!!
            map[id] = SourceSupport(
                engine = "Moebooru", siteLogin = "Username + password (hashed locally)", appLogin = true, readLikes = true, writeLikes = true,
                boorusama = "Hashed-password login and source favourites",
                steps = listOf(
                    "Create an account or sign in on $name first.",
                    "Enter that site's username and password below. The correct site-specific SHA-1 hash is calculated on this device; the original password is not stored or sent.",
                    "Treat the stored hash like a password: it is sufficient to access your account.",
                ),
                limits = buildList {
                    add("Like is the site's 3-star vote. Unlike clears that vote (score 0). It does not create a local bookmark.")
                    if (id == "sakuga") add("Sakugabooru has its own password salt. If you saved a login in an older build, re-enter your password once.")
                    add("API access, account permissions and rate limits are controlled by the site.")
                },
                links = listOf(
                    SupportLink("Website / sign in", base + "user/login"),
                    SupportLink("API documentation", base + "help/api"),
                ),
            )
        }
        map["e621"] = SourceSupport(
            engine = "e621ng", siteLogin = "Username + API key", appLogin = true, readLikes = true, writeLikes = true,
            boorusama = "API login and source favourites",
            steps = listOf(
                "Sign in on e621 and open My Account → Manage API Access.",
                "Enable API access / generate a key, then enter your username and API key. Do not enter your website password.",
                "Both values are required here for source Likes; a public username lookup is not proof of login.",
            ),
            limits = listOf(
                "Authentication uses HTTP Basic with the API key, not user_id/user_api_key query parameters.",
                "Private/hidden favourites, account restrictions and API limits are determined by e621. Read and write failures are shown, not converted to local Likes.",
            ),
            links = listOf(
                SupportLink("My account / API access", "https://e621.net/users/home"),
                SupportLink("API documentation", "https://e621.net/help/api"),
            ),
        )
        map["gelbooru"] = SourceSupport(
            engine = "Gelbooru 0.2.5", siteLogin = "User ID + API key; website session for Like", appLogin = true,
            readLikes = true, writeLikes = true, session = true,
            boorusama = "API reads; website-session favourites",
            steps = listOf(
                "Sign in on Gelbooru and open My Account → Options → API Access Credentials.",
                "Copy the numeric user_id and api_key. These enable browsing and reading your Likes.",
                "Optional, advanced: source Like/Unlike also requires the pass_hash WEBSITE cookie from that same signed-in account. The API key alone cannot favourite posts.",
                "Inspect Gelbooru's cookies in browser developer tools and paste only pass_hash in the optional field. Never paste it into chat or share it.",
            ),
            limits = listOf(
                "Session cookies can expire or be tied to IP/device checks. If a CAPTCHA / access challenge blocks an action, open the original site; this app does not bypass it.",
                "Without the optional website session, Likes can be viewed but the post heart is hidden.",
                "Favourite ordering/totals are subject to the Gelbooru API. This app uses an explicit post-ID sort rather than claiming it has favourite-added timestamps.",
            ),
            links = listOf(
                SupportLink("Account options / API credentials", "https://gelbooru.com/index.php?page=account&s=options"),
                SupportLink("Sign in on website", "https://gelbooru.com/index.php?page=account&s=login&code=00"),
            ),
        )
        for (id in listOf("derpibooru", "ponybooru")) {
            val base = mapOf("derpibooru" to "https://derpibooru.org/", "ponybooru" to "https://ponybooru.org/")[id]!!
            map[id] = SourceSupport(
                engine = "Philomena", siteLogin = "Optional API key (no username required)", appLogin = true,
                boorusama = "Optional API-key browsing; no source-favourite writer in the reviewed client",
                steps = listOf(
                    "Sign in on the original website and open Account settings to find your API key.",
                    "Paste the API key below. It can apply the site's account-specific API settings / filters; a username is not required.",
                ),
                limits = listOf(
                    "Read-only integration: this app does not expose source Like/Unlike for Philomena. Use local Bookmarks or favourite on the original website.",
                    "A successful public search is only a read-access check, not proof of a logged-in identity.",
                ),
                links = listOf(SupportLink("Website / account settings", base)),
            )
        }
        map["animepictures"] = SourceSupport(
            engine = "Anime Pictures", siteLogin = "Website-session cookies", boorusama = "Cookie login and viewing starred posts",
            limits = listOf("No source-login or source-Like writer is implemented in this preset. Entering only a username would not authenticate you."),
            links = listOf(SupportLink("Sign in on website", "https://anime-pictures.net/login?lang=en")),
        )
        map["eshuushuu"] = SourceSupport(
            engine = "e-shuushuu", siteLogin = "Username/password → expiring access and refresh tokens",
            boorusama = "Token login and source favourites",
            limits = listOf("No fake username-only connection or local heart is offered. Local Bookmarks continue to work without login."),
            links = listOf(SupportLink("Original website", "https://e-shuushuu.net/")),
        )
        map["szurubooru"] = SourceSupport(engine = "Szurubooru", siteLogin = "Username + access token (instance-dependent)", boorusama = "Token login and source favourites", limits = listOf("This built-in preset is disabled / unverified. No credentials or Like controls are enabled."))
        map["hybooru"] = SourceSupport(engine = "Hybooru", siteLogin = "No account integration in this preset", boorusama = "Hybooru browsing adapter", limits = listOf("This preset is disabled / unverified."))
        map["sankaku"] = SourceSupport(engine = "Sankaku", siteLogin = "Username/password → access token", boorusama = "Token login and source favourites", limits = listOf("This preset is disabled / unverified and does not implement that token flow."))
        map["paheal"] = SourceSupport(engine = "Shimmie2", siteLogin = "Website session / site-specific auth token", boorusama = "Shimmie2 login and source favourites", limits = listOf("This old GraphQL adapter is disabled / unverified."))
        map["zerochan"] = SourceSupport(engine = "Zerochan", siteLogin = "Website account; no API login in the reviewed adapter", boorusama = "Public browsing", limits = listOf("This preset is disabled / unverified."))
        map["nozomi"] = SourceSupport(engine = "Nozomi.la", siteLogin = "No login in the reviewed public-index adapter", boorusama = "Public browsing", limits = listOf("This preset is disabled / unverified."))
        map
    }

    fun sourceSupport(id: String): SourceSupport = support[id] ?: SourceSupport(
        engine = Sources.all[id]?.engine ?: "Unknown",
        siteLogin = "Not configured",
        limits = listOf("No account integration is implemented for this source."),
    )

    /* ----------------------------------------------------------- storage */

    private fun cleanAuth(id: String, rec: AuthRecord?): AuthRecord? {
        if (rec == null || !Sources.has(id)) return null
        val out = AuthRecord(
            login = rec.login.trim().take(4096),
            apiKey = rec.apiKey.trim().take(4096),
            passHash = rec.passHash.trim().take(4096),
            session = rec.session.trim().take(4096),
            hashVersion = if (rec.hashVersion == 2) 2 else 0,
            needsReentry = rec.needsReentry,
            verifiedAt = rec.verifiedAt,
        )
        return out
    }

    private fun ensureLoaded() {
        if (loaded) return
        loaded = true
        Sources.ensureLoaded()
        try {
            val raw = Platform.storage().get(AUTH_KEY) ?: return
            val records = LenientJson.decodeFromString(MapSerializer(String.serializer(), AuthRecord.serializer()), raw)
            for ((id, record) in records) if (Sources.has(id)) cleanAuth(id, record)?.let { auth[id] = it }
        } catch (_: Throwable) {}
    }

    fun all(): Map<String, AuthRecord> { ensureLoaded(); return auth.toMap() }

    fun get(id: String): AuthRecord { ensureLoaded(); return auth[id] ?: AuthRecord() }

    fun authVersion(id: String): Int = versions[id] ?: 0

    private fun save(): Boolean = try {
        Platform.storage().put(AUTH_KEY, LenientJson.encodeToString(MapSerializer(String.serializer(), AuthRecord.serializer()), auth))
    } catch (_: Throwable) { false }

    fun setAuth(id: String, record: AuthRecord?) {
        ensureLoaded()
        if (!Sources.has(id)) return
        val previous = auth[id]
        val rec = record?.takeIf { it.login.isNotEmpty() || it.apiKey.isNotEmpty() || it.passHash.isNotEmpty() || it.session.isNotEmpty() }
            ?.let { cleanAuth(id, it) }
        if (rec != null) auth[id] = rec else auth.remove(id)
        if (!save()) {
            if (previous != null) auth[id] = previous else auth.remove(id)
            throw IllegalStateException("Could not store account details on this device. Nothing was saved; the previous account is unchanged.")
        }
        versions[id] = authVersion(id) + 1
        onChange?.invoke(id)
    }

    fun remove(id: String) { ensureLoaded(); auth.remove(id); save(); versions[id] = authVersion(id) + 1 }

    /* -------------------------------------------------------- capability */

    fun likesOk(id: String): Boolean {
        val s = Sources.all[id] ?: return false
        return !s.off && sourceSupport(id).readLikes
    }

    /** Configured is NOT a claim that the source has verified these credentials. */
    fun hasAuth(id: String, record: AuthRecord? = null): Boolean {
        ensureLoaded()
        val s = Sources.all[id] ?: return false
        val a = record ?: auth[id] ?: AuthRecord()
        if (s.off || !sourceSupport(id).appLogin || a.needsReentry) return false
        if (s.auth?.keyOnly == true) return a.apiKey.isNotEmpty()
        if (s.engine == "gelbooru") return Regex("^[1-9]\\d*$").matches(a.login) && a.apiKey.isNotEmpty()
        if (id == "sakuga" && a.hashVersion != 2) return false
        return a.login.isNotEmpty() && (
            if (s.engine == "moebooru") Regex("^[a-f0-9]{40}$", RegexOption.IGNORE_CASE).matches(a.passHash)
            else a.apiKey.isNotEmpty()
            )
    }

    fun gelSessionOk(value: String): Boolean =
        Regex("^[A-Za-z0-9._~%+=/-]{16,2048}$").matches(value) &&
            !Regex("^(?:pass_hash|user_id|cookie)\\s*[=:]", RegexOption.IGNORE_CASE).containsMatchIn(value)

    fun canLike(id: String): Boolean =
        sourceSupport(id).writeLikes && hasAuth(id) && (id != "gelbooru" || gelSessionOk(get(id).session))

    /* -------------------------------------------------------- transport */

    fun authOptions(id: String, a: AuthRecord = get(id)): FetchOptions {
        val s = Sources.source(id)
        val headers = HashMap<String, String>()
        if (s.engine in listOf("danbooru", "e621") && a.login.isNotEmpty() && a.apiKey.isNotEmpty()) {
            headers["Authorization"] = "Basic " + B64.encode(a.login + ":" + a.apiKey)
        }
        val secrets = buildList {
            if (a.apiKey.isNotEmpty()) add(a.apiKey)
            if (a.passHash.isNotEmpty()) add(a.passHash)
            if (a.session.isNotEmpty()) add(a.session)
            if (a.login.isNotEmpty() && a.apiKey.isNotEmpty()) add(B64.encode(a.login + ":" + a.apiKey))
        }
        return FetchOptions(isPrivate = true, headers = headers, secrets = secrets)
    }

    fun accountURL(id: String, path: String, a: AuthRecord = get(id)): String {
        val s = Sources.source(id)
        val base = s.bases[0]
        var url = base.trimEnd('/') + "/" + path.trimStart('/')
        val extra = QueryParams()
        var hasExtra = false
        if (s.engine == "moebooru" && a.login.isNotEmpty() && a.passHash.isNotEmpty()) {
            extra.set("login", a.login).set("password_hash", a.passHash); hasExtra = true
        }
        if (s.engine == "gelbooru" && url.contains("page=dapi")) {
            extra.set("user_id", a.login).set("api_key", a.apiKey); hasExtra = true
        }
        if (s.engine == "philomena" && a.apiKey.isNotEmpty()) {
            extra.set("key", a.apiKey); hasExtra = true
        }
        if (hasExtra) url += (if (url.contains('?')) "&" else "?") + extra
        return url
    }

    suspend fun accountJSON(id: String, path: String, a: AuthRecord = get(id), method: String = "GET", body: String? = null, mutation: Boolean = false, extraHeaders: Map<String, String> = emptyMap()): JsonOrText? {
        val base = authOptions(id, a)
        return Net.jsonFriendly(
            accountURL(id, path, a),
            base.copy(method = method, body = body, mutation = mutation, headers = base.headers + extraHeaders),
        )
    }

    /* ------------------------------------------------------------- likes */

    private fun likeBatch(raw: List<dev.glint.model.RawPost>, s: SourceDef, srcId: String, limit: Int): PostBatch {
        val slots = raw.map { r -> s.mapper(r)?.let { Sources.normalize(it, srcId) } }
        val pins = slots.filterNotNull().filter { it.grid.isNotEmpty() }
        return PostBatch(
            pins = pins, rawCount = raw.size, batchKey = pins.joinToString(",") { it.sid },
            hasMore = raw.size >= limit,
        )
    }

    suspend fun loadFavoriteCount(id: String): Int? {
        ensureLoaded()
        val s = Sources.source(id)
        val a = get(id)
        val name = a.login.replace(Regex("\\s"), "_")
        if (!hasAuth(id)) return null
        var value: String? = null
        when (s.engine) {
            "danbooru" -> {
                val j = accountJSON(id, "counts/posts.json?" + QueryParams().set("tags", "fav:$name"))
                value = (j as? JsonOrText.J)?.element?.objOrNull?.obj("counts")?.el("posts")?.asStringOr("")
            }
            "moebooru" -> {
                val text = Net.text(accountURL(id, "post.xml?" + QueryParams().set("tags", "vote:3:$name").set("limit", "1")), authOptions(id))
                value = Regex("<posts\\b[^>]*\\bcount=[\"'](\\d+)[\"']", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)
            }
            "e621" -> {
                val j = accountJSON(id, "users/" + encodeURIComponent(a.login) + ".json")
                value = (j as? JsonOrText.J)?.element?.objOrNull?.el("favorite_count")?.asStringOr("")
            }
            "gelbooru" -> {
                val j = accountJSON(id, "index.php?" + QueryParams().set("page", "dapi").set("s", "post").set("q", "index").set("json", "1").set("tags", "fav:" + a.login).set("limit", "1").set("pid", "0"))
                value = (j as? JsonOrText.J)?.element?.objOrNull?.obj("@attributes")?.el("count")?.asStringOr("")
            }
        }
        val n = value?.toDoubleOrNull()?.toLong() ?: return null
        return if (n in 0..Int.MAX_VALUE) n.toInt() else null
    }

    /** Port of pbLoadFavorites: real, source-confirmed favourites pages. */
    suspend fun loadFavorites(id: String, page: Int = 1, limit: Int = 40, order: String = "newest", total: Int? = null, cursor: String? = null): PostBatch {
        ensureLoaded()
        val s = Sources.source(id)
        val a = get(id)
        val name = a.login.replace(Regex("\\s"), "_")
        if (!likesOk(id) || !hasAuth(id)) throw IllegalStateException("Add the required " + s.name + " credentials first.")
        val oldest = order == "oldest"
        if (oldest && s.engine != "danbooru") {
            val fullTotal = total ?: loadFavoriteCount(id)
                ?: throw IllegalStateException("The source's likes total is unavailable. Oldest-first cannot be calculated safely.")
            val end = fullTotal - (page - 1) * limit
            val start = maxOf(0, end - limit)
            if (end <= 0) return PostBatch(emptyList(), 0, "", hasMore = false)
            val first = start / limit + 1
            val last = (end + limit - 1) / limit
            val slots = ArrayList<Pin>()
            for (n in first..last) {
                val chunk = loadFavorites(id, page = n, limit = limit, order = "newest")
                slots.addAll(chunk.pins)
            }
            val selected = slots.drop(start - (first - 1) * limit).take(end - start).reversed()
            return PostBatch(selected.filter { it.grid.isNotEmpty() }, selected.size, selected.joinToString(",") { it.sid }, hasMore = start > 0)
        }
        if (s.engine == "danbooru" && oldest) {
            val pageCursor = if (cursor != null && Regex("^a\\d+$").matches(cursor)) cursor else "a0"
            val params = QueryParams().set("search[user_name]", a.login).set("page", pageCursor).set("limit", limit.toString()).set("only", "id,post_id,post")
            val j = accountJSON(id, "favorites.json?$params")
            val records = (j as? JsonOrText.J)?.element?.arrOrNull
                ?: throw IllegalStateException("The source returned an invalid favourites list.")
            val ordered = records.mapNotNull { it.objOrNull }.sortedBy { it.long("id") }
            val slots = ordered.mapNotNull { rec ->
                rec.obj("post")?.let { p -> s.mapper(dev.glint.model.RawPost(json = p))?.let { Sources.normalize(it, id) } }
            }
            return PostBatch(
                pins = slots.filter { it.grid.isNotEmpty() }, rawCount = records.size,
                batchKey = slots.joinToString(",") { it.sid },
                hasMore = records.size >= limit,
                nextCursor = ordered.lastOrNull()?.let { "a" + it.long("id") },
            )
        }
        return when (s.engine) {
            "danbooru" -> {
                val params = QueryParams().set("tags", "ordfav:$name").set("page", page.toString()).set("limit", limit.toString())
                val j = accountJSON(id, "posts.json?$params")
                likeBatch(s.parser(j), s, id, limit)
            }
            "moebooru" -> {
                // The documented vote:3 filter is the user's real favourites.
                val j = accountJSON(id, "post.json?" + QueryParams().set("tags", "vote:3:$name order:vote").set("page", page.toString()).set("limit", limit.toString()))
                likeBatch(s.parser(j), s, id, limit)
            }
            "e621" -> {
                val j = accountJSON(id, "favorites.json?" + QueryParams().set("page", page.toString()).set("limit", limit.toString()))
                val raw = (j as? JsonOrText.J)?.element?.arrOrNull?.mapNotNull { it.objOrNull?.let { o -> dev.glint.model.RawPost(json = o) } }
                    ?: s.parser(j)
                likeBatch(raw, s, id, limit)
            }
            "gelbooru" -> {
                val tags = "fav:" + a.login + " sort:id:desc"
                val j = accountJSON(id, "index.php?" + QueryParams().set("page", "dapi").set("s", "post").set("q", "index").set("json", "1").set("tags", tags).set("pid", (page - 1).toString()).set("limit", limit.toString()))
                likeBatch(s.parser(j), s, id, limit)
            }
            else -> throw IllegalStateException("Source Likes are not implemented for " + s.name + " in this app.")
        }
    }

    /** Search the complete account favourites on the source. Port of pbSearchFavorites. */
    suspend fun searchFavorites(id: String, query: String, page: Int = 1): Pair<PostBatch, Int?> {
        ensureLoaded()
        val s = Sources.source(id)
        val a = get(id)
        val name = a.login.replace(Regex("\\s"), "_")
        val q = query.trim()
        val limit = 40
        if (!likesOk(id) || !hasAuth(id)) throw IllegalStateException("Connect this source account first.")
        if (Regex("(?:^|\\s)[~-]?(?:ordfav|fav|favgroup|vote|order|sort):|[{}]|(?:^|\\s)(?:or|and)(?:\\s|\$)", RegexOption.IGNORE_CASE).containsMatchIn(q)) {
            throw IllegalStateException("Use artwork tags here, without favourites, order or OR operators.")
        }
        val scope = when (s.engine) {
            "danbooru" -> "fav:$name"
            "moebooru" -> "vote:3:$name"
            "e621" -> "fav:$name"
            "gelbooru" -> "fav:" + a.login
            else -> throw IllegalStateException("This source does not support API search within likes.")
        }
        val tags = scope + " " + q + when (s.engine) {
            "gelbooru" -> " sort:id:desc"
            "danbooru" -> ""
            else -> " order:id_desc"
        }
        val path = if (s.engine == "gelbooru") {
            "index.php?" + QueryParams().set("page", "dapi").set("s", "post").set("q", "index").set("json", "1").set("tags", tags).set("pid", (page - 1).toString()).set("limit", limit.toString())
        } else {
            (if (s.engine == "moebooru") "post.json?" else "posts.json?") +
                QueryParams().set("tags", tags).set("page", page.toString()).set("limit", limit.toString())
        }
        val j = accountJSON(id, path)
        val batch = likeBatch(s.parser(j), s, id, limit)
        var total: Int? = null
        if (s.engine == "danbooru" && page == 1) {
            try {
                val count = accountJSON(id, "counts/posts.json?" + QueryParams().set("tags", "$scope $q"))
                val n = (count as? JsonOrText.J)?.element?.objOrNull?.obj("counts")?.el("posts")?.asStringOr("")?.toDoubleOrNull()?.toInt()
                if (n != null && n >= 0) total = n
            } catch (_: Throwable) {}
        }
        if (s.engine == "gelbooru") {
            val n = (j as? JsonOrText.J)?.element?.objOrNull?.obj("@attributes")?.el("count")?.asStringOr("")?.toDoubleOrNull()?.toInt()
            if (n != null && n >= 0) total = n
        }
        return batch to total
    }

    /* --------------------------------------------------- connection test */

    suspend fun testAuth(id: String, record: AuthRecord? = null): String {
        ensureLoaded()
        val s = Sources.source(id)
        val a = record ?: auth[id] ?: AuthRecord()
        if (!hasAuth(id, a)) throw IllegalStateException("Fill in all required credentials for " + s.name + ".")
        when (s.engine) {
            "danbooru", "e621" -> {
                val j = accountJSON(id, if (s.engine == "danbooru") "profile.json" else "users/me.json", a)
                val o = (j as? JsonOrText.J)?.element?.objOrNull
                val name = o?.run { str("name").ifEmpty { str("login") } } ?: ""
                val userId = o?.long("id") ?: 0
                if (userId <= 0 || name.isEmpty() || name.lowercase() != a.login.replace(Regex("\\s"), "_").lowercase()) {
                    throw IllegalStateException("The source did not confirm this account. Check the username and API key.")
                }
                return name
            }
            "moebooru" -> {
                val body = QueryParams().set("login", a.login).set("password_hash", a.passHash).toString()
                val j = Net.jsonFriendly(
                    s.bases[0] + "user/authenticate.json",
                    FetchOptions(isPrivate = true, method = "POST", body = body, headers = mapOf("Content-Type" to "application/x-www-form-urlencoded"), secrets = listOf(a.passHash)),
                )
                val ok = (j as? JsonOrText.J)?.element?.objOrNull?.el("success")?.asStringOr("") == "true"
                if (!ok) throw IllegalStateException("The site did not confirm the password hash.")
                return a.login
            }
            "gelbooru" -> {
                if (!Regex("^\\d+$").matches(a.login)) throw IllegalStateException("Gelbooru needs your numeric user ID, not your username.")
                val j = accountJSON(id, "index.php?page=dapi&s=post&q=index&json=1&limit=1&pid=0", a)
                val valid = (j as? JsonOrText.J)?.element?.objOrNull?.arr("post") != null
                if (!valid) throw IllegalStateException("Gelbooru did not return an authenticated API response.")
                return "API access checked for user ID " + a.login + ". The separate website session is confirmed when a Like is used."
            }
            "philomena" -> {
                val j = accountJSON(id, "api/v1/json/search/images?q=*&per_page=1", a)
                val valid = (j as? JsonOrText.J)?.element?.objOrNull?.arr("images") != null
                if (!valid) throw IllegalStateException("The source did not return a search response.")
                return "Read access checked. This endpoint does not verify a logged-in identity; source Likes are not enabled."
            }
            else -> throw IllegalStateException("This preset does not implement source login.")
        }
    }

    /* ----------------------------------------------------- like status */

    private suspend fun ensureMoeAuth(id: String, record: AuthRecord) {
        val key = id + "|" + authVersion(id) + "|" + record.login
        val seen = moeAuthSeen[key]
        if (seen != null && Platform.epochMillis() - seen < MOE_AUTH_MS) return
        testAuth(id, record)
        if (moeAuthSeen.size > 40) moeAuthSeen.clear()
        moeAuthSeen[key] = Platform.epochMillis()
    }

    /** Port of pbFavoriteStatus: an exact, account-scoped favourite lookup. */
    suspend fun favoriteStatus(id: String, postId: String, confirmedWrite: Boolean = false): Boolean {
        ensureLoaded()
        val s = Sources.source(id)
        val a = get(id)
        val sid = postId
        val name = a.login.replace(Regex("\\s"), "_")
        if (!Regex("^\\d+$").matches(sid) || (sid.toLongOrNull() ?: 0L) <= 0 || !hasAuth(id) || !likesOk(id)) {
            throw IllegalStateException("This post has no available source-Like integration.")
        }
        when (s.engine) {
            "danbooru" -> {
                val j = accountJSON(id, "favorites.json?" + QueryParams().set("search[user_name]", a.login).set("search[post_id]", sid).set("limit", "1"))
                val rows = (j as? JsonOrText.J)?.element?.arrOrNull
                    ?: throw IllegalStateException("The source did not confirm an exact, account-scoped favourite lookup.")
                if (rows.any { row ->
                        val o = row.objOrNull
                        val pid = o?.run { el("post_id").asStringOr("").ifEmpty { obj("post")?.str("id") ?: "" } } ?: ""
                        pid != sid
                    }
                ) throw IllegalStateException("The source did not confirm an exact, account-scoped favourite lookup.")
                return rows.size > 0
            }
            "moebooru" -> {
                if (!confirmedWrite) ensureMoeAuth(id, a)
                val j = accountJSON(id, "post/vote.json?" + QueryParams().set("id", sid))
                val vote = (j as? JsonOrText.J)?.element?.objOrNull?.el("vote")?.asStringOr("")?.toIntOrNull()
                    ?: throw IllegalStateException("Could not determine the site's 3-star vote.")
                return vote == 3
            }
            else -> {
                val path = if (s.engine == "e621") {
                    "posts.json?" + QueryParams().set("tags", "fav:$name id:$sid").set("limit", "1")
                } else {
                    "index.php?" + QueryParams().set("page", "dapi").set("s", "post").set("q", "index").set("json", "1").set("tags", "fav:" + a.login + " id:" + sid).set("limit", "1").set("pid", "0")
                }
                val j = accountJSON(id, path)
                val element = (j as? JsonOrText.J)?.element
                    ?: throw IllegalStateException("Could not determine the source's liked state.")
                val rows: JsonArray? = element.arrOrNull ?: when (s.engine) {
                    "e621" -> element.objOrNull?.arr("posts")
                    else -> element.objOrNull?.arr("post")
                        ?: if (element.objOrNull?.obj("@attributes")?.int("count") == 0) JsonArray(emptyList()) else null
                }
                if (rows == null || rows.any { it.objOrNull?.str("id") != sid }) {
                    throw IllegalStateException("The source did not confirm an exact, account-scoped favourite lookup.")
                }
                return rows.size > 0
            }
        }
    }

    /** Port of pbSetFavorite: a real, verified source write with rate pacing. */
    suspend fun setFavorite(id: String, postId: String, liked: Boolean): Boolean {
        ensureLoaded()
        val s = Sources.source(id)
        val sid = postId
        val a = get(id)
        val version = authVersion(id)
        if (!canLike(id) || !Regex("^\\d+$").matches(sid) || (sid.toLongOrNull() ?: 0L) <= 0) {
            throw IllegalStateException("This source needs complete account credentials before it can Like posts.")
        }
        if (id == "gelbooru" && !gelSessionOk(a.session)) {
            throw IllegalStateException("Enter only the Gelbooru pass_hash cookie value, not a full cookie header.")
        }
        val lock = writeLocks.getOrPut(id) { Mutex() }
        return lock.withLock {
            val wait = maxOf(0L, (lastWrite[id] ?: 0L) + 1100 - Platform.epochMillis())
            if (wait > 0) delay(wait)
            if (version != authVersion(id)) throw IllegalStateException("The account changed or the action was cancelled. No new request was sent.")
            lastWrite[id] = Platform.epochMillis()
            try {
                when (s.engine) {
                    "danbooru", "e621" -> {
                        val path = if (liked) "favorites.json" else "favorites/$sid.json"
                        val body = if (liked) "{\"post_id\":$sid}" else null
                        val j = accountJSON(id, path, a, method = if (liked) "POST" else "DELETE", body = body, mutation = true)
                        if (j is JsonOrText.T) throw IllegalStateException("The source returned a web page instead of a confirmed API response.")
                    }
                    "moebooru" -> {
                        val body = QueryParams().set("id", sid).set("score", if (liked) "3" else "0").set("login", a.login).set("password_hash", a.passHash).toString()
                        val j = Net.jsonFriendly(
                            s.bases[0] + "post/vote.json",
                            FetchOptions(isPrivate = true, method = "POST", body = body, headers = mapOf("Content-Type" to "application/x-www-form-urlencoded"), mutation = true, secrets = listOf(a.passHash)),
                        )
                        if (j is JsonOrText.T) throw IllegalStateException("The source returned a web page instead of a confirmed API response.")
                    }
                    "gelbooru" -> {
                        val path = if (liked) "public/addfav.php?id=$sid" else "index.php?page=favorites&s=delete&id=$sid"
                        val j = Net.jsonFriendly(
                            s.bases[0] + path,
                            FetchOptions(isPrivate = true, method = "GET", headers = mapOf("Cookie" to ("user_id=" + a.login + "; pass_hash=" + a.session)), mutation = true, secrets = listOf(a.session)),
                        )
                        if (liked) {
                            val text = (j as? JsonOrText.T)?.text?.trim() ?: (j as? JsonOrText.J)?.element?.let { (it as? JsonPrimitive)?.content } ?: ""
                            if (text !in listOf("1", "3")) throw IllegalStateException("Gelbooru did not accept the favourite. The website session may have expired or require a security check.")
                        }
                    }
                    else -> throw IllegalStateException("Source Likes are not implemented for " + s.name + ".")
                }
            } catch (e: Throwable) {
                val status = (e as? HttpError)?.status
                if (status == 429) {
                    val retrySeconds = (e as HttpError).retryAfter?.toDoubleOrNull()
                    lastWrite[id] = Platform.epochMillis() + ((retrySeconds?.takeIf { it > 0 }?.times(1000))?.toLong() ?: 60_000L)
                }
                // Native duplicate responses and Gelbooru's normal removal redirect
                // must be verified by a fresh READ, never by repeating the write.
                val tolerated = status == 423 || (id == "gelbooru" && !liked && status in listOf(301, 302, 303))
                if (!tolerated) throw e
            }
            if (version != authVersion(id)) throw IllegalStateException("The account changed while the source action was in progress.")
            if (s.engine == "moebooru") {
                val key = id + "|" + authVersion(id) + "|" + a.login
                if (moeAuthSeen.size > 40) moeAuthSeen.clear()
                moeAuthSeen[key] = Platform.epochMillis()
            }
            val actual = favoriteStatus(id, sid, confirmedWrite = true)
            if (actual != liked) throw IllegalStateException("The source did not confirm the requested Like state. Nothing was changed locally.")
            actual
        }
    }
}
