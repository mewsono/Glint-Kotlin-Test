package dev.glint.sources

import dev.glint.core.QueryParams
import dev.glint.core.arrOrNull
import dev.glint.core.asStringOr
import dev.glint.core.el
import dev.glint.core.int
import dev.glint.core.long
import dev.glint.core.obj
import dev.glint.core.objOrNull
import dev.glint.core.str
import dev.glint.model.AuthRecord
import dev.glint.model.HtmlPost
import dev.glint.model.ListRequest
import dev.glint.model.Pin
import dev.glint.model.RawPost
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class AuthSpec(
    val userLabel: String,
    val keyLabel: String,
    val password: Boolean = false,
    val optional: Boolean = false,
    val likes: Boolean = false,
    val session: Boolean = false,
    val keyOnly: Boolean = false,
)

data class ListArgs(
    val tags: String,
    val page: Int,
    val limit: Int,
    val base: String,
    val auth: AuthRecord?,
    val order: String?,
)

class SourceDef(
    val id: String,
    val name: String,
    val short: String,
    val engine: String,
    val bases: List<String>,
    val tagSep: String = " ",
    val ratingTag: String = "rating:",
    val auth: AuthSpec? = null,
    val note: String = "",
    val off: Boolean = false,
    val custom: Boolean = false,
    val lister: suspend (ListArgs) -> ListRequest,
    val parser: (JsonOrText?) -> List<RawPost>,
    val mapper: (RawPost) -> Pin?,
)

/** Build the final Pin out of mapper basics + raw metadata, like normPin + pbPost*Info. */
internal fun finishPin(
    meta: JsonObject?,
    sid: String,
    title: String,
    tags: List<String>,
    rating: String,
    w: Int,
    h: Int,
    grid: String,
    sample: String,
    orig: String,
    score: Int,
    author: String,
    date: Long,
    tagTypes: Map<String, String>? = null,
): Pin {
    val metadata = postMetadata(meta, tagTypes)
    val fileInfo = postFileInfo(meta, grid, sample, orig)
    val uploadInfo = postUploadInfo(meta)
    val links = postSourceInfo(meta)
    return Pin(
        id = sid, sid = sid, t = title, tags = tags, rating = rating,
        width = w, height = h, r = pbRatio(w, h),
        grid = Net.img(grid), sample = Net.img(sample), orig = Net.img(orig),
        score = score, author = author, date = date,
        artists = metadata.artists, characters = metadata.characters, series = metadata.series,
        detailsReady = metadata.detailsReady,
        fileSize = fileInfo.fileSize, fileType = fileInfo.fileType, fileInfoReady = fileInfo.ready,
        uploadedAt = uploadInfo.uploadedAt, uploadInfoReady = uploadInfo.ready,
        sourceLinks = links, sourceInfoReady = meta != null,
    )
}

private fun danThumb(md5: String, size: String): String =
    if (md5.isNotEmpty()) "https://cdn.donmai.us/$size/${md5.take(2)}/${md5.substring(2, 4)}/$md5.jpg" else ""

internal fun jsonPosts(j: JsonOrText?): List<RawPost> = when (j) {
    is JsonOrText.J -> when (val element = j.element) {
        is JsonArray -> element.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } }
        is JsonObject -> element.arr("posts")?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
        else -> emptyList()
    }
    else -> emptyList()
}

object Engines {

