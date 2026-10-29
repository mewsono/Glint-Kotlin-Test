package dev.glint.sources

import dev.glint.core.LenientJson
import dev.glint.core.Platform
import dev.glint.core.QueryParams
import dev.glint.core.arrOrNull
import dev.glint.core.asStringOr
import dev.glint.core.el
import dev.glint.core.int
import dev.glint.core.obj
import dev.glint.core.objOrNull
import dev.glint.core.parseUrl
import dev.glint.core.str
import dev.glint.model.AuthRecord
import dev.glint.model.CustomSourceRecord
import dev.glint.model.ExploreSection
import dev.glint.model.Pin
import dev.glint.model.PostBatch
import dev.glint.model.RawPost
import dev.glint.model.TagSuggestion
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The source registry: a data-driven port of sources.js (itself a port of
 * Boorusama's site registry). Order and capabilities match the PWA.
 */
object Sources {
    val all = LinkedHashMap<String, SourceDef>()
    val order = ArrayList<String>()
    val CUSTOM_ENGINES = listOf("danbooru", "moebooru", "e621", "gelbooru", "philomena")
    const val CUSTOM_KEY = "pb-custom-sources-v1"
    private var loaded = false

    fun register(s: SourceDef) {
        all[s.id] = s
        if (!s.off) order.add(s.id)
    }

    fun ensureLoaded() {
        if (loaded) return
        loaded = true
        register(Engines.danbooru())
        register(Engines.moebooru("yandere", "yande.re", "yande.re", "https://yande.re/", "Reached through our proxy (the site sends no CORS headers)."))
        register(Engines.moebooru("konachan", "Konachan", "Konachan", "https://konachan.net/", "Reached through our proxy."))
        register(Engines.moebooru("sakuga", "Sakugabooru", "Sakuga", "https://www.sakugabooru.com/", "Animation booru — reached through our proxy."))
        register(Engines.gelbooru())
        register(Engines.e621())
        register(Engines.philomena("derpibooru", "Derpibooru", "Derpi", "https://derpibooru.org/", "Pony-themed booru. Works straight from the browser."))
        register(Engines.philomena("ponybooru", "Ponybooru", "Pony", "https://ponybooru.org/", "Reached through our proxy."))
        register(Engines.szurubooru("szurubooru", "Szurubooru", "Szurubooru", "https://szurubooru.com/", true, "The public instance no longer resolves — kept for reference."))
        register(Engines.szurubooru("hybooru", "booru.funmaker.moe", "Funmaker", "https://booru.funmaker.moe/", true, "Its API only returns ids — no image URLs. Kept for reference."))
        register(Engines.animePictures())
        register(Engines.eshuushuu())
        register(Engines.sankaku())
        register(Engines.nozomi())
        register(Engines.zerochan())
        register(Engines.paheal())
        loadCustomSources()
    }

    fun source(id: String): SourceDef {
        ensureLoaded()
        return all[id] ?: all[order.first()]!!
    }

    fun has(id: String): Boolean { ensureLoaded(); return all.containsKey(id) }

    /** normPin: brand a mapped pin with its source. */
    fun normalize(p: Pin, srcId: String): Pin {
        val s = source(srcId)
        return p.copy(id = "$srcId-${p.sid}", src = srcId, srcName = s.short.ifEmpty { s.name })
    }

    fun postSortSupported(srcId: String): Boolean =
        source(srcId).engine in listOf("danbooru", "moebooru", "e621", "gelbooru", "philomena", "eshuushuu")

    fun postPopularitySupported(srcId: String): Boolean {
        val s = source(srcId)
        return !s.off && s.engine in listOf("danbooru", "moebooru", "e621", "gelbooru", "philomena", "eshuushuu")
    }

    /** Load a page of posts from a source. Port of pbLoadPosts. */
    /** Only non-default sorts need a search token (feed-order contract). */
    fun orderToken(engine: String, order: String?): String = when (order) {
        "popularity" -> if (engine == "gelbooru") "sort:score:desc" else "order:score"
        "oldest" -> if (engine == "gelbooru") "sort:id:asc" else "order:" + (if (engine == "moebooru") "id" else "id_asc")
        else -> ""
    }

    suspend fun loadPosts(
        srcId: String,
        tags: String = "",
        page: Int = 1,
        limit: Int = 40,
        order: String? = "newest",
        base: String? = null,
        preserveQueryOrder: Boolean = false,
    ): PostBatch {
        ensureLoaded()
        val s = source(srcId)
        val nativeOrder = preserveQueryOrder && Regex("(?:^|\\s)(?:order|sort):\\S+", RegexOption.IGNORE_CASE).containsMatchIn(tags)
        val effectiveOrder: String? = if (nativeOrder) null else when (order) {
            "popularity" -> "popularity"
            "oldest" -> "oldest"
            else -> "newest"
        }
        fun sameHost(b: String) = parseUrl(b)?.origin == parseUrl(s.bases[0])?.origin
        fun authAt(b: String): AuthRecord? = if (sameHost(b) && Accounts.hasAuth(srcId)) Accounts.get(srcId) else null
        val primaryBase = base ?: s.bases[0]
        val chronological = effectiveOrder == "newest" || effectiveOrder == "oldest"

        fun ordered(pins: List<Pin>): List<Pin> =
            if (chronological && postSortSupported(srcId))
                pins.sortedWith(compareBy { p -> (p.sid.toLongOrNull() ?: 0L).let { if (effectiveOrder == "oldest") it else -it } })
            else pins

        fun batch(raw: List<RawPost>, response: JsonOrText?): PostBatch {
            val mapped = raw.mapNotNull { r -> s.mapper(r)?.let { normalize(it, srcId) } }
            val ids = mapped.map { it.sid }
            val numeric = ids.mapNotNull { it.toLongOrNull() }.filter { it > 0 }
            val declared = (response as? JsonOrText.J)?.element?.objOrNull?.el("has_more")?.let {
                (it as? JsonPrimitive)?.content?.toBooleanStrictOrNull()
            }
            val nextCursor = if (chronological && s.engine in listOf("danbooru", "e621") && numeric.isNotEmpty()) {
                if (effectiveOrder == "oldest") "a" + numeric.max() else "b" + numeric.min()
            } else null
            return PostBatch(
                pins = ordered(mapped.filter { it.grid.isNotEmpty() }),
                rawCount = raw.size,
                batchKey = ids.joinToString(","),
                nextCursor = nextCursor,
                hasMore = declared ?: (raw.size >= limit),
                endConfirmed = raw.isEmpty() || declared == false,
            )
        }

        suspend fun run(auth: AuthRecord?, baseOverride: String? = null): PostBatch {
            val useBase = baseOverride ?: primaryBase
            var useTags = tags
            if (effectiveOrder != null && s.engine in listOf("danbooru", "moebooru", "e621", "gelbooru")) {
                useTags = useTags.split(Regex("\\s+"))
                    .filter { !Regex("^(order|sort):", RegexOption.IGNORE_CASE).containsMatchIn(it) }
                    .joinToString(" ")
                useTags = listOf(useTags, orderToken(s.engine, effectiveOrder)).filter { it.isNotEmpty() }.joinToString(" ")
            }
            if (effectiveOrder == "popularity" && !postPopularitySupported(srcId)) throw IllegalStateException("This source does not support popularity sorting.")
            if (effectiveOrder == "oldest" && !postSortSupported(srcId)) throw IllegalStateException("This source does not support chronological sorting.")
            var req = s.lister(ListArgs(useTags, page, limit, useBase, auth, effectiveOrder))
            if (effectiveOrder != null && s.engine == "philomena" && req.url.isNotEmpty()) {
                val extra = QueryParams()
                    .set("sf", if (effectiveOrder == "popularity") "score" else "id")
                    .set("sd", if (effectiveOrder == "oldest") "asc" else "desc")
                req = req.copy(url = req.url + "&" + extra)
            }
            req.inline?.let { return batch(it, null) }
            val j = Net.json(req.url, FetchOptions(method = req.method, body = req.body, headers = req.headers, forceProxy = req.html))
                ?: throw IllegalStateException("Empty response from " + s.name)
            return batch(s.parser(j), j)
        }

        val auth = authAt(primaryBase)
        try {
            return run(auth)
        } catch (e: Throwable) {
            var error = e
            // A stale or wrong key must never kill the feed — ask again without it.
            if (auth != null && (auth.login.isNotEmpty() || auth.apiKey.isNotEmpty() || auth.passHash.isNotEmpty())) {
                try { return run(null) } catch (retry: Throwable) { error = retry }
            }
            // Some networks are challenged by one mirror while its sibling answers.
            val alternate = s.bases.firstOrNull { it != primaryBase }
            val status = (error as? HttpError)?.status
            if (alternate != null && status in listOf(403, 502, 503)) {
                try {
                    val pageResult = run(authAt(alternate), alternate)
                    MirrorNotice.notify(s.name + " blocked this network · showing " + (parseUrl(alternate)?.host ?: alternate) + " instead")
                    return pageResult
                } catch (_: Throwable) { throw error }
            }
            throw error
        }
    }

    /** Port of pbLoadPostCount. */
    suspend fun loadPostCount(srcId: String, tags: String): Int? {
        ensureLoaded()
        val s = source(srcId)
        val baseUrl = s.bases[0]
        val a = if (Accounts.hasAuth(srcId)) Accounts.get(srcId) else null
        var count: String? = null
        when (s.engine) {
            "danbooru" -> {
                val params = QueryParams().set("tags", tags)
                if (a != null && a.login.isNotEmpty() && a.apiKey.isNotEmpty()) { params.set("login", a.login); params.set("api_key", a.apiKey) }
                val j = Net.jsonFriendly(baseUrl + "counts/posts.json?" + params)
                count = (j as? JsonOrText.J)?.element?.objOrNull?.obj("counts")?.el("posts")?.asStringOr("")
            }
            "moebooru" -> {
                val params = QueryParams().set("tags", tags).set("limit", "1")
                if (a != null && a.login.isNotEmpty() && a.passHash.isNotEmpty()) { params.set("login", a.login); params.set("password_hash", a.passHash) }
                val xml = Net.text(baseUrl + "post.xml?" + params)
                count = Regex("<posts\\b[^>]*\\bcount=[\"'](\\d+)[\"']", RegexOption.IGNORE_CASE).find(xml)?.groupValues?.get(1)
            }
            "gelbooru" -> {
                val req = s.lister(ListArgs(tags, 1, 1, baseUrl, a, null))
                val j = Net.jsonFriendly(req.url)
                count = (j as? JsonOrText.J)?.element?.objOrNull?.obj("@attributes")?.el("count")?.asStringOr("")
            }
            "philomena" -> {
                val req = s.lister(ListArgs(tags, 1, 1, baseUrl, a, null))
                val j = Net.jsonFriendly(req.url)
                count = (j as? JsonOrText.J)?.element?.objOrNull?.el("total")?.asStringOr("")
            }
        }
        val n = count?.toDoubleOrNull()?.toLong() ?: return null
        return if (n in 0..Int.MAX_VALUE) n.toInt() else null
    }

    /** Real source tag names for autocomplete. Port of pbAutocomplete. */
    suspend fun autocomplete(srcId: String, q: String): List<TagSuggestion> {
        ensureLoaded()
        val s = source(srcId)
        val term = q.trim().lowercase()
        if (term.length < 2 || Regex("[\\s:*?\"'<>]").containsMatchIn(term) || s.off) return emptyList()
        val url = when (s.engine) {
            "danbooru", "e621" -> {
                val params = QueryParams().set("search[name_matches]", "$term*").set("search[order]", "count").set("limit", "12")
                s.bases[0] + "tags.json?" + params
            }
            "moebooru" -> {
                val params = QueryParams().set("name", "$term*").set("order", "count").set("limit", "12")
                s.bases[0] + "tag.json?" + params
            }
            else -> return emptyList()
        }
        return try {
            val j = Net.json(url)
            val rows = when (val element = (j as? JsonOrText.J)?.element) {
                is JsonArray -> element
                is JsonObject -> element.arr("tags") ?: JsonArray(emptyList())
                else -> JsonArray(emptyList())
            }
            val seen = HashSet<String>()
            rows.mapNotNull { row ->
                val o = row.objOrNull ?: return@mapNotNull null
                if (o.el("is_deprecated").asStringOr("") == "true") return@mapNotNull null
                val name = o.str("name").ifEmpty { o.str("value") }
                val rawCount = o.el("post_count") ?: o.el("count")
                val count = rawCount.asStringOr("").toDoubleOrNull()?.takeIf { it >= 0 }?.toInt()
                val category = (o.el("category") ?: o.el("type")).asStringOr("").ifEmpty { null }
                if (name.isEmpty() || !seen.add(name)) null else TagSuggestion(name, count, category)
            }.take(12)
        } catch (_: Throwable) { emptyList() }
    }

    /** Fresh detail data upgrades pins saved before categorized metadata existed. */
    suspend fun loadPostDetails(srcId: String, sid: String): Pin? {
        ensureLoaded()
        val s = source(srcId)
        val a = Accounts.get(srcId)
        val q = QueryParams()
        val url: String
        when (s.engine) {
            "danbooru" -> {
                if (a.login.isNotEmpty() && a.apiKey.isNotEmpty()) { q.set("login", a.login); q.set("api_key", a.apiKey) }
                url = s.bases[0] + "posts/" + dev.glint.core.encodeURIComponent(sid) + ".json?" + q
            }
            "e621" -> url = s.bases[0] + "posts/" + dev.glint.core.encodeURIComponent(sid) + ".json"
            "moebooru" -> {
                q.set("tags", "id:$sid").set("limit", "1").set("api_version", "2").set("include_tags", "1")
                url = s.bases[0] + "post.json?" + q
            }
            else -> return null
        }
        val opts = if (Accounts.hasAuth(srcId)) Accounts.authOptions(srcId) else FetchOptions()
        val j = Net.jsonFriendly(url, opts) ?: return null
        val raw: RawPost? = when (s.engine) {
            "danbooru" -> (j as? JsonOrText.J)?.element?.objOrNull?.let { RawPost(json = it) }
            "e621" -> (j as? JsonOrText.J)?.element?.objOrNull?.let { RawPost(json = it.obj("post") ?: it) }
            else -> s.parser(j).firstOrNull()?.let { first ->
                val types = (j as? JsonOrText.J)?.element?.objOrNull?.obj("tags")?.let { TagTypes.merge(it) }
                if (types != null) first.copy(tagTypes = types) else first
            }
        }
        val o = raw?.json ?: return null
        if (o.str("id") != sid) return null
        return s.mapper(raw)?.let { normalize(it, srcId) }
    }

    /* ------------------------------------------------------------ explore */

    val EX_SCALES = listOf("day", "week", "month")
    val MOE_SCALES = listOf("recent", "day", "week", "month")
    val EX_SCALE_LABEL = mapOf("day" to "Day", "week" to "Week", "month" to "Month", "recent" to "Recent")

    fun exploreDayStamp(): String {
        val d = Platform.localDate()
        return "${d[0]}-${d[1]}-${d[2]}"
    }

    fun exploreSections(srcId: String): List<ExploreSection> {
        ensureLoaded()
        val s = all[srcId] ?: return emptyList()
        if (s.off || s.custom) return emptyList()
        return when (s.engine) {
            "danbooru" -> listOf(
                ExploreSection("popular", "Popular", EX_SCALES, "day", paged = true),
                ExploreSection("hot", "Hot", emptyList(), "", paged = true),
                ExploreSection("viewed", "Most viewed", emptyList(), "", paged = false),
            )
            "moebooru" -> listOf(ExploreSection("popular", "Popular", MOE_SCALES, "recent", paged = false))
            "e621" -> listOf(ExploreSection("popular", "Popular", EX_SCALES, "day", paged = false))
            "philomena", "gelbooru" -> listOf(
                ExploreSection(
                    "score", "Top scored", emptyList(), "", paged = true,
                    note = "This source has no explore page of its own — this is its global top-score order.",
                ),
            )
            else -> emptyList()
        }
    }

    /** One explore view for a source. Port of pbLoadExplore. */
    suspend fun loadExplore(srcId: String, kind: String, scale: String = "day", page: Int = 1, limit: Int = 24): PostBatch {
        ensureLoaded()
        val s = source(srcId)
        val base = s.bases[0]
        val a = if (Accounts.hasAuth(srcId)) Accounts.get(srcId) else null
        if (kind == "score") {
            val ps = loadPosts(srcId, tags = "", page = page, limit = limit, order = "popularity")
            return ps.copy(hasMore = ps.rawCount > 0)
        }
        val stamp = exploreDayStamp()
        val d = Platform.localDate()
        val dan = QueryParams().set("date", stamp)
        if (a != null && a.login.isNotEmpty() && a.apiKey.isNotEmpty()) { dan.set("login", a.login); dan.set("api_key", a.apiKey) }
        val url: String = when {
            kind == "popular" && s.engine == "danbooru" -> {
                dan.set("scale", scale).set("page", page).set("limit", limit)
                base + "explore/posts/popular.json?" + dan
            }
            kind == "hot" && s.engine == "danbooru" -> {
                val p = QueryParams().set("tags", "order:rank").set("page", page).set("limit", limit)
                if (a != null && a.login.isNotEmpty() && a.apiKey.isNotEmpty()) { p.set("login", a.login); p.set("api_key", a.apiKey) }
                base + "posts.json?" + p
            }
            kind == "viewed" && s.engine == "danbooru" -> base + "explore/posts/viewed.json?" + dan
            kind == "popular" && s.engine == "moebooru" -> {
                val p = QueryParams()
                if (a != null && a.login.isNotEmpty() && a.passHash.isNotEmpty()) { p.set("login", a.login); p.set("password_hash", a.passHash) }
                when (scale) {
                    "recent" -> { p.set("period", "1d"); base + "post/popular_recent.json?" + p }
                    "day" -> { p.set("day", d[2]); p.set("month", d[1]); p.set("year", d[0]); base + "post/popular_by_day.json?" + p }
                    "week" -> { p.set("day", d[2]); p.set("month", d[1]); p.set("year", d[0]); base + "post/popular_by_week.json?" + p }
                    else -> { p.set("month", d[1]); p.set("year", d[0]); base + "post/popular_by_month.json?" + p }
                }
            }
            kind == "popular" && s.engine == "e621" -> {
                val p = QueryParams().set("date", stamp).set("scale", if (scale in listOf("day", "week", "month")) scale else "day")
                if (a != null && a.login.isNotEmpty() && a.apiKey.isNotEmpty()) { p.set("login", a.login); p.set("api_key", a.apiKey) }
                base + "popular.json?" + p
            }
            else -> throw IllegalStateException("This source has no explore view.")
        }
        val j = Net.jsonFriendly(url, FetchOptions(secrets = listOfNotNull(a?.apiKey, a?.passHash).filter { it.isNotEmpty() }))
            ?: throw IllegalStateException("Empty response from " + s.name)
        val raw = s.parser(j)
        val pins = raw.mapNotNull { r -> try { s.mapper(r)?.let { normalize(it, srcId) } } catch (_: Throwable) { null } }
            .filter { it.grid.isNotEmpty() }
        val paged = kind == "popular" || kind == "hot"
        val hasMore = paged && s.engine == "danbooru" && raw.size >= limit
        return PostBatch(
            pins = pins, rawCount = raw.size,
            batchKey = pins.joinToString(",") { it.sid },
            nextCursor = null, hasMore = hasMore, endConfirmed = !hasMore,
        )
    }

    /* ----------------------------------------------------- custom sources */

    fun normalizeBase(value: String): String {
        var raw = value.trim()
        if (raw.isEmpty()) throw IllegalArgumentException("Enter the booru's address, for example https://example.booru.org/")
        if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(raw)) raw = "https://$raw"
        val u = parseUrl(raw) ?: throw IllegalArgumentException("That does not look like a web address.")
        if (raw.contains('@') && raw.indexOf('@') < raw.length - raw.substringAfterLast('/').length) {
            // crude check: no credentials in the address
            if (Regex("^https?://[^/]*@").containsMatchIn(raw)) throw IllegalArgumentException("Do not put a login in the address.")
        }
        val path = u.path.trimEnd('/')
        return u.origin + path + "/"
    }

    private fun engineTemplate(engine: String): SourceDef? =
        order.mapNotNull { all[it] }.firstOrNull { !it.custom && !it.off && it.engine == engine && it.bases.isNotEmpty() }

    fun customRecords(): List<CustomSourceRecord> = try {
        val raw = Platform.storage().get(CUSTOM_KEY) ?: return emptyList()
        LenientJson.decodeFromString(ListSerializer(CustomSourceRecord.serializer()), raw)
    } catch (_: Throwable) { emptyList() }

    fun writeCustomRecords(records: List<CustomSourceRecord>) {
        try {
            Platform.storage().put(CUSTOM_KEY, LenientJson.encodeToString(ListSerializer(CustomSourceRecord.serializer()), records.take(40)))
        } catch (_: Throwable) {}
    }

    private fun registerCustom(record: CustomSourceRecord): SourceDef? {
        if (record.id.isEmpty() || all.containsKey(record.id)) return null
        val tpl = engineTemplate(record.engine) ?: return null
        val base = try { normalizeBase(record.base) } catch (_: Throwable) { return null }
        val src = SourceDef(
            id = record.id, name = record.name.ifEmpty { base }, short = record.name.ifEmpty { base },
            engine = record.engine, bases = listOf(base), tagSep = tpl.tagSep, ratingTag = tpl.ratingTag,
            auth = null, // no account integration is claimed for a source we cannot verify
            note = "Added by you. Same API family as " + tpl.name + ".",
            custom = true, off = false,
            lister = tpl.lister, parser = tpl.parser, mapper = tpl.mapper,
        )
        register(src)
        parseUrl(base)?.host?.let { host ->
            Net.DIRECT_HOSTS.add(host)
            Net.PROXY_HOSTS.remove(host)
        }
        return src
    }

    fun loadCustomSources(): Boolean {
        var changed = false
        for (record in customRecords()) {
            if (all.containsKey(record.id)) continue
            if (registerCustom(record) != null) changed = true
        }
        return changed
    }

    private fun sameBase(s: SourceDef, base: String): Boolean {
        val want = try { normalizeBase(base) } catch (_: Throwable) { return false }
        return s.bases.any { b -> try { normalizeBase(b) == want } catch (_: Throwable) { false } }
    }

    /** Add one custom source; returns its id, throws a readable error otherwise. */
    fun addCustomSource(name: String, baseInput: String, engine: String): String {
        ensureLoaded()
        val cleanName = name.trim().take(40)
        val base = normalizeBase(baseInput)
        if (cleanName.isEmpty()) throw IllegalArgumentException("Give the source a name.")
        if (engine !in CUSTOM_ENGINES) throw IllegalArgumentException("Choose the booru's API type, or use Guess.")
        val records = customRecords()
        val presetClash = order.mapNotNull { all[it] }.firstOrNull { !it.off && sameBase(it, base) }
        val recordClash = records.firstOrNull { r -> try { normalizeBase(r.base) == base } catch (_: Throwable) { false } }
        val clashName = presetClash?.name ?: recordClash?.name
        if (clashName != null) throw IllegalArgumentException("That address is already a source ($clashName).")
        var id = "custom-" + base.replace(Regex("^https?://"), "").replace(Regex("[^a-zA-Z0-9]+"), "-").trim('-').lowercase().take(40)
        var n = 1
        while (all.containsKey(id)) id = "custom-" + base.replace(Regex("[^a-zA-Z0-9]+"), "-").lowercase().take(34) + "-" + (++n)
        val record = CustomSourceRecord(id, cleanName, base, engine, addedAt = Platform.epochMillis())
        registerCustom(record) ?: throw IllegalArgumentException("That source could not be added.")
        writeCustomRecords(records + record)
        return id
    }

    /** Edit a user source. The id never changes so saved bookmarks keep working. */
    fun updateCustomSource(id: String, name: String, baseInput: String, engine: String): CustomSourceRecord {
        ensureLoaded()
        val current = all[id]
        val records = customRecords()
        val record = records.firstOrNull { it.id == id }
        if (current == null || !current.custom || record == null) throw IllegalArgumentException("That source cannot be edited.")
        val cleanName = name.trim().take(40)
        val base = normalizeBase(baseInput)
        if (cleanName.isEmpty()) throw IllegalArgumentException("Give the source a name.")
        if (engine !in CUSTOM_ENGINES) throw IllegalArgumentException("Choose the booru's API type, or use Guess.")
        val clash = order.mapNotNull { all[it] }.firstOrNull { it.id != id && !it.off && sameBase(it, base) }
        if (clash != null) throw IllegalArgumentException("That address is already a source (" + clash.name + ").")
        val next = record.copy(name = cleanName, base = base, engine = engine, updatedAt = Platform.epochMillis())
        all.remove(id)
        order.remove(id)
        if (registerCustom(next) == null) {
            registerCustom(record)
            throw IllegalArgumentException("That source could not be updated.")
        }
        writeCustomRecords(records.map { if (it.id == id) next else it })
        return next
    }

    fun removeCustomSource(id: String): Boolean {
        ensureLoaded()
        val s = all[id]
        if (s == null || !s.custom) return false
        all.remove(id)
        order.remove(id)
        Accounts.remove(id)
        writeCustomRecords(customRecords().filter { it.id != id })
        return true
    }

    /** Ask the address itself which API it speaks. Never guesses silently. */
    suspend fun guessEngine(baseInput: String): String {
        val norm = normalizeBase(baseInput)
        suspend fun read(url: String): JsonOrText.J? = try {
            val res = Net.fetch(url)
            val text = res.text.trim()
            if (text.isEmpty() || (text[0] != '{' && text[0] != '[')) null
            else dev.glint.core.parseJsonOrNull(text)?.let { JsonOrText.J(it) }
        } catch (_: Throwable) { null }

        var j = read(norm + "posts.json?limit=1")
        if (j?.element is JsonArray) return "danbooru"
        if (j?.element?.objOrNull?.arr("posts") != null) return "e621"
        j = read(norm + "post.json?limit=1")
        if (j?.element is JsonArray) return "moebooru"
        j = read(norm + "api/v1/json/search/posts?q=*&per_page=1")
        if (j?.element?.objOrNull?.let { it.arr("posts") != null || it.containsKey("search") } == true) return "philomena"
        j = read(norm + "index.php?page=dapi&s=post&q=index&json=1&limit=1")
        if (j?.element is JsonArray || j?.element?.objOrNull?.arr("post") != null) return "gelbooru"
        return ""
    }
}

/** Mirror-fallback notices surface as toasts in the UI. */
object MirrorNotice {
    var listener: ((String) -> Unit)? = null
    fun notify(message: String) { listener?.invoke(message) }
}