    fun danbooru(): SourceDef = SourceDef(
        id = "danbooru", name = "Danbooru", short = "Danbooru", engine = "danbooru",
        bases = listOf("https://danbooru.donmai.us/", "https://safebooru.donmai.us/"),
        auth = AuthSpec("Username", "API key", likes = true),
        note = "Public API, works straight from the browser.",
        lister = { a ->
            val p = QueryParams().set("page", a.page).set("limit", a.limit)
            if (a.tags.isNotEmpty()) p.set("tags", a.tags)
            val k = a.auth
            if (k != null && k.login.isNotEmpty() && k.apiKey.isNotEmpty()) {
                p.set("login", k.login); p.set("api_key", k.apiKey)
            }
            ListRequest(url = a.base + "posts.json?" + p)
        },
        parser = { jsonPosts(it) },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val md5 = o.str("md5")
            val w = o.int("image_width").takeIf { it > 0 } ?: o.int("width")
            val h = o.int("image_height").takeIf { it > 0 } ?: o.int("height")
            val thumb = danThumb(md5, "360x360")
            val tagString = o.str("tag_string")
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(tagString.split(" ").take(5).joinToString(", "), 60),
                tags = pbTags(o.el("tag_string")), rating = o.str("rating", "s"),
                w = w, h = h,
                grid = thumb.ifEmpty { o.str("preview_file_url").ifEmpty { o.str("large_file_url").ifEmpty { o.str("file_url") } } },
                sample = o.str("large_file_url").ifEmpty { o.str("file_url") },
                orig = o.str("file_url"),
                score = o.int("score"), author = o.str("artist"),
                date = pbDate(o.el("created_at")),
            )
        },
    )

    fun moebooru(id: String, name: String, short: String, base: String, note: String): SourceDef = SourceDef(
        id = id, name = name, short = short, engine = "moebooru", bases = listOf(base),
        auth = AuthSpec("Username", "Password", password = true, likes = true),
        note = note,
        lister = { a ->
            val p = QueryParams().set("page", a.page).set("limit", a.limit)
            // Ask for the tag categories in the same call: artist / character /
            // series are known the moment a post opens.
            p.set("api_version", "2").set("include_tags", "1")
            if (a.tags.isNotEmpty()) p.set("tags", a.tags)
            val k = a.auth
            if (k != null && k.login.isNotEmpty() && k.passHash.isNotEmpty()) {
                p.set("login", k.login); p.set("password_hash", k.passHash)
            }
            ListRequest(url = a.base + "post.json?" + p)
        },
        parser = { j ->
            when (j) {
                is JsonOrText.J -> {
                    val element = j.element
                    val posts = (element as? JsonArray)
                        ?: element.objOrNull?.arr("posts")
                        ?: JsonArray(emptyList())
                    val tagMap = element.objOrNull?.obj("tags")
                    val types = TagTypes.merge(tagMap)
                    posts.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o, tagTypes = types) } }
                }
                else -> emptyList()
            }
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(o.str("tags").split(" ").take(5).joinToString(", "), 60),
                tags = pbTags(o.el("tags")), rating = o.str("rating", "s"),
                w = w, h = h,
                grid = o.str("preview_url").ifEmpty { o.str("sample_url").ifEmpty { o.str("file_url") } },
                sample = o.str("sample_url").ifEmpty { o.str("file_url") },
                orig = o.str("file_url"),
                score = o.int("score"), author = o.str("author"),
                date = pbDate(o.el("created_at")),
                tagTypes = raw.tagTypes,
            )
        },
    )

    fun gelbooru(): SourceDef = SourceDef(
        id = "gelbooru", name = "Gelbooru", short = "Gelbooru", engine = "gelbooru",
        bases = listOf("https://gelbooru.com/"),
        auth = AuthSpec("User ID", "API key", likes = true, session = true),
        note = "Needs a user id + API key (free). Reached through our proxy.",
        lister = { a ->
            val p = QueryParams()
            p.set("page", "dapi").set("s", "post").set("q", "index").set("json", "1")
            p.set("pid", a.page).set("limit", a.limit)
            if (a.tags.isNotEmpty()) p.set("tags", a.tags)
            val k = a.auth
            if (k != null && k.login.isNotEmpty() && k.apiKey.isNotEmpty()) {
                p.set("user_id", k.login); p.set("api_key", k.apiKey)
            }
            ListRequest(url = a.base + "index.php?" + p)
        },
        parser = { j ->
            when (j) {
                is JsonOrText.J -> when (val element = j.element) {
                    is JsonArray -> element.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } }
                    is JsonObject -> element.arr("post")?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
                    else -> emptyList()
                }
                else -> emptyList()
            }
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(pbTags(o.el("tags")).take(5).joinToString(", "), 60),
                tags = pbTags(o.el("tags")), rating = o.str("rating", "s"),
                w = w, h = h,
                grid = o.str("preview_url").ifEmpty { o.str("sample_url").ifEmpty { o.str("file_url") } },
                sample = o.str("sample_url").ifEmpty { o.str("file_url") },
                orig = o.str("file_url"),
                score = o.int("score"), author = o.str("author"),
                date = pbDate(o.el("created_at")),
            )
        },
    )

    fun e621(): SourceDef = SourceDef(
        id = "e621", name = "e621", short = "e621", engine = "e621",
        bases = listOf("https://e621.net/"),
        auth = AuthSpec("Username", "API key", likes = true),
        note = "Furry booru — reached through our proxy.",
        lister = { a ->
            val p = QueryParams().set("page", a.page).set("limit", a.limit)
            if (a.tags.isNotEmpty()) p.set("tags", a.tags)
            val k = a.auth
            val headers = if (k != null && k.login.isNotEmpty() && k.apiKey.isNotEmpty()) {
                mapOf("Authorization" to "Basic " + dev.glint.core.B64.encode(k.login + ":" + k.apiKey))
            } else emptyMap()
            ListRequest(url = a.base + "posts.json?" + p, headers = headers)
        },
        parser = { j ->
            (j as? JsonOrText.J)?.element?.objOrNull?.arr("posts")
                ?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val f = o.obj("file") ?: JsonObject(emptyMap())
            val sm = o.obj("sample") ?: JsonObject(emptyMap())
            val pv = o.obj("preview") ?: JsonObject(emptyMap())
            val w = f.int("width"); val h = f.int("height")
            val tg = ArrayList<String>()
            val tagsEl = o.el("tags")
            if (tagsEl is JsonObject) {
                for ((_, group) in tagsEl) group.arrOrNull?.forEach { t ->
                    when (t) {
                        is JsonPrimitive -> tg.add(t.content)
                        is JsonObject -> tg.add(t.str("name"))
                        else -> {}
                    }
                }
            } else pbTags(tagsEl).forEach { tg.add(it) }
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(tg.take(5).joinToString(", "), 60),
                tags = tg.filter { it.isNotEmpty() }, rating = o.str("rating", "s"),
                w = w, h = h,
                grid = pv.str("url").ifEmpty { sm.str("url").ifEmpty { f.str("url") } },
                sample = sm.str("url").ifEmpty { f.str("url") },
                orig = f.str("url"),
                score = (o.el("score")?.objOrNull?.int("total")) ?: o.int("score"),
                author = "", date = pbDate(o.el("created_at")),
            )
        },
    )

    /** Philomena search understands no rating: filters — translate them. */
    fun philomenaTranslateTags(t: String): String =
        t.split(Regex("\\s+")).filter { it.isNotBlank() }.joinToString(",") { x ->
            when (x) {
                "rating:safe" -> "safe"
                "rating:q" -> "questionable"
                "rating:e" -> "explicit"
                else -> x
            }
        }

    fun philomena(id: String, name: String, short: String, base: String, note: String): SourceDef = SourceDef(
        id = id, name = name, short = short, engine = "philomena", bases = listOf(base),
        tagSep = ",",
        auth = AuthSpec("", "API key", keyOnly = true),
        note = note,
        lister = { a ->
            val p = QueryParams().set("page", a.page).set("per_page", a.limit)
            p.set("q", if (a.tags.isNotEmpty()) philomenaTranslateTags(a.tags) else "*")
            val k = a.auth
            if (k != null && k.apiKey.isNotEmpty()) p.set("key", k.apiKey)
            ListRequest(url = a.base + "api/v1/json/search/images?" + p)
        },
        parser = { j ->
            (j as? JsonOrText.J)?.element?.objOrNull?.arr("images")
                ?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            val v = o.obj("representations") ?: o.obj("variants") ?: JsonObject(emptyMap())
            fun pick(key: String): String {
                val value = v.el(key) ?: return ""
                return (value as? JsonPrimitive)?.content ?: value.objOrNull?.str("url") ?: ""
            }
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(pbTags(o.el("tags")).take(5).joinToString(", "), 60),
                tags = pbTags(o.el("tags")), rating = o.str("rating", "s"),
                w = w, h = h,
                grid = pick("small").ifEmpty { pick("thumb_small").ifEmpty { pick("medium").ifEmpty { o.str("preview_url") } } },
                sample = pick("medium").ifEmpty { pick("large").ifEmpty { o.str("sample_url") } },
                orig = pick("full").ifEmpty { pick("large").ifEmpty { o.str("file_url") } },
                score = o.int("score"), author = o.str("uploader"),
                date = pbDate(o.el("created_at")),
            )
        },
    )

    fun szurubooru(id: String, name: String, short: String, base: String, off: Boolean, note: String): SourceDef = SourceDef(
        id = id, name = name, short = short, engine = "szurubooru", bases = listOf(base),
        off = off, note = note,
        lister = { a ->
            val p = QueryParams().set("page", a.page).set("limit", a.limit)
            if (a.tags.isNotEmpty()) p.set("tags", a.tags)
            ListRequest(url = a.base + "api/posts.json?" + p)
        },
        parser = { j ->
            (j as? JsonOrText.J)?.element?.objOrNull?.arr("posts")
                ?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val file = o.obj("file") ?: JsonObject(emptyMap())
            val w = o.int("canvasWidth").takeIf { it > 0 } ?: file.int("width")
            val h = o.int("canvasHeight").takeIf { it > 0 } ?: file.int("height")
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(pbTags(o.el("tags")).take(5).joinToString(", "), 60),
                tags = pbTags(o.el("tags")), rating = o.str("safety", "s"),
                w = w, h = h,
                grid = o.obj("thumbnail")?.str("url") ?: file.str("url"),
                sample = file.str("url"), orig = file.str("url"),
                score = o.int("score"),
                author = o.obj("user")?.str("name") ?: "",
                date = pbDate(o.el("creationTime")),
            )
        },
    )

    fun animePictures(): SourceDef = SourceDef(
        id = "animepictures", name = "Anime Pictures", short = "AnimePics", engine = "anime-pictures",
        bases = listOf("https://anime-pictures.net/"),
        note = "Reached through our proxy.",
        lister = { a ->
            val p = QueryParams().set("page", a.page - 1).set("posts_per_page", a.limit)
            if (a.tags.isNotEmpty()) p.set("search_tag", a.tags)
            ListRequest(url = "https://api.anime-pictures.net/api/v3/posts?" + p)
        },
        parser = { j ->
            (j as? JsonOrText.J)?.element?.objOrNull?.arr("posts")
                ?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            val md5 = o.str("md5")
            // The preview CDN always answers AVIF, whatever the upload's own extension is.
            val dir = md5.take(3)
            val small = "https://opreviews.anime-pictures.net/$dir/${md5}_sp.avif"
            val big = "https://opreviews.anime-pictures.net/$dir/${md5}_cp.avif"
            val orig = "https://opreviews.anime-pictures.net/$dir/${md5}_bp.avif"
            val tg = ArrayList<String>()
            val tagsObj = o.obj("tags")
            if (tagsObj != null) for (key in listOf("general", "characters", "artists", "copyright")) {
                tagsObj.arr(key)?.forEach { t ->
                    when (t) {
                        is JsonPrimitive -> tg.add(t.content)
                        is JsonObject -> tg.add(t.str("name"))
                        else -> {}
                    }
                }
            }
            val sid = o.str("id")
            finishPin(
                meta = o, sid = sid,
                title = pbClip(tg.take(5).joinToString(", "), 60).ifEmpty { "Anime Pictures #$sid" },
                tags = tg, rating = if (o.int("erotics") != 0) "q" else "s",
                w = w, h = h,
                grid = small, sample = big, orig = orig,
                score = o.int("score"), author = "",
                date = pbDate(o.el("pubtime") ?: o.el("datetime")),
            )
        },
    )

    fun eshuushuu(): SourceDef = SourceDef(
        id = "eshuushuu", name = "e-shuushuu", short = "e-shuushuu", engine = "eshuushuu",
        bases = listOf("https://e-shuushuu.net/"),
        note = "Reached through our proxy.",
        lister = { a ->
            val base = a.base
            val p = QueryParams().set("page", a.page).set("per_page", minOf(100, a.limit))
            if (a.order == "popularity") { p.set("sort_by", "favorites"); p.set("sort_order", "DESC") }
            else if (a.order == "oldest") p.set("sort_order", "ASC")
            // The documented API filters by tag *id*: resolve each name once.
            suspend fun resolve(name: String): Long {
                return try {
                    val q = QueryParams().set("search", name).set("per_page", "10")
                    val found = Net.json(base + "api/v1/tags?" + q)
                    val list = (found as? JsonOrText.J)?.element?.objOrNull?.arr("tags") ?: JsonArray(emptyList())
                    val exact = list.firstOrNull { it.objOrNull?.str("title")?.lowercase() == name.lowercase() }?.objOrNull
                    val alias = list.firstOrNull { it.objOrNull?.str("alias_of_name")?.lowercase() == name.lowercase() }?.objOrNull
                    val hit = exact ?: alias
                    hit?.let { it.long("alias_of").takeIf { v -> v > 0 } ?: it.long("tag_id") } ?: 0L
                } catch (_: Throwable) { 0L }
            }
            val query = a.tags.trim().replace('_', ' ')
            if (query.isNotEmpty()) {
                var ids = ArrayList<Long>()
                val whole = resolve(query)
                if (whole > 0) ids.add(whole)
                else {
                    val parts = query.split(Regex("[\\s,]+")).filter { it.isNotBlank() }
                    for (part in parts) {
                        val id = resolve(part)
                        if (id <= 0) { ids = ArrayList(); break }
                        ids.add(id)
                    }
                }
                if (ids.isNotEmpty()) {
                    p.set("tags", ids.joinToString(",")); p.set("tags_mode", "all")
                    ListRequest(url = base + "api/v1/images?" + p)
                } else {
                    // Free text that is not a tag name: read the site's own gallery.
                    val q = QueryParams().set("tags", query).set("page", a.page)
                    ListRequest(url = base + "search?" + q, html = true)
                }
            } else ListRequest(url = base + "api/v1/images?" + p)
        },
        parser = { j ->
            when (j) {
                is JsonOrText.T -> {
                    // /search gallery HTML
                    val out = ArrayList<RawPost>()
                    val seen = HashSet<String>()
                    Regex("data-image-id=\"(\\d+)\"[^>]*>\\s*<img[^>]+src=\"([^\"]+)\"").findAll(j.text).forEach { m ->
                        val id = m.groupValues[1]
                        if (seen.add(id)) out.add(RawPost(html = HtmlPost(id, m.groupValues[2].replace("&amp;", "&"))))
                    }
                    out
                }
                is JsonOrText.J -> {
                    val element = j.element
                    (element.objOrNull?.arr("images") ?: element as? JsonArray)
                        ?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
                }
                else -> emptyList()
            }
        },
        mapper = { raw ->
            raw.html?.let { scraped ->
                return@SourceDef finishPin(
                    meta = null, sid = scraped.id, title = "",
                    tags = emptyList(), rating = "s", w = 0, h = 0,
                    grid = scraped.thumb, sample = scraped.thumb, orig = scraped.thumb,
                    score = 0, author = "", date = 0,
                )
            }
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            val file = o.str("filename")
            val thumb = o.str("thumb").ifEmpty { if (file.isNotEmpty()) "https://cdn.e-shuushuu.net/thumbs/$file.webp" else "" }
            val ext = o.str("ext").removePrefix(".")
            val full = if (file.isNotEmpty() && ext.isNotEmpty()) "https://cdn.e-shuushuu.net/fullsize/$file.$ext" else thumb
            val tg = pbTags(o.el("tags"))
            val user = o.obj("user")?.let { it.str("username").ifEmpty { it.str("name") } } ?: ""
            finishPin(
                meta = o, sid = o.str("image_id").ifEmpty { o.str("id") },
                title = pbClip(tg.take(5).joinToString(", "), 60),
                tags = tg, rating = "s", w = w, h = h,
                grid = thumb, sample = full, orig = full,
                score = o.int("favorites").takeIf { it != 0 } ?: o.int("score"),
                author = user, date = pbDate(o.el("date_added")),
            )
        },
    )

    fun sankaku(): SourceDef = SourceDef(
        id = "sankaku", name = "Sankaku", short = "Sankaku", engine = "sankaku", off = true,
        bases = listOf("https://chan.sankakucomplex.com/"),
        note = "Reached through our proxy — needs a user key.",
        lister = { a ->
            val p = QueryParams().set("page", a.page).set("limit", a.limit)
            if (a.tags.isNotEmpty()) p.set("tags", a.tags)
            ListRequest(
                url = "https://sankakuapi.com/posts?" + p,
                headers = mapOf("Accept" to "application/json", "User-Agent" to Net.UA),
            )
        },
        parser = { j ->
            when (j) {
                is JsonOrText.J -> when (val element = j.element) {
                    is JsonObject -> element.arr("data")?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
                    is JsonArray -> element.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } }
                    else -> emptyList()
                }
                else -> emptyList()
            }
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(pbTags(o.el("tags")).take(5).joinToString(", "), 60),
                tags = pbTags(o.el("tags")), rating = o.str("rating", "s"),
                w = w, h = h,
                grid = o.str("sample_url").ifEmpty { o.str("preview_url").ifEmpty { o.str("file_url") } },
                sample = o.str("sample_url").ifEmpty { o.str("file_url") },
                orig = o.str("file_url"),
                score = o.int("score"), author = "",
                date = pbDate(o.el("created_at")),
            )
        },
    )

    fun nozomi(): SourceDef = SourceDef(
        id = "nozomi", name = "Nozomi.la", short = "Nozomi", engine = "nozomi", off = true,
        bases = listOf("https://nozomi.la/"),
        note = "Its per-post API stopped resolving — kept for reference.",
        lister = { a ->
            val idx = if (a.tags.isNotEmpty())
                "https://j.gold-usergeneratedcontent.net/nozomi/" + dev.glint.core.encodeURIComponent(a.tags.split(Regex("\\s+"))[0]) + ".nozomi"
            else "https://n.nozomi.la/index.nozomi"
            val buf = Net.text(idx, FetchOptions(forceProxy = true))
            val ids = ArrayList<Long>()
            if (buf.length > 8) {
                var i = 0
                while (i + 3 < buf.length) {
                    val b0 = buf[i].code and 255; val b1 = buf[i + 1].code and 255
                    val b2 = buf[i + 2].code and 255; val b3 = buf[i + 3].code and 255
                    ids.add((b0.toLong()) or (b1.toLong() shl 8) or (b2.toLong() shl 16) or (b3.toLong() shl 24))
                    i += 4
                }
            }
            val off = (a.page - 1) * a.limit
            val slice = ids.drop(off).take(a.limit).take(20)
            val posts = ArrayList<RawPost>()
            for (id in slice) {
                val v = id.toString()
                val last = v.takeLast(1)
                val prev2 = if (v.length >= 3) v.substring(v.length - 3, v.length - 1) else v.dropLast(1)
                try {
                    val j = Net.json("https://j.gold-usergeneratedcontent.net/post/$last/$prev2/$v.json", FetchOptions(forceProxy = true))
                    (j as? JsonOrText.J)?.element?.objOrNull?.let { posts.add(RawPost(json = it)) }
                } catch (_: Throwable) {}
            }
            ListRequest(inline = posts)
        },
        parser = { jsonPosts(it) },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            val dataId = o.str("dataid").ifEmpty { o.str("postid") }
            val last = dataId.takeLast(1)
            val prev2 = if (dataId.length >= 3) dataId.substring(dataId.length - 3, dataId.length - 1) else dataId.dropLast(1)
            val ext = o.str("type", "jpg")
            val path = "$last/$prev2/$dataId"
            val tg = ArrayList<String>()
            for (key in listOf("general", "artist", "copyright", "character")) {
                o.arr(key)?.forEach { x ->
                    when (x) {
                        is JsonPrimitive -> tg.add(x.content)
                        is JsonObject -> tg.add(x.str("tag").ifEmpty { x.str("name") })
                        else -> {}
                    }
                }
            }
            finishPin(
                meta = o, sid = o.str("postid").ifEmpty { o.str("id") },
                title = pbClip(tg.take(5).joinToString(", "), 60),
                tags = tg.filter { it.isNotEmpty() }, rating = "s", w = w, h = h,
                grid = "https://qtn.gold-usergeneratedcontent.net/$path.$ext.webp",
                sample = "https://j.gold-usergeneratedcontent.net/$path.$ext",
                orig = "https://j.gold-usergeneratedcontent.net/$path.$ext",
                score = 0, author = "", date = pbDate(o.el("date")),
            )
        },
    )

    fun zerochan(): SourceDef = SourceDef(
        id = "zerochan", name = "Zerochan", short = "Zerochan", engine = "zerochan", off = true,
        bases = listOf("https://www.zerochan.net/"),
        note = "No public API and the site is behind a bot wall — kept for reference.",
        lister = { a ->
            val p = QueryParams().set("e", "1").set("s", "1").set("p", a.page)
            if (a.tags.isNotEmpty()) p.set("q", a.tags)
            ListRequest(url = "https://www.zerochan.net/?" + p, html = true)
        },
        parser = { j ->
            when (j) {
                is JsonOrText.T -> {
                    val out = ArrayList<RawPost>()
                    val seen = HashSet<String>()
                    Regex("href=\"(/(\\d+)/[^\"]+)\"").findAll(j.text).forEach { m ->
                        val id = m.groupValues[2]
                        if (seen.add(id)) out.add(RawPost(html = HtmlPost(id, "", m.groupValues[1])))
                    }
                    out
                }
                else -> emptyList()
            }
        },
        mapper = { raw ->
            val scraped = raw.html ?: return@SourceDef null
            val id = scraped.id
            val ext = if ((id.toLongOrNull() ?: 0L) % 2 == 1L) "jpg" else "png"
            finishPin(
                meta = null, sid = id, title = "Zerochan #$id",
                tags = emptyList(), rating = "q", w = 0, h = 0,
                grid = "https://static.zerochan.net/$id.full.$ext",
                sample = "https://static.zerochan.net/$id.full.$ext",
                orig = "https://www.zerochan.net" + scraped.path,
                score = 0, author = "", date = 0,
            )
        },
    )

    fun paheal(): SourceDef = SourceDef(
        id = "paheal", name = "Rule34.paheal", short = "paheal", engine = "shimmie2", off = true,
        bases = listOf("https://rule34.paheal.net/"),
        note = "Its GraphQL search endpoint was removed upstream — kept for reference.",
        lister = { a ->
            val q = "query SearchPosts(\$tags:[String!],\$offset:Int!,\$limit:Int){post(tags:\$tags,offset:\$offset,limit:\$limit){id hash ext url thumbnail_url width height tags}}"
            val body = buildJsonObject {
                put("query", q)
                put("variables", buildJsonObject {
                    put("tags", JsonArray(a.tags.split(Regex("\\s+")).filter { it.isNotBlank() }.map { JsonPrimitive(it) }))
                    put("offset", (a.page - 1) * a.limit)
                    put("limit", a.limit)
                })
            }.toString()
            ListRequest(url = "https://rule34.paheal.net/graphql", method = "POST", body = body)
        },
        parser = { j ->
            (j as? JsonOrText.J)?.element?.objOrNull?.obj("data")?.let { d -> d.arr("post") ?: d.arr("posts") }
                ?.mapNotNull { it.objOrNull?.let { o -> RawPost(json = o) } } ?: emptyList()
        },
        mapper = { raw ->
            val o = raw.json ?: return@SourceDef null
            val w = o.int("width"); val h = o.int("height")
            finishPin(
                meta = o, sid = o.str("id"),
                title = pbClip(pbTags(o.el("tags")).take(5).joinToString(", "), 60),
                tags = pbTags(o.el("tags")), rating = o.str("rating", "q"),
                w = w, h = h,
                grid = o.str("thumbnail_url").ifEmpty { o.str("url") },
                sample = o.str("url"), orig = o.str("url"),
                score = o.int("score"), author = "",
                date = pbDate(o.el("created_at")),
            )
        },
    )
}
