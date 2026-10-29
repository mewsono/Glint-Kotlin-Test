/* ============================================================================
   Pinboard · Booru sources
   ----------------------------------------------------------------------------
   A data-driven port of Boorusama's site registry
   (github.com/khoadng/Boorusama → packages/booru_clients/boorus.yaml).

   Every source exposes:
     list({tags,page,limit})  →  {url, method?, body?, headers?}
     parse(json)              →  raw post objects
     map(raw)                 →  normalised pin {key,src,sid,title,tags,rating,
                                    w,h,ar,grid,sample,orig,score,author,date}

   Transport rules (measured live, CORS behaviour is server-side so it is the
   same on every device):
     • hosts that send `access-control-allow-origin: *`  → direct fetch
     • every other host                                     → our own proxy
   A failed direct fetch always falls back to the proxy, so nothing is lost if
   a site changes its headers.

   For a future APK build (Capacitor) the native HTTP plugin is used when
   present — it has no CORS restrictions at all, so every source works.
   ========================================================================== */

const PB_SOURCES = {};
const PB_SRC_ORDER = [];
/* Per-source credentials:  {danbooru:{login,apiKey}, yandere:{login,passHash}, …}
   They live in localStorage, so the app still knows your accounts after a
   reload — the old store was session-only and lost everything on refresh. */
const PB_AUTH = {};
const PB_AUTH_KEY = "pb-auth";
const PB_KEYS = PB_AUTH;          // backwards-compatible alias

/* ---------------------------------------------------------------- transport */

const PB_PROXY_PATH = "./api/proxy";
const PB_PROXY_HOSTS = new Set([
  // donmai's Cloudflare challenges any *browser-like* request (403 + JS
  // challenge, no CORS header) — but it is happy with a plain API client,
  // which is exactly what our proxy is. So Danbooru goes through the proxy too.
  "danbooru.donmai.us", "safebooru.donmai.us", "donmai.moe",
  "yande.re", "konachan.net", "konachan.com", "www.sakugabooru.com",
  "gelbooru.com", "illusioncards.booru.org", "e621.net", "e926.net",
  "anime-pictures.net", "api.anime-pictures.net", "szurubooru.com",
  "booru.funmaker.moe", "e-shuushuu.net", "rule34.paheal.net",
  "sankakuapi.com", "chan.sankakucomplex.com", "sankaku.app",
  "nozomi.la", "n.nozomi.la", "j.gold-usergeneratedcontent.net",
  "qtn.gold-usergeneratedcontent.net", "www.zerochan.net", "realbooru.com",
  "ponybooru.org", "aibooru.online", "testbooru.donmai.us"
]);
// Verified to answer a cross-origin browser fetch with
// `access-control-allow-origin: *`.
const PB_DIRECT_HOSTS = new Set([
  "derpibooru.org", "e621.net", "e926.net", "api.anime-pictures.net"
]);

const PB_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

const pbProxyUrl = u => PB_PROXY_PATH + "?u=" + encodeURIComponent(u);

/* Image hosts that refuse requests carrying a Referer (Cloudflare answers
   403 + `cross-origin-resource-policy: same-origin`, so the browser blocks
   the image). Those images are fetched through our proxy, which sends no
   Referer. Measured: cdn.donmai.us only — every other CDN is happy. */
const PB_IMG_PROXY_HOSTS = new Set([
  "cdn.donmai.us",
  // e621/e926 answer with `Cross-Origin-Resource-Policy: same-origin`, so a plain
  // <img> from this origin is blocked by ORB: the tiles appeared, the pictures
  // never did. Through the proxy they load.
  "static1.e621.net", "static2.e621.net", "static.e621.net",
  "static1.e926.net", "static2.e926.net", "static.e926.net",
  // anime-pictures' preview CDN only serves AVIF and sends `cross-origin-resource-
  // policy: same-origin`, so the browser refuses it on this origin too.
  "opreviews.anime-pictures.net"
]);
function pbImg(u) {
  if (!u) return u;
  let host = "";
  try { host = new URL(u).host; } catch (e) { return u; }
  return PB_IMG_PROXY_HOSTS.has(host) ? pbProxyUrl(u) : u;
}

/* Native (Capacitor / APK) transport — no CORS, no proxy needed. */
function pbNative() {
  const C = window.Capacitor;
  const plug = C && C.Plugins && (C.Plugins.CapacitorHttp || (C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.CapacitorHttp));
  return plug || null;
}

async function pbNativeFetch(url, opts) {
  const plug = pbNative();
  if (!plug) return null;
  try {
    const res = await plug.request({
      url, method: opts.method || "GET",
      headers: Object.assign({ "User-Agent": PB_UA, "Accept": "application/json" }, opts.headers || {}),
      data: opts.body ? JSON.parse(opts.body) : undefined,
      connectTimeout: 15000, readTimeout: 20000
    });
    if (res.status >= 400) throw new Error("HTTP " + res.status);
    return { ok: true, status: res.status, text: res.data, url };
  } catch (e) { return null; }
}

// Account traffic is a same-origin POST envelope: credentials are never put
// in a browser/proxy URL, authenticated reads are not cached, and writes are
// never retried via another transport or an anonymous fallback.
const PB_SECRET_PARAMS=/^(?:login|api_key|user_api_key|password_hash|pass_hash|password|token|access_token|refresh_token|key|user_id)$/i;
function pbPublicRequestURL(url){try{const u=new URL(url);for(const key of [...u.searchParams.keys()])if(PB_SECRET_PARAMS.test(key))u.searchParams.delete(key);return u.toString()}catch(e){return url}}
function pbHasRequestSecrets(url,opts={}){
  if(opts.private||opts.mutation)return true;
  if(Object.keys(opts.headers||{}).some(k=>/^(authorization|cookie)$/i.test(k)))return true;
  try{return [...new URL(url).searchParams.keys()].some(k=>PB_SECRET_PARAMS.test(k))}catch(e){return false}
}
function pbBase64(value){
  const bytes=encodeURIComponent(value).replace(/%([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16))),abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let out="";
  for(let i=0;i<bytes.length;i+=3){const a=bytes.charCodeAt(i),b=bytes.charCodeAt(i+1),c=bytes.charCodeAt(i+2),n=(a<<16)|((b||0)<<8)|(c||0);out+=abc[n>>>18&63]+abc[n>>>12&63]+(i+1<bytes.length?abc[n>>>6&63]:"=")+(i+2<bytes.length?abc[n&63]:"=")}
  return out;
}
function pbRedactSecrets(value,extra=[]){
  let text=String(value||"");
  for(const secret of extra)if(typeof secret==="string"&&secret.length>=4){text=text.split(secret).join("[redacted]");text=text.split(encodeURIComponent(secret)).join("[redacted]")}
  for(const a of Object.values(PB_AUTH))if(a&&typeof a==="object"){
    const secrets=[a.apiKey,a.passHash,a.session,a.accessToken,a.refreshToken];if(a.login&&a.apiKey)secrets.push(pbBase64(a.login+":"+a.apiKey));
    for(const secret of secrets)if(typeof secret==="string"&&secret.length>=4){text=text.split(secret).join("[redacted]");text=text.split(encodeURIComponent(secret)).join("[redacted]")}
  }
  return text.replace(/((?:api_key|user_api_key|password_hash|pass_hash|access_token|refresh_token|password)\s*[=:]\s*)[^\s&;<>"']+/gi,"$1[redacted]").slice(0,1200);
}
/** One place that turns an HTTP status into advice the user can act on. */
function pbStatusMessage(status,url=""){
  let host="";try{const u=new URL(url,location.href);
    // `url` is often our own /api/proxy?u=… wrapper: read the real target out of it.
    host=u.pathname.endsWith("/api/proxy")&&u.searchParams.get("u")?new URL(u.searchParams.get("u")).hostname:u.hostname;
  }catch(e){}
  // Gelbooru stopped answering anonymous reads in 2026: without a free API key
  // every request is 401, which used to read like a broken password.
  if(host.endsWith("gelbooru.com")&&(status===401||status===403))
    return "Gelbooru now needs a free API key for reads. Add your user id and API key in Settings → Source accounts → Gelbooru, then reload.";
  if(status===401)return "The source rejected these credentials. Check this source's account settings.";
  if(status===403)return "The source denied access. Check account permissions, API-key scope or the site's security challenge — if this happens on every source, the site is blocking the network you are on.";
  if(status===429)return "The source is rate-limiting requests. Wait before trying again.";
  if(status===503)return "The source is temporarily unavailable. Try again later.";
  return "HTTP "+status;
}
function pbHTTPError(status,body,retryAfter,secrets=[],url=""){
  const err=new Error(pbStatusMessage(status,url));
  err.status=status;err.body=pbRedactSecrets(body,secrets);err.retryAfter=retryAfter||null;return err;
}
async function pbPrivateFetch(url,opts={}){
  const method=String(opts.method||"GET").toUpperCase(),headers=Object.assign({Accept:"application/json"},opts.headers||{});
  if(opts.body!=null&&!Object.keys(headers).some(k=>k.toLowerCase()==="content-type"))headers["Content-Type"]="application/json";
  const controller=new AbortController(),relay=()=>controller.abort(),timer=setTimeout(relay,25000);
  opts.signal?.addEventListener("abort",relay,{once:true});if(opts.signal?.aborted)relay();
  try{
  const response=await fetch(pbProxyUrl(pbPublicRequestURL(url)),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({pb_private:1,url,method,headers,body:opts.body??null,mutation:!!opts.mutation}),cache:"no-store",redirect:"error",signal:controller.signal});
  let text=await response.text(),status=response.status,retry=response.headers?.get?.("Retry-After");
  // New proxies envelope the upstream response so redirects cannot silently
  // become a 200 login page. Accept raw bodies from test/older deployments;
  // the API-specific validators below still require a genuine API response.
  try{const data=JSON.parse(text);if(data?.pb_private_response===1){status=data.status;text=String(data.body??"");retry=data.retry_after||retry}}catch(e){}
  if(status<200||status>=300)throw pbHTTPError(status,text,retry,opts.secrets,url);
  return {ok:true,status,text,url:pbPublicRequestURL(url)};
  }finally{clearTimeout(timer);opts.signal?.removeEventListener("abort",relay)}
}

async function pbRawFetch(url, opts) {
  opts = opts || {};
  const init = {
    method: opts.method || "GET",
    headers: Object.assign({ "Accept": "application/json" }, opts.headers || {}),
    cache: "no-store",
    redirect: "follow",
    signal: opts.signal
  };
  if (opts.body) { init.body = opts.body; if(!Object.keys(init.headers).some(k=>k.toLowerCase()==="content-type"))init.headers["Content-Type"] = "application/json"; }
  const res = await fetch(url, init);
  if (!res.ok) {
    /* keep the body: boorus answer 401 with a readable reason
       ("Invalid API key") that we want to show the user */
    let body = "";
    try { body = await res.text(); } catch (e) { }
    const err = new Error(pbStatusMessage(res.status, url));
    err.status = res.status; err.body = pbRedactSecrets(body);
    throw err;
  }
  return { ok: true, status: res.status, text: await res.text(), url };
}

/**
 * Fetch JSON/text. Order of preference:
 *   1. native plugin (APK)  2. direct fetch  3. our proxy
 */
async function pbFetch(url, opts) {
  opts = opts || {};
  if(pbHasRequestSecrets(url,opts))return pbPrivateFetch(url,opts);
  const native = await pbNativeFetch(url, opts);
  if (native) return native;

  let host = "";
  try { host = new URL(url, location.href).host; } catch (e) { }
  const mustProxy = opts.forceProxy || PB_PROXY_HOSTS.has(host) || !PB_DIRECT_HOSTS.has(host);

  if (!mustProxy) {
    try { return await pbRawFetch(url, opts); }
    catch (e) { if (opts.signal && opts.signal.aborted) throw e; /* otherwise try the proxy */ }
  }
  /* not reachable directly → through our proxy */
  return await pbRawFetch(pbProxyUrl(url), opts);
}

async function pbJSON(url, opts) {
  const res = await pbFetch(url, opts);
  const txt = (res.text || "").trim();
  if (!txt) return null;
  if (txt[0] === "{" || txt[0] === "[") {
    try { return JSON.parse(txt); } catch (e) { return null; }
  }
  return txt;                       // HTML (scraped sources) — caller handles it
}

async function pbText(url, opts) {
  const res = await pbFetch(url, opts);
  return res.text || "";
}

/* --------------------------------------------------------------- utilities */

const pbEnc = s => encodeURIComponent(s || "");
const pbClip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : (s || ""));
const pbTags = s => (typeof s === "string" ? s.split(/\s+/).filter(Boolean)
  : Array.isArray(s) ? s : []);
const pbRatio = (w, h) => (w && h ? Math.max(0.4, Math.min(2.6, h / w)) : 1.2);
const pbDate = v => {
  if (!v) return Date.now();
  if (typeof v === "number") return v > 1e11 ? v : v * 1000;
  const t = Date.parse(v);
  return isNaN(t) ? Date.now() : t;
};

/* Danbooru-style CDN resize: the path segment is the requested size. */
const pbDanThumb = (md5, size) =>
  md5 ? `https://cdn.donmai.us/${size}/${md5.slice(0, 2)}/${md5.slice(2, 4)}/${md5}.jpg` : "";

function pbRegister(s) { PB_SOURCES[s.id] = s; if (!s.off) PB_SRC_ORDER.push(s.id); }

function pbSource(id) { return PB_SOURCES[id] || PB_SOURCES[PB_SRC_ORDER[0]]; }

/* Moebooru tags carry no prefix: "shirona_(canvas+garden)" is an artist only
   if the site's tag list says so. Asking once per post made artist/character
   names arrive a second after the picture. The feed now asks for the tag map
   in the same request (include_tags), and every type we learn is remembered
   here so later posts — and later launches — classify instantly. */
const PB_TAG_TYPES=new Map(),PB_TAG_TYPES_KEY="pb-tag-types-v1",PB_TAG_TYPES_MAX=4000;
let PB_TAG_TYPES_TIMER=null;
function pbLoadTagTypes(){
  try{
    const raw=JSON.parse(localStorage.getItem(PB_TAG_TYPES_KEY)||"{}");
    for(const [tag,type] of Object.entries(raw))if(typeof tag==="string"&&typeof type==="string"&&PB_TAG_TYPES.size<PB_TAG_TYPES_MAX)PB_TAG_TYPES.set(tag,type);
  }catch(e){}
}
function pbSaveTagTypes(){
  if(PB_TAG_TYPES_TIMER)return;
  const write=()=>{
    PB_TAG_TYPES_TIMER=null;
    try{
      const entries=[...PB_TAG_TYPES].slice(-PB_TAG_TYPES_MAX);
      localStorage.setItem(PB_TAG_TYPES_KEY,JSON.stringify(Object.fromEntries(entries)));
    }catch(e){}
  };
  PB_TAG_TYPES_TIMER=typeof requestIdleCallback==="function"?requestIdleCallback(write,{timeout:2000}):setTimeout(write,800);
}
/** Merge a {tag: type} map from the site; returns the merged view. */
function pbMergeTagTypes(map){
  if(!map||typeof map!=="object")return null;
  let added=false;
  for(const [tag,type] of Object.entries(map)){
    if(typeof tag!=="string"||!tag)continue;
    let value=type;
    if(typeof type==="number")value=({0:"general",1:"artist",3:"copyright",4:"character"})[type]||"general";
    if(typeof value!=="string")continue;
    if(PB_TAG_TYPES.get(tag)!==value){PB_TAG_TYPES.set(tag,value);added=true}
  }
  if(added)pbSaveTagTypes();
  return Object.fromEntries(PB_TAG_TYPES);
}
/** Types for a set of tags, without a request when we already know them. */
function pbKnownTagTypes(tags){
  if(!tags||!tags.length)return null;
  const out={},miss=[];
  for(const tag of tags){const type=PB_TAG_TYPES.get(tag);if(type)out[tag]=type;else miss.push(tag)}
  return miss.length?null:out;
}
try{pbLoadTagTypes()}catch(e){}

/** Keep categorized names separate from general tags and uploader names. */
function pbPostMetadata(p, srcId) {
  const raw = p.meta || {}, grouped = raw.tags && !Array.isArray(raw.tags) && typeof raw.tags === "object" ? raw.tags : {};
  const names = value => (typeof value === "string" ? value.split(/\s+/) : Array.isArray(value) ? value : [])
    .map(v => typeof v === "string" ? v : v && (v.name_en || v.name || v.tag))
    .filter(v => typeof v === "string" && v.trim()).map(v => v.trim());
  const characters = [...names(p.characters), ...names(raw.tag_string_character), ...names(grouped.character || grouped.characters), ...names(raw.characters)];
  const series = [...names(p.series), ...names(raw.tag_string_copyright), ...names(grouped.copyright || grouped.series), ...names(raw.copyright)];
  const artists = [...names(p.artists), ...names(raw.tag_string_artist), ...names(grouped.artist || grouped.artists), ...names(raw.artists || raw.artist)];
  const groups = {character: characters, characters, copyright: series, series, artist: artists, artists, 1: artists, 3: series, 4: characters};
  const types = raw._tagTypes || pbKnownTagTypes(names(raw.tags)) || {};
  for (const tag of names(raw.tags)) if (groups[types[tag]]) groups[types[tag]].push(tag);
  for (const tag of Array.isArray(raw.tags) ? raw.tags : []) {
    if (tag && typeof tag === "object") {
      const type = tag.type !== undefined ? tag.type : tag.category;
      if (groups[type]) groups[type].push(...names([tag]));
    } else if (typeof tag === "string") {
      const match = tag.match(/^(artist|character|series|copyright):(.+)$/);
      if (match) groups[match[1]].push(match[2]);
    }
  }
  const clean = list => [...new Set(list)].filter(v => !/^(unknown_artist|artist_request|character_request|copyright_request)$/.test(v));
  const ready = !!p.detailsReady || ["tag_string_character", "tag_string_copyright", "tag_string_artist", "_tagTypes"].some(k => k in raw)
    || ["artist", "artists", "character", "characters", "copyright"].some(k => k in grouped);
  return {characters: clean(characters), series: clean(series), artists: clean(artists), detailsReady: ready};
}

/** Original-file information, kept separately from thumbnail/sample sizes. */
function pbPostFileInfo(p) {
  const raw=p.meta||{},file=raw.file&&typeof raw.file==="object"?raw.file:{};
  const sizes=[p.fileSize,raw.file_size,file.size,raw.file_size_bytes,raw.size_in_bytes,raw.fileSize,raw.contentSize,raw.size];
  const bytes=sizes.map(Number).find(n=>Number.isFinite(n)&&n>0);
  let ext=p.fileType||raw.file_ext||file.ext||raw.ext||raw.mime_type||raw.mimeType||file.mime||"";
  ext=String(ext).split(";")[0].replace(/^image\//i,"").replace(/^video\//i,"").replace(/^\./,"").toLowerCase();
  if(!ext){
    try{
      let url=new URL(p.orig||p.sample||p.grid||"","https://pinboard.local/");
      if(url.pathname.endsWith("/api/proxy")&&url.searchParams.get("u"))url=new URL(url.searchParams.get("u"));
      const match=url.pathname.match(/\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|jxl|webm|mp4)$/i);
      if(match)ext=match[1].toLowerCase();
    }catch(e){}
  }
  if(ext==="jpg"||ext==="pjpeg")ext="jpeg";
  if(ext==="svg+xml")ext="svg";
  return {fileSize:bytes||null,fileType:ext?ext.toUpperCase():"",fileInfoReady:!!p.fileInfoReady||!!p.meta};
}

/** Actual source upload time; never use pbDate's fabricated "now" fallback. */
function pbPostUploadInfo(p) {
  const raw = p.meta || {};
  const candidates = [p.uploadedAt,raw.created_at,raw.createdAt,raw.creationTime,raw.creation_time,raw.pubtime,raw.datetime,raw.uploaded_at,raw.uploadedAt];
  let uploadedAt = null;
  for (const value of candidates) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") continue;
    let stamp;
    if (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))) {
      const n = Number(value);stamp = n > 1e11 ? n : n * 1000;
    } else if (typeof value === "string") stamp = Date.parse(value);
    if (Number.isFinite(stamp) && stamp > 0 && Number.isFinite(new Date(stamp).getTime())) {uploadedAt = stamp;break}
  }
  return {uploadedAt,uploadInfoReady:!!p.uploadInfoReady || !!p.meta || uploadedAt !== null};
}

/** Origin links are from the post's source fields, never its uploader or tags. */
function pbPostSourceInfo(p) {
  const raw=p.meta||{},urls=[];
  const collect=value=>{
    if(Array.isArray(value)){value.forEach(collect);return}
    if(value&&typeof value==="object"){collect(value.url||value.source_url);return}
    if(typeof value!=="string")return;
    const text=value.trim().replace(/&amp;/g,"&");
    if(text.startsWith("//")){urls.push("https:"+text);return}
    for(const match of text.matchAll(/(?:^|\s)(https?:\/\/[^\s<>"']+)/gi))urls.push(match[1]);
  };
  [raw.source,raw.sources,raw.source_url,raw.source_urls,raw.sourceUrl,p.sourceLinks,p.sourceUrl,p.source_url,p.sources].forEach(collect);
  const links=[],seen=new Set();
  for(const value of urls){
    let url;try{url=new URL(value)}catch(e){continue}
    if(!["http:","https:"].includes(url.protocol)||url.username||url.password)continue;
    const host=url.hostname.toLowerCase(),is=domain=>host===domain||host.endsWith("."+domain);
    let platform="website",name=host.replace(/^www\./,"");
    if(is("pixiv.net")||is("pximg.net")){
      platform="pixiv";name="Pixiv";
      let id=(url.pathname.match(/\/artworks\/(\d+)(?:\/|$)/)||[])[1]||url.searchParams.get("illust_id");
      if(!id&&(is("pximg.net")||/^img\d*\.pixiv\.net$/.test(host)))id=(url.pathname.split("/").pop().match(/^(\d+)(?:_p\d+|_ugoira|_[ms]|\.)/)||[])[1];
      if(id&&/^\d+$/.test(id))url=new URL("https://www.pixiv.net/artworks/"+id);
    }else if(is("x.com")||is("twitter.com")||is("twimg.com")){platform="x";name="X"}
    else if(is("deviantart.com")||is("sta.sh")){platform="deviantart";name="DeviantArt"}
    else if(is("artstation.com")){platform="artstation";name="ArtStation"}
    else if(is("tumblr.com")){platform="tumblr";name="Tumblr"}
    else if(is("instagram.com")){platform="instagram";name="Instagram"}
    else if(is("patreon.com")){platform="patreon";name="Patreon"}
    const key=platform==="website"?host:platform;
    if(seen.has(key))continue;
    seen.add(key);links.push({platform,name,url:url.href});
  }
  return {sourceLinks:links,sourceInfoReady:!!p.sourceInfoReady||!!p.meta};
}

/** Fresh detail data also upgrades pins saved before categorized metadata existed. */
async function pbLoadPostDetails(srcId, sid) {
  const s = pbSource(srcId), a = PB_AUTH[srcId] || {}, id = encodeURIComponent(sid);
  const q = new URLSearchParams();
  let url = "";
  if (s.engine === "danbooru") {
    if (a.login && a.apiKey) { q.set("login", a.login); q.set("api_key", a.apiKey); }
    url = s.bases[0] + "posts/" + id + ".json?" + q;
  } else if (s.engine === "e621") {
    url = s.bases[0] + "posts/" + id + ".json";
  } else if (s.engine === "moebooru") {
    q.set("tags", "id:" + sid); q.set("limit", "1"); q.set("api_version", "2"); q.set("include_tags", "1");
    url = s.bases[0] + "post.json?" + q;
  } else return null;
  const j = await pbJSONFriendly(url, pbHasAuth(srcId)?pbAuthOptions(srcId):{});
  const raw = s.engine === "danbooru" ? j : s.engine === "e621" ? j && (j.post || j) : s.parse(j, s)[0];
  if (!raw || String(raw.id) !== String(sid)) return null;
  if (s.engine === "moebooru" && j && j.tags && !Array.isArray(j.tags)) raw._tagTypes = pbMergeTagTypes(j.tags) || j.tags;
  return s.map(raw, s);
}


/* ========================================================================
   SOURCES
   ===================================================================== */

/* --- Danbooru family (danbooru.donmai.us) ------------------------------- */
pbRegister({
  id: "danbooru", name: "Danbooru", short: "Danbooru", engine: "danbooru",
  bases: ["https://danbooru.donmai.us/", "https://safebooru.donmai.us/"],
  tagSep: " ", ratingTag: "rating:",
  auth: { u: "Username", k: "API key", likes: 1 },
  note: "Public API, works straight from the browser.",
  list({ tags, page, limit, base, auth }) {
    const p = new URLSearchParams();
    p.set("page", page || 1); p.set("limit", limit || 40);
    if (tags) p.set("tags", tags);
    const k = auth || {};
    if (k.login && k.apiKey) { p.set("login", k.login); p.set("api_key", k.apiKey); }
    return { url: base + "posts.json?" + p.toString() };
  },
  parse(j) { return Array.isArray(j) ? j : (j && j.posts) || []; },
  map(o) {
    const md5 = o.md5 || "";
    const w = o.image_width || o.width || 0, h = o.image_height || o.height || 0;
    // cdn.donmai.us resizes are aspect preserving: "360x360" fits the image
    // inside a 360x360 box (~20 KB) — far lighter than the 850 px sample.
    const thumb = md5 ? `https://cdn.donmai.us/360x360/${md5.slice(0, 2)}/${md5.slice(2, 4)}/${md5}.jpg` : "";
    return {
      sid: String(o.id), title: pbClip((o.tag_string || "").split(" ").slice(0, 5).join(", "), 60),
      tags: pbTags(o.tag_string), rating: o.rating || "s", w, h, ar: pbRatio(w, h),
      grid: pbImg(thumb || o.preview_file_url || o.large_file_url || o.file_url),
      sample: pbImg(o.large_file_url || o.file_url), orig: pbImg(o.file_url),
      score: o.score || 0, author: o.artist || "", date: pbDate(o.created_at),
      meta: o
    };
  }
});

/* --- Moebooru family: yande.re / konachan / sakugabooru ----------------- */
function pbMoebooru(def) {
  return Object.assign({
    id: "moebooru", name: "Moebooru", short: "Moebooru", engine: "moebooru",
    tagSep: " ", ratingTag: "rating:",
    auth: { u: "Username", k: "Password", pw: 1, likes: 1 },
    list({ tags, page, limit, base, auth }) {
      const p = new URLSearchParams();
      p.set("page", page || 1); p.set("limit", limit || 40);
      // Ask for the tag categories in the same call (+4 KB for 40 posts). With
      // them, artist / character / series are known the moment a post opens
      // instead of arriving a round-trip later.
      p.set("api_version", "2"); p.set("include_tags", "1");
      if (tags) p.set("tags", tags);
      const k = auth || {};
      if (k.login && k.passHash) { p.set("login", k.login); p.set("password_hash", k.passHash); }
      return { url: base + "post.json?" + p.toString() };
    },
    parse(j) {
      const posts = Array.isArray(j) ? j : (j && j.posts) || [];
      const tags = !Array.isArray(j) && j && j.tags && !Array.isArray(j.tags) ? j.tags : null;
      if (tags) { const types = pbMergeTagTypes(tags); if (types) for (const raw of posts) raw._tagTypes = types; }
      return posts;
    },
    map(o) {
      const w = o.width || 0, h = o.height || 0;
      return {
        sid: String(o.id), title: pbClip((o.tags || "").split(" ").slice(0, 5).join(", "), 60),
        tags: pbTags(o.tags), rating: o.rating || "s", w, h, ar: pbRatio(w, h),
        grid: pbImg(o.preview_url || o.sample_url || o.file_url),
        sample: pbImg(o.sample_url || o.file_url), orig: pbImg(o.file_url),
        score: o.score || 0, author: o.author || "", date: pbDate(o.created_at),
        meta: o
      };
    }
  }, def);
}
pbRegister(pbMoebooru({
  id: "yandere", name: "yande.re", short: "yande.re", bases: ["https://yande.re/"],
  note: "Reached through our proxy (the site sends no CORS headers)."
}));
pbRegister(pbMoebooru({
  id: "konachan", name: "Konachan", short: "Konachan", bases: ["https://konachan.net/"],
  note: "Reached through our proxy."
}));
pbRegister(pbMoebooru({
  id: "sakuga", name: "Sakugabooru", short: "Sakuga", bases: ["https://www.sakugabooru.com/"],
  note: "Animation booru — reached through our proxy."
}));

/* --- Gelbooru 0.2 (gelbooru.com) ---------------------------------------- */
pbRegister({
  id: "gelbooru", name: "Gelbooru", short: "Gelbooru", engine: "gelbooru",
  bases: ["https://gelbooru.com/"], tagSep: " ", ratingTag: "rating:",
  auth: { u: "User ID", k: "API key", likes: 0 },
  note: "Needs a user id + API key (free). Reached through our proxy.",
  list({ tags, page, limit, base, auth }) {
    const p = new URLSearchParams();
    p.set("page", "dapi"); p.set("s", "post"); p.set("q", "index"); p.set("json", "1");
    p.set("pid", page || 1); p.set("limit", limit || 40);
    if (tags) p.set("tags", tags);
    const k = auth || {};
    const uid = k.login || k.userId;
    if (uid && k.apiKey) { p.set("user_id", uid); p.set("api_key", k.apiKey); }
    return { url: base + "index.php?" + p.toString() };
  },
  parse(j) {
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.post)) return j.post;
    if (j && j.post && j.post[0]) return j.post;
    return [];
  },
  map(o) {
    const w = o.width || 0, h = o.height || 0;
    return {
      sid: String(o.id), title: pbClip(pbTags(o.tags).slice(0, 5).join(", "), 60),
      tags: pbTags(o.tags), rating: o.rating || "s", w, h, ar: pbRatio(w, h),
      grid: pbImg(o.preview_url || o.sample_url || o.file_url),
      sample: pbImg(o.sample_url || o.file_url), orig: pbImg(o.file_url),
      score: o.score || 0, author: o.author || "", date: pbDate(o.created_at),
      meta: o
    };
  }
});

/* --- e621 --------------------------------------------------------------- */
pbRegister({
  id: "e621", name: "e621", short: "e621", engine: "e621",
  bases: ["https://e621.net/"], tagSep: " ", ratingTag: "rating:",
  auth: { u: "Username", k: "API key", opt: 1, likes: 1 },
  note: "Furry booru — reached through our proxy.",
  list({ tags, page, limit, base, auth }) {
    const p = new URLSearchParams();
    p.set("page", page || 1); p.set("limit", limit || 40);
    if (tags) p.set("tags", tags);
    const k = auth || {};
    return { url: base + "posts.json?" + p.toString(), headers: k.login&&k.apiKey?{Authorization:"Basic "+pbBase64(k.login+":"+k.apiKey)}:{} };
  },
  parse(j) { return (j && j.posts) || []; },
  map(o) {
    const f = o.file || {}, sm = o.sample || {}, pv = o.preview || {};
    const w = f.width || 0, h = f.height || 0;
    const tg = [];
    if (o.tags && typeof o.tags === "object" && !Array.isArray(o.tags)) {
      Object.keys(o.tags).forEach(k => {
        (o.tags[k] || []).forEach(t => tg.push(typeof t === "string" ? t : (t.name || t)));
      });
    } else pbTags(o.tags).forEach(t => tg.push(t));
    return {
      sid: String(o.id), title: pbClip(tg.slice(0, 5).join(", "), 60),
      tags: tg, rating: o.rating || "s", w, h, ar: pbRatio(w, h),
      grid: pbImg(pv.url || sm.url || f.url), sample: pbImg(sm.url || f.url), orig: pbImg(f.url),
      score: o.score || 0, author: "", date: pbDate(o.created_at),
      meta: o
    };
  }
});

/* --- Philomena (derpibooru / ponybooru) -------------------------------- */
function pbPhilomena(def) {
  return Object.assign({
    id: "philomena", name: "Philomena", short: "Philomena", engine: "philomena",
    bases: ["https://derpibooru.org/"], tagSep: ",", ratingTag: "rating:",
    auth: { u: "Username", k: "API key", likes: 0 },
    note: "Pony-themed booru. Works straight from the browser.",
    /* its search needs a query, and it does not understand rating: filters */
    translateTags(t) {
      return t.split(/\s+/).filter(Boolean).map(x =>
        x === "rating:safe" ? "safe" :
        x === "rating:q" ? "questionable" :
        x === "rating:e" ? "explicit" : x).join(",");
    },
    list({ tags, page, limit, base, auth }) {
      const p = new URLSearchParams();
      p.set("page", page || 1); p.set("per_page", limit || 40);
      p.set("q", tags ? this.translateTags(tags) : "*");
      if(auth?.apiKey)p.set("key",auth.apiKey);
      return { url: base + "api/v1/json/search/images?" + p.toString() };
    },
    parse(j) { return (j && j.images) || []; },
    map(o) {
      const w = o.width || o.orig_size || 0, h = o.height || 0;
      const v = o.representations || o.variants || {};
      const pick = k => (typeof v[k] === "string" ? v[k] : (v[k] && v[k].url) || "");
      return {
        sid: String(o.id), title: pbClip(pbTags(o.tags).slice(0, 5).join(", "), 60),
        tags: pbTags(o.tags), rating: o.rating || "s", w, h, ar: pbRatio(w, h),
        grid: pick("small") || pick("thumb_small") || pick("medium") || o.preview_url || "",
        sample: pick("medium") || pick("large") || o.sample_url || "",
        orig: pick("full") || pick("large") || o.file_url || "",
        score: o.score || 0, author: o.uploader || "", date: pbDate(o.created_at),
        meta: o
      };
    }
  }, def);
}
pbRegister(pbPhilomena({
  id: "derpibooru", name: "Derpibooru", short: "Derpi", bases: ["https://derpibooru.org/"]
}));
pbRegister(pbPhilomena({
  id: "ponybooru", name: "Ponybooru", short: "Pony", bases: ["https://ponybooru.org/"],
  note: "Reached through our proxy."
}));

/* --- Szurubooru API (szurubooru.com, booru.funmaker.moe) --------------- */
function pbSzurubooru(def) {
  return Object.assign({
    id: "szurubooru", name: "Szurubooru", short: "Szurubooru", engine: "szurubooru",
    bases: ["https://szurubooru.com/"], tagSep: " ", ratingTag: "rating:",
    list({ tags, page, limit, base }) {
      const p = new URLSearchParams();
      p.set("page", page || 1); p.set("limit", limit || 40);
      if (tags) p.set("tags", tags);
      return { url: base + "api/posts.json?" + p.toString() };
    },
    parse(j) { return (j && j.posts) || []; },
    map(o) {
      const w = o.canvasWidth || (o.file && o.file.width) || 0;
      const h = o.canvasHeight || (o.file && o.file.height) || 0;
      return {
        sid: String(o.id), title: pbClip(pbTags(o.tags).slice(0, 5).join(", "), 60),
        tags: pbTags(o.tags), rating: o.safety || "s", w, h, ar: pbRatio(w, h),
        grid: (o.thumbnail && o.thumbnail.url) || (o.file && o.file.url),
        sample: (o.file && o.file.url), orig: (o.file && o.file.url),
        score: o.score || 0, author: (o.user && o.user.name) || "", date: pbDate(o.creationTime),
        meta: o
      };
    }
  }, def);
}
pbRegister(pbSzurubooru({
  id: "szurubooru", name: "Szurubooru", short: "Szurubooru", bases: ["https://szurubooru.com/"],
  off: true, note: "The public instance no longer resolves — kept for reference."
}));
pbRegister(pbSzurubooru({
  id: "hybooru", name: "booru.funmaker.moe", short: "Funmaker", bases: ["https://booru.funmaker.moe/"],
  off: true, note: "Its API only returns ids — no image URLs. Kept for reference."
}));

/* --- Anime Pictures (anime-pictures.net) ------------------------------- */
pbRegister({
  id: "animepictures", name: "Anime Pictures", short: "AnimePics", engine: "anime-pictures",
  bases: ["https://anime-pictures.net/"], tagSep: " ", ratingTag: "rating:",
  auth: { u: "Username", k: "", likes: 0 },
  note: "Reached through our proxy.",
  list({ tags, page, limit }) {
    const p = new URLSearchParams();
    p.set("page", (page || 1) - 1); p.set("posts_per_page", limit || 40);
    if (tags) p.set("search_tag", tags);
    return { url: "https://api.anime-pictures.net/api/v3/posts?" + p.toString() };
  },
  parse(j) { return (j && j.posts) || []; },
  map(o) {
    const w = o.width || 0, h = o.height || 0;
    const md5 = o.md5 || "";
    // The preview CDN always answers AVIF, whatever the upload's own extension
    // is: <md5:3>/<md5>_sp|_cp|_bp.avif. Asking for `.jpg` returns a 404, which
    // used to leave this source with tiles but no pictures.
    const dir = md5.slice(0, 3);
    const small = `https://opreviews.anime-pictures.net/${dir}/${md5}_sp.avif`;
    const big = `https://opreviews.anime-pictures.net/${dir}/${md5}_cp.avif`;
    const orig = `https://opreviews.anime-pictures.net/${dir}/${md5}_bp.avif`;
    const tg = [];
    ["general", "characters", "artists", "copyright"].forEach(k => {
      const v = o.tags && o.tags[k];
      if (Array.isArray(v)) v.forEach(t => tg.push(t.name || t));
    });
    return {
      sid: String(o.id), title: pbClip(tg.slice(0, 5).join(", "), 60) || "Anime Pictures #" + o.id,
      tags: tg, rating: o.erotics ? "q" : "s", w, h, ar: pbRatio(w, h),
      grid: pbImg(small), sample: pbImg(big), orig: pbImg(orig),
      score: o.score || 0, author: "", date: pbDate(o.pubtime || o.datetime),
      meta: o
    };
  }
});

/* --- e-shuushuu -------------------------------------------------------- */
pbRegister({
  id: "eshuushuu", name: "e-shuushuu", short: "e-shuushuu", engine: "eshuushuu",
  bases: ["https://e-shuushuu.net/"], tagSep: " ", ratingTag: "rating:",
  auth: { u: "Username", k: "", likes: 0 },
  note: "Reached through our proxy.",
  // e-shuushuu rebuilt its site in 2026: the old `/api/v1/images?limit=` call is
  // gone. The public JSON API still lists everything but silently ignores `tags`,
  // so tag searches read the server-rendered `/search?tags=` gallery instead.
  async list({ tags, page, limit, base, order }) {
    const p = new URLSearchParams();
    p.set("page", page || 1); p.set("per_page", Math.min(100, limit || 40));
    if (order === "popularity") { p.set("sort_by", "favorites"); p.set("sort_order", "DESC"); }
    else if (order === "oldest") p.set("sort_order", "ASC");
    // The documented API filters by tag *id*, so a search resolves each name
    // once. "blue hair" and "blue_hair" both mean the site's "blue hair".
    // e-shuushuu tag *names* contain spaces ("blue hair"), so the whole query is
    // tried as one tag before it is split into separate tags.
    const resolve = async name => {
      try {
        const found = await pbJSON(base + "api/v1/tags?" +
          new URLSearchParams({ search: name, per_page: "10" }).toString());
        const list = (found && found.tags) || [];
        const exact = list.find(t => String(t.title).toLowerCase() === name.toLowerCase());
        const alias = list.find(t => String(t.alias_of_name || "").toLowerCase() === name.toLowerCase());
        const hit = exact || alias;
        return hit ? (hit.alias_of || hit.tag_id) : 0;
      } catch (e) { return 0; }
    };
    const query = String(tags || "").trim().replace(/_/g, " ");
    if (query) {
      let ids = [];
      const whole = await resolve(query);
      if (whole) ids = [whole];
      else {
        const parts = query.split(/[\s,]+/).filter(Boolean);
        for (const part of parts) {
          const id = await resolve(part);
          if (!id) { ids = []; break; }
          ids.push(id);
        }
      }
      if (ids.length) {
        p.set("tags", ids.join(",")); p.set("tags_mode", "all");
        return { url: base + "api/v1/images?" + p.toString() };
      }
      // free text that is not a tag name: read the site's own gallery instead
      const q = new URLSearchParams();
      q.set("tags", query); q.set("page", page || 1);
      return { url: base + "search?" + q.toString(), html: true };
    }
    return { url: base + "api/v1/images?" + p.toString() };
  },
  parse(j) {
    if (typeof j === "string") {                     // /search gallery HTML
      const out = [], seen = new Set();
      const re = /data-image-id="(\d+)"[^>]*>\s*<img[^>]+src="([^"]+)"/g;
      let m;
      while ((m = re.exec(j))) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        out.push({ image_id: Number(m[1]), thumb: m[2].replace(/&amp;/g, "&") });
      }
      return out;
    }
    return (j && (j.images || (Array.isArray(j) ? j : null))) || [];
  },
  map(o) {
    const w = o.width || 0, h = o.height || 0;
    // The CDN answers <filename>.webp thumbs and <filename>.<orig ext> fullsize.
    // A tag-search record only carries the thumb, so its sample stays the thumb.
    const file = o.filename || "";
    const thumb = o.thumb || (file ? `https://cdn.e-shuushuu.net/thumbs/${file}.webp` : "");
    const full = file && o.ext ? `https://cdn.e-shuushuu.net/fullsize/${file}.${String(o.ext).replace(/^\./, "")}` : thumb;
    const tg = (o.tags || []).map(t => (t && (t.title || t.name)) || String(t)).filter(Boolean);
    const user = (o.user && (o.user.username || o.user.name)) || "";
    return {
      sid: String(o.image_id || o.id || ""), title: pbClip(tg.slice(0, 5).join(", "), 60),
      tags: tg, rating: "s", w, h, ar: pbRatio(w, h),
      grid: pbImg(thumb), sample: pbImg(full), orig: pbImg(full),
      score: o.favorites || o.score || 0, author: user, date: pbDate(o.date_added),
      meta: o
    };
  }
});

/* --- Sankaku ------------------------------------------------------------ */
pbRegister({
  id: "sankaku", name: "Sankaku", short: "Sankaku", engine: "sankaku", off: true,
  bases: ["https://chan.sankakucomplex.com/"], tagSep: " ", ratingTag: "rating:",
  needsAuth: "sankaku",
  note: "Reached through our proxy — needs a user key.",
  list({ tags, page, limit }) {
    const p = new URLSearchParams();
    p.set("page", page || 1); p.set("limit", limit || 40);
    if (tags) p.set("tags", tags);
    const k = PB_KEYS.sankaku;
    if (k && k.key) p.set("key", k.key);
    return {
      url: "https://sankakuapi.com/posts?" + p.toString(),
      headers: { "Accept": "application/json", "User-Agent": PB_UA }
    };
  },
  parse(j) { return (j && j.data) || (Array.isArray(j) ? j : []); },
  map(o) {
    const w = o.width || 0, h = o.height || 0;
    return {
      sid: String(o.id), title: pbClip(pbTags(o.tags).slice(0, 5).join(", "), 60),
      tags: pbTags(o.tags), rating: o.rating || "s", w, h, ar: pbRatio(w, h),
      grid: o.sample_url || o.preview_url || o.file_url,
      sample: o.sample_url || o.file_url, orig: o.file_url,
      score: o.score || 0, author: "", date: pbDate(o.created_at),
      meta: o
    };
  }
});

/* --- Nozomi.la (custom .nozomi index) ---------------------------------- */
pbRegister({
  id: "nozomi", name: "Nozomi.la", short: "Nozomi", engine: "nozomi", off: true,
  bases: ["https://nozomi.la/"], tagSep: " ", ratingTag: "rating:",
  note: "Its per-post API stopped resolving — kept for reference.",
  async list({ tags, page, limit }) {
    const idx = tags
      ? "https://j.gold-usergeneratedcontent.net/nozomi/" + pbEnc(tags.split(/\s+/)[0]) + ".nozomi"
      : "https://n.nozomi.la/index.nozomi";
    const buf = await pbText(idx, { forceProxy: true });
    let ids = [];
    if (buf && buf.length > 8) {
      const bytes = new Uint8Array(buf.length);
      for (let i = 0; i < buf.length; i++) bytes[i] = buf.charCodeAt(i) & 255;
      const dv = new DataView(bytes.buffer);
      for (let i = 0; i + 3 < bytes.length; i += 4) ids.push(dv.getUint32(i, true));
    }
    const off = ((page || 1) - 1) * (limit || 40);
    ids = ids.slice(off, off + (limit || 40));
    const posts = await Promise.all(ids.slice(0, 20).map(async id => {
      const v = String(id), last = v.slice(-1), prev2 = v.slice(-3, -1);
      const j = await pbJSON("https://j.gold-usergeneratedcontent.net/post/" + last + "/" + prev2 + "/" + v + ".json", { forceProxy: true });
      return j;
    }));
    return { inline: posts.filter(Boolean) };
  },
  parse(j) { return Array.isArray(j) ? j : (j && j.posts) || []; },
  map(o) {
    const w = o.width || 0, h = o.height || 0;
    const dataId = String(o.dataid || o.postid || "");
    const v = dataId, last = v.slice(-1), prev2 = v.slice(-3, -1);
    const ext = o.type || "jpg";
    const path = last + "/" + prev2 + "/" + v;
    const tg = [];
    ["general", "artist", "copyright", "character"].forEach(k => {
      const t = o[k];
      if (Array.isArray(t)) t.forEach(x => tg.push(typeof x === "string" ? x : (x && (x.tag || x.name)) || ""));
    });
    return {
      sid: String(o.postid || o.id), title: pbClip(tg.slice(0, 5).join(", "), 60),
      tags: tg.filter(Boolean), rating: "s", w, h, ar: pbRatio(w, h),
      grid: "https://qtn.gold-usergeneratedcontent.net/" + path + "." + ext + ".webp",
      sample: "https://j.gold-usergeneratedcontent.net/" + path + "." + ext,
      orig: "https://j.gold-usergeneratedcontent.net/" + path + "." + ext,
      score: 0, author: "", date: pbDate(o.date),
      meta: o
    };
  }
});

/* --- Zerochan (HTML scrape) -------------------------------------------- */
pbRegister({
  id: "zerochan", name: "Zerochan", short: "Zerochan", engine: "zerochan", off: true,
  bases: ["https://www.zerochan.net/"], tagSep: " ", ratingTag: "rating:",
  note: "No public API and the site is behind a bot wall — kept for reference.",
  async list({ tags, page, limit }) {
    const p = new URLSearchParams();
    p.set("e", "1"); p.set("s", "1"); p.set("p", page || 1);
    if (tags) p.set("q", tags);
    return { url: "https://www.zerochan.net/?" + p.toString(), html: true };
  },
  parse(j) {
    if (typeof j !== "string") return [];
    const out = [], re = /href="(\/(\d+)\/[^"]+)"/g;
    let m; const seen = new Set();
    while ((m = re.exec(j))) {
      if (seen.has(m[2])) continue; seen.add(m[2]);
      out.push({ id: m[2], path: m[1] });
    }
    return out;
  },
  map(o) {
    const id = o.id, path = o.path;
    return {
      sid: String(id), title: "Zerochan #" + id, tags: [], rating: "q", w: 0, h: 0, ar: 1.2,
      grid: "https://static.zerochan.net/" + id + ".full." + (id % 2 ? "jpg" : "png"),
      sample: "https://static.zerochan.net/" + id + ".full." + (id % 2 ? "jpg" : "png"),
      orig: "https://www.zerochan.net" + path, score: 0, author: "", date: Date.now(),
      meta: o
    };
  }
});

/* --- rule34.paheal.net (Shimmie2 GraphQL) ------------------------------ */
pbRegister({
  id: "paheal", name: "Rule34.paheal", short: "paheal", engine: "shimmie2", off: true,
  bases: ["https://rule34.paheal.net/"], tagSep: " ", ratingTag: "rating:",
  note: "Its GraphQL search endpoint was removed upstream — kept for reference.",
  list({ tags, page, limit }) {
    const q = `query SearchPosts($tags:[String!],$offset:Int!,$limit:Int){post(tags:$tags,offset:$offset,limit:$limit){id hash ext url thumbnail_url width height tags}}`;
    return {
      url: "https://rule34.paheal.net/graphql",
      method: "POST",
      body: JSON.stringify({
        query: q,
        variables: {
          tags: tags ? tags.split(/\s+/).filter(Boolean) : [],
          offset: ((page || 1) - 1) * (limit || 40), limit: limit || 40
        }
      })
    };
  },
  parse(j) { return (j && j.data && j.data.posts) || []; },
  map(o) {
    const w = o.width || 0, h = o.height || 0;
    return {
      sid: String(o.id), title: pbClip(pbTags(o.tags).slice(0, 5).join(", "), 60),
      tags: pbTags(o.tags), rating: o.rating || "q", w, h, ar: pbRatio(w, h),
      grid: o.thumbnail_url || o.url, sample: o.url, orig: o.url,
      score: o.score || 0, author: "", date: pbDate(o.created_at),
      meta: o
    };
  }
});


/* ========================================================================
   ACCOUNTS · FAVOURITES ("Likes") · CONNECTION TESTS
   ===================================================================== */

/** Does this source expose a favourites endpoint at all? */
/* Account capabilities reviewed against Boorusama 4.6.1, commit
   1716a68401249c78a6325f21308ebc59ca4e462c and the upstream API docs.
   A site's capabilities and THIS PRESET's capabilities are separate. */
const PB_SUPPORT = {};
const pbSupportEntry=(id,record)=>PB_SUPPORT[id]=Object.assign({siteLogin:"None",appLogin:false,readLikes:false,writeLikes:false,steps:[],limits:[],links:[],boorusama:"Browsing",engine:PB_SOURCES[id]?.engine||""},record);
pbSupportEntry("danbooru",{
  engine:"Danbooru",siteLogin:"Username + API key",appLogin:true,readLikes:true,writeLikes:true,boorusama:"API login and source favourites",
  steps:["Sign in on Danbooru in your browser. Open your profile, then API keys.","Create a key for this app and copy your username and API key below.","Allow profile/users, posts and counts read access, plus favourites index/create/destroy access. A read-only key cannot Like."],
  limits:["These are native Danbooru favourites: adding one may also add your upvote, and removing it removes your existing positive vote. This is the website’s own behaviour, not a separate local Like.","Account-level tag limits still apply. Basic accounts commonly allow two search tokens; non-default sorts can consume a token.","The site enforces write rate limits and API-key permissions. This app never retries a Like automatically. If the key has an IP allowlist, authorize the trusted proxy’s egress IP(s); a phone-only IP allowlist cannot authenticate proxy requests."],
  links:[{label:"Profile / API keys",url:"https://danbooru.donmai.us/profile"},{label:"API documentation",url:"https://danbooru.donmai.us/wiki_pages/help:api"}]
});
for(const id of ["yandere","konachan","sakuga"]){const s=PB_SOURCES[id];pbSupportEntry(id,{
  engine:"Moebooru",siteLogin:"Username + password (hashed locally)",appLogin:true,readLikes:true,writeLikes:true,boorusama:"Hashed-password login and source favourites",
  steps:["Create an account or sign in on "+s.name+" first.","Enter that site's username and password below. The correct site-specific SHA-1 hash is calculated on this device; the original password is not stored or sent.","Treat the stored hash like a password: it is sufficient to access your account."],
  limits:["Like is the site's 3-star vote. Unlike clears that vote (score 0). It does not create a local bookmark.",...(id==="sakuga"?["Sakugabooru has its own password salt. If you saved a login in an older build, re-enter your password once."]:[]),"API access, account permissions and rate limits are controlled by the site."],
  links:[{label:"Website / sign in",url:s.bases[0]+"user/login"},{label:"API documentation",url:s.bases[0]+"help/api"}]
})}
pbSupportEntry("e621",{
  engine:"e621ng",siteLogin:"Username + API key",appLogin:true,readLikes:true,writeLikes:true,boorusama:"API login and source favourites",
  steps:["Sign in on e621 and open My Account → Manage API Access.","Enable API access / generate a key, then enter your username and API key. Do not enter your website password.","Both values are required here for source Likes; a public username lookup is not proof of login."],
  limits:["Authentication uses HTTP Basic with the API key, not user_id/user_api_key query parameters.","Private/hidden favourites, account restrictions and API limits are determined by e621. Read and write failures are shown, not converted to local Likes."],
  links:[{label:"My account / API access",url:"https://e621.net/users/home"},{label:"API documentation",url:"https://e621.net/help/api"}]
});
pbSupportEntry("gelbooru",{
  engine:"Gelbooru 0.2.5",siteLogin:"User ID + API key; website session for Like",appLogin:true,readLikes:true,writeLikes:true,session:true,boorusama:"API reads; website-session favourites",
  steps:["Sign in on Gelbooru and open My Account → Options → API Access Credentials.","Copy the numeric user_id and api_key. These enable browsing and reading your Likes.","Optional, advanced: source Like/Unlike also requires the pass_hash WEBSITE cookie from that same signed-in account. The API key alone cannot favourite posts.","A PWA cannot import another website's browser cookies automatically. On a trusted computer, inspect Gelbooru's cookies in browser developer tools and paste only pass_hash in the optional field. Never paste it into chat or share it."],
  limits:["Session cookies can expire or be tied to IP/device checks. Writes originate from the proxy, so a browser-bound session may not be usable here even while the website remains signed in. If a CAPTCHA / access challenge blocks an action, open the original site; this app does not bypass it.","Without the optional website session, Likes can be viewed but the post heart is hidden.","Favourite ordering/totals are subject to the Gelbooru API. This app uses an explicit post-ID sort rather than claiming it has favourite-added timestamps."],
  links:[{label:"Account options / API credentials",url:"https://gelbooru.com/index.php?page=account&s=options"},{label:"Sign in on website",url:"https://gelbooru.com/index.php?page=account&s=login&code=00"}]
});
for(const id of ["derpibooru","ponybooru"]){const s=PB_SOURCES[id];pbSupportEntry(id,{
  engine:"Philomena",siteLogin:"Optional API key (no username required)",appLogin:true,boorusama:"Optional API-key browsing; no source-favourite writer in the reviewed client",
  steps:["Sign in on the original website and open Account settings to find your API key.","Paste the API key below. It can apply the site's account-specific API settings / filters; a username is not required."],
  limits:["Read-only integration: this PWA does not expose source Like/Unlike for Philomena. Use local Bookmarks or favourite on the original website.","A successful public search is only a read-access check, not proof of a logged-in identity. Website sessions and site-specific restrictions still apply."],links:[{label:"Website / account settings",url:s.bases[0]}]
})}
pbSupportEntry("animepictures",{
  engine:"Anime Pictures",siteLogin:"Website-session cookies",boorusama:"Cookie login and viewing starred posts",
  steps:["Boorusama's native browser can capture a website session. This PWA does not import that session.","Use the original website to sign in and star posts. Browsing and local Bookmarks remain separate here."],limits:["No source-login or source-Like writer is implemented in this PWA preset. Entering only a username would not authenticate you."],links:[{label:"Sign in on website",url:"https://anime-pictures.net/login?lang=en"}]
});
pbSupportEntry("eshuushuu",{
  engine:"e-shuushuu",siteLogin:"Username/password → expiring access and refresh tokens",boorusama:"Token login and source favourites",
  steps:["The reviewed Boorusama client signs in through the v1 auth API and renews access with a refresh token.","This PWA still uses its public browsing adapter; token login/refresh and source favourites are not implemented here. Sign in on the original website instead."],limits:["No fake username-only connection or local heart is offered. Local Bookmarks continue to work without login."],links:[{label:"Original website",url:"https://e-shuushuu.net/"}]
});
pbSupportEntry("szurubooru",{engine:"Szurubooru",siteLogin:"Username + access token (instance-dependent)",boorusama:"Token login and source favourites",steps:["On a working Szurubooru instance, create an access token in the account settings."],limits:["This built-in preset is disabled / unverified. Engine support in Boorusama does not mean this particular instance works here. No credentials or Like controls are enabled."],links:[{label:"Engine API documentation",url:"https://github.com/rr-/szurubooru/blob/master/doc/API.md"}]});
pbSupportEntry("hybooru",{engine:"Hybooru",siteLogin:"No account integration in this preset",boorusama:"Hybooru browsing adapter",limits:["This preset is disabled / unverified. Hybooru is not Szurubooru; source authentication and Like controls are not implemented here."]});
pbSupportEntry("sankaku",{engine:"Sankaku",siteLogin:"Username/password → access token",boorusama:"Token login and source favourites",steps:["Boorusama uses Sankaku's token login and authenticated favourite endpoints."],limits:["This PWA preset is disabled / unverified and does not implement that token flow. Website login alone cannot sign this app in. No source Like controls are enabled."],links:[{label:"Original website",url:"https://sankaku.app/"}]});
pbSupportEntry("paheal",{engine:"Shimmie2",siteLogin:"Website session / site-specific auth token",boorusama:"Shimmie2 login and source favourites",limits:["This PWA's old GraphQL adapter is disabled / unverified. No website-session import or source Like control is enabled."],links:[{label:"Original website",url:"https://rule34.paheal.net/"}]});
pbSupportEntry("zerochan",{engine:"Zerochan",siteLogin:"Website account; no API login in the reviewed adapter",boorusama:"Public browsing",limits:["This preset is disabled / unverified. Website favourites are not available through this app; do not treat an entered username as authentication."],links:[{label:"Original website",url:"https://www.zerochan.net/"}]});
pbSupportEntry("nozomi",{engine:"Nozomi.la",siteLogin:"No login in the reviewed public-index adapter",boorusama:"Public browsing",limits:["This PWA preset is disabled / unverified. No source-account or source-favourite API is configured here."],links:[{label:"Original website",url:"https://nozomi.la/"}]});
function pbSourceSupport(id){return PB_SUPPORT[id]||{engine:PB_SOURCES[id]?.engine||"Unknown",siteLogin:"Not configured",appLogin:false,readLikes:false,writeLikes:false,steps:[],limits:["No account integration is implemented for this source."],links:[]}}
// Correct misleading old account declarations. Unsupported website sessions
// are described in the installer, not presented as username-only logins.
PB_SOURCES.e621.auth={u:"Username",k:"API key",likes:1};
PB_SOURCES.gelbooru.auth={u:"User ID",k:"API key",likes:1,session:1};
for(const id of ["derpibooru","ponybooru"])PB_SOURCES[id].auth={u:"",k:"API key",likes:0,keyOnly:1};
for(const id of ["animepictures","eshuushuu"])delete PB_SOURCES[id].auth;

/* Source Likes are remote favourites, never S.likes / local Bookmarks. */
const PB_AUTH_VERSIONS={},PB_WRITE_LOCKS={},PB_LAST_WRITE={};
const pbAuthVersion=id=>PB_AUTH_VERSIONS[id]||0;
function pbCleanAuth(id,rec){
  if(!rec||typeof rec!=="object"||!Object.hasOwn(PB_SOURCES,id))return null;
  const out={};for(const k of ["login","apiKey","passHash","session"])if(typeof rec[k]==="string"&&rec[k].length<=4096)out[k]=rec[k].trim();
  if(Number.isSafeInteger(rec.verifiedAt))out.verifiedAt=rec.verifiedAt;
  if(rec.hashVersion===2)out.hashVersion=2;
  if(rec.needsReentry===true)out.needsReentry=true;
  return out;
}
function pbLikesOk(id){const s=PB_SOURCES[id];return !!(s&&!s.off&&pbSourceSupport(id).readLikes)}
// Configured is NOT a claim that the source has verified these credentials.
function pbHasAuth(id,record){
  const s=PB_SOURCES[id],a=record||PB_AUTH[id]||{};
  if(!s||s.off||!pbSourceSupport(id).appLogin||a.needsReentry)return false;
  if(s.auth?.keyOnly)return !!a.apiKey;
  if(s.engine==="gelbooru")return !!(/^[1-9]\d*$/.test(a.login||"")&&a.apiKey);
  if(id==="sakuga"&&a.hashVersion!==2)return false;
  return !!(a.login&&(s.engine==="moebooru"?/^[a-f0-9]{40}$/i.test(a.passHash||""):a.apiKey));
}
function pbGelSessionOk(value){return typeof value==="string"&&/^[A-Za-z0-9._~%+=\/-]{16,2048}$/.test(value)&&!/^(?:pass_hash|user_id|cookie)\s*[=:]/i.test(value)}
function pbCanLike(id){return !!(pbSourceSupport(id).writeLikes&&pbHasAuth(id)&&(id!=="gelbooru"||pbGelSessionOk(PB_AUTH[id]?.session)))}
function pbSetAuth(id,record){
  if(!Object.hasOwn(PB_SOURCES,id))return;
  const previous=PB_AUTH[id],rec=pbCleanAuth(id,record);if(rec)PB_AUTH[id]=rec;else delete PB_AUTH[id];
  if(!pbSaveAuth()){if(previous)PB_AUTH[id]=previous;else delete PB_AUTH[id];throw new Error("Could not store account details in this browser. Nothing was saved; the previous account is unchanged.")}
  PB_AUTH_VERSIONS[id]=pbAuthVersion(id)+1;
  // Remove the legacy session copy too, so removing an account cannot be
  // undone by a later reload / old-session migration.
  try{sessionStorage.removeItem("pb-keys")}catch(e){}
  if(window.dispatchEvent&&typeof CustomEvent!=="undefined")window.dispatchEvent(new CustomEvent("pb-authchange",{detail:{source:id,version:pbAuthVersion(id)}}));
}
function pbSaveAuth(){try{localStorage.setItem(PB_AUTH_KEY,JSON.stringify(PB_AUTH));return true}catch(e){return false}}
function pbLoadAuth(){
  try{
    const records=JSON.parse(localStorage.getItem(PB_AUTH_KEY)||"{}");
    if(records&&typeof records==="object")for(const id of Object.keys(records))if(Object.hasOwn(PB_SOURCES,id)){const a=pbCleanAuth(id,records[id]);if(a)PB_AUTH[id]=a}
    const old=JSON.parse(sessionStorage.getItem("pb-keys")||"{}");
    for(const id of Object.keys(PB_SOURCES)){if(!PB_AUTH[id]&&old[id]){const a=pbCleanAuth(id,{...old[id],login:old[id].login||(typeof old[id].userId==="number"?String(old[id].userId):old[id].userId)||""});if(a)PB_AUTH[id]=a}}
    // Never copy one unscoped Moebooru password hash to three different sites.
    const legacy=old.moebooru,id=legacy?.sourceId;
    if(legacy&&!["yandere","konachan","sakuga"].includes(id))localStorage.setItem("pb-unassigned-auth-v64",JSON.stringify({moebooru:legacy}));
    if(["yandere","konachan","sakuga"].includes(id)&&!PB_AUTH[id])PB_AUTH[id]=pbCleanAuth(id,legacy);
    // Older builds could already have fanned one unscoped hash out into
    // several per-site records. Different site salts cannot legitimately
    // produce the same password hash. Preserve ambiguous records, but never
    // send them until that source's password is explicitly re-entered.
    const groups={};for(const source of ["yandere","konachan","sakuga"]){const a=PB_AUTH[source];if(/^[a-f0-9]{40}$/i.test(a?.passHash||"")&&!a.needsReentry){const k=a.passHash.toLowerCase();(groups[k]||(groups[k]=[])).push(source)}}
    let blocked=false;for(const ids of Object.values(groups))if(ids.length>1)for(const source of ids){PB_AUTH[source].needsReentry=true;delete PB_AUTH[source].verifiedAt;blocked=true}
    if(Object.keys(old).length||blocked){pbSaveAuth();sessionStorage.removeItem("pb-keys")}
  }catch(e){}
}
// Other tabs must not keep using a removed or replaced account. Never rerun
// legacy-session migration from a storage event (it could resurrect an account).
window.addEventListener?.("storage",event=>{
  if(event.key!==PB_AUTH_KEY&&event.key!==null)return;
  let next={};try{next=event.newValue?JSON.parse(event.newValue):{}}catch(e){return}
  if(!next||typeof next!=="object"||Array.isArray(next))return;
  for(const id of Object.keys(PB_SOURCES)){
    const a=pbCleanAuth(id,next[id]);if(JSON.stringify(PB_AUTH[id]||null)===JSON.stringify(a))continue;
    if(a)PB_AUTH[id]=a;else delete PB_AUTH[id];PB_AUTH_VERSIONS[id]=pbAuthVersion(id)+1;
    try{sessionStorage.removeItem("pb-keys")}catch(e){}
    window.dispatchEvent?.(new CustomEvent("pb-authchange",{detail:{source:id,version:pbAuthVersion(id),external:true}}));
  }
});
function pbAuthOptions(id,a=PB_AUTH[id]||{}){
  const s=pbSource(id),headers={};
  if(["danbooru","e621"].includes(s.engine)&&a.login&&a.apiKey)headers.Authorization="Basic "+pbBase64(a.login+":"+a.apiKey);
  return {private:true,headers,secrets:[a.apiKey,a.passHash,a.session,a.login&&a.apiKey?pbBase64(a.login+":"+a.apiKey):""]};
}
function pbAccountURL(id,path,a=PB_AUTH[id]||{}){
  const s=pbSource(id),u=new URL(path,s.bases[0]);
  if(u.origin!==new URL(s.bases[0]).origin)throw new Error("Account requests cannot switch hosts.");
  if(s.engine==="moebooru"&&a.login&&a.passHash){u.searchParams.set("login",a.login);u.searchParams.set("password_hash",a.passHash)}
  if(s.engine==="gelbooru"&&u.searchParams.get("page")==="dapi"){u.searchParams.set("user_id",a.login||"");u.searchParams.set("api_key",a.apiKey||"")}
  if(s.engine==="philomena"&&a.apiKey)u.searchParams.set("key",a.apiKey);
  return u.toString();
}
async function pbJSONFriendly(url,opts){
  let j;try{j=await pbJSON(url,opts)}catch(e){
    let message="";try{const data=JSON.parse(e.body||"{}");message=data.message||data.reason||(typeof data.error==="string"?data.error:"")}catch(x){}
    const err=new Error(pbRedactSecrets(message||e.message||"Could not reach the source.",opts?.secrets));err.status=e.status;err.retryAfter=e.retryAfter;throw err;
  }
  if(j&&typeof j==="object"&&(j.success===false||j.error)){const err=new Error(pbRedactSecrets(j.message||j.reason||j.error||"The source rejected the request.",opts?.secrets));err.status=422;throw err}
  return j;
}
const pbAccountJSON=(id,path,opts={},a=PB_AUTH[id]||{})=>pbJSONFriendly(pbAccountURL(id,path,a),{...pbAuthOptions(id,a),...opts,headers:{...pbAuthOptions(id,a).headers,...opts.headers}});
function pbLikeBatch(raw,s,extra={}){
  if(!Array.isArray(raw))throw new Error("The source returned an invalid favourites list.");
  const slots=raw.map(r=>r&&s.map(r,s));return Object.assign(slots.filter(p=>p&&p.grid),{rawCount:raw.length,rawSlots:slots,hasMore:raw.length>=(extra.limit||40),...extra});
}
async function pbLoadFavoriteCount(id,opts={}){
  const s=pbSource(id),a=PB_AUTH[id]||{},name=(a.login||"").replace(/\s/g,"_");if(!pbHasAuth(id))return null;let value=null;
  if(s.engine==="danbooru"){const j=await pbAccountJSON(id,"counts/posts.json?"+new URLSearchParams({tags:"fav:"+name}),opts);value=j?.counts?.posts}
  else if(s.engine==="moebooru"){
    const text=await pbText(pbAccountURL(id,"post.xml?"+new URLSearchParams({tags:"vote:3:"+name,limit:"1"})),{...pbAuthOptions(id),...opts});value=text.match(/<posts\b[^>]*\bcount=["'](\d+)["']/i)?.[1];
  }else if(s.engine==="e621"){const j=await pbAccountJSON(id,"users/"+pbEnc(a.login)+".json",opts);value=j?.favorite_count}
  else if(s.engine==="gelbooru"){const j=await pbAccountJSON(id,"index.php?"+new URLSearchParams({page:"dapi",s:"post",q:"index",json:"1",tags:"fav:"+a.login,limit:"1",pid:"0"}),opts);value=j?.["@attributes"]?.count}
  const n=Number(value);return value!==null&&value!==undefined&&Number.isSafeInteger(n)&&n>=0?n:null;
}
async function pbLoadFavorites(id,opts={}){
  const s=pbSource(id),a=PB_AUTH[id]||{},page=Number(opts.page)||1,limit=Number(opts.limit)||40,name=(a.login||"").replace(/\s/g,"_");
  if(!pbLikesOk(id)||!pbHasAuth(id))throw new Error("Add the required "+s.name+" credentials first.");
  const oldest=opts.order==="oldest",transport={signal:opts.signal};
  if(oldest&&s.engine!=="danbooru"){
    const total=Number.isSafeInteger(opts.total)?opts.total:await pbLoadFavoriteCount(id,transport);
    if(total===null)throw new Error("The source's likes total is unavailable. Oldest-first cannot be calculated safely.");
    const end=total-(page-1)*limit,start=Math.max(0,end-limit);if(end<=0)return Object.assign([],{hasMore:false,rawCount:0});
    const first=Math.floor(start/limit)+1,last=Math.ceil(end/limit),chunks=[];
    for(let n=first;n<=last;n++)chunks.push(await pbLoadFavorites(id,{...opts,order:"newest",page:n,limit}));
    const slots=chunks.flatMap(c=>c.rawSlots||[...c]),selected=slots.slice(start-(first-1)*limit,end-(first-1)*limit).reverse();
    return Object.assign(selected.filter(p=>p&&p.grid),{rawCount:selected.length,rawSlots:selected,hasMore:start>0});
  }
  if(s.engine==="danbooru"&&oldest){
    const cursor=/^a\d+$/.test(opts.cursor||"")?opts.cursor:"a0",params=new URLSearchParams({"search[user_name]":a.login,page:cursor,limit:String(limit),only:"id,post_id,post"});
    const records=await pbAccountJSON(id,"favorites.json?"+params,transport);if(!Array.isArray(records))throw new Error("The source returned an invalid favourites list.");
    const ordered=[...records].sort((a,b)=>Number(a.id)-Number(b.id)),slots=ordered.map(r=>r.post&&s.map(r.post,s));
    return Object.assign(slots.filter(p=>p&&p.grid),{rawSlots:slots,rawCount:records.length,hasMore:records.length>=limit,nextCursor:ordered.length?"a"+ordered.at(-1).id:null});
  }
  if(s.engine==="danbooru"){
    const params=new URLSearchParams({tags:"ordfav:"+name,page:String(page),limit:String(limit)}),j=await pbAccountJSON(id,"posts.json?"+params,transport);
    return pbLikeBatch(s.parse(j,s),s,{limit});
  }
  if(s.engine==="moebooru"){
    // favorites=<name> is NOT the tag-search API filter and can be ignored
    // upstream. The documented vote:3 filter is the user's real favourites.
    const j=await pbAccountJSON(id,"post.json?"+new URLSearchParams({tags:"vote:3:"+name+" order:vote",page:String(page),limit:String(limit)}),transport);
    return pbLikeBatch(s.parse(j,s),s,{limit});
  }
  if(s.engine==="e621"){
    const j=await pbAccountJSON(id,"favorites.json?"+new URLSearchParams({page:String(page),limit:String(limit)}),transport);
    return pbLikeBatch(Array.isArray(j)?j:s.parse(j,s),s,{limit});
  }
  if(s.engine==="gelbooru"){
    const tags="fav:"+a.login+" sort:id:desc",j=await pbAccountJSON(id,"index.php?"+new URLSearchParams({page:"dapi",s:"post",q:"index",json:"1",tags,pid:String(page-1),limit:String(limit)}),transport);
    return pbLikeBatch(s.parse(j,s),s,{limit});
  }
  throw new Error("Source Likes are not implemented for "+s.name+" in this app.");
}
/** Search the complete account favourites on the source, not the local preview cache. */
async function pbSearchFavorites(id,opts={}){
 const s=pbSource(id),a=PB_AUTH[id]||{},name=String(a.login||"").replace(/\s/g,"_"),query=String(opts.query||"").trim(),page=Math.max(1,Number(opts.page)||1),limit=40;
 if(!pbLikesOk(id)||!pbHasAuth(id))throw new Error("Connect this source account first.");
 if(/(?:^|\s)[~-]?(?:ordfav|fav|favgroup|vote|order|sort):|[{}]|(?:^|\s)(?:or|and)(?:\s|$)/i.test(query))throw new Error("Use artwork tags here, without favourites, order or OR operators.");
 const scope=s.engine==="danbooru"?"fav:"+name:s.engine==="moebooru"?"vote:3:"+name:s.engine==="e621"?"fav:"+name:s.engine==="gelbooru"?"fav:"+a.login:null;
 if(!scope)throw new Error("This source does not support API search within likes.");
 // Danbooru counts metatags against basic-account search limits. Its default
 // post order is newest already: keep one artwork tag + one favourites scope.
 const tags=scope+" "+query+(s.engine==="gelbooru"?" sort:id:desc":s.engine==="danbooru"?"":" order:id_desc"),transport={signal:opts.signal};
 let path;
 if(s.engine==="gelbooru")path="index.php?"+new URLSearchParams({page:"dapi",s:"post",q:"index",json:"1",tags,pid:String(page-1),limit:String(limit)});
 else path=(s.engine==="moebooru"?"post.json?":"posts.json?")+new URLSearchParams({tags,page:String(page),limit:String(limit)});
 const j=await pbAccountJSON(id,path,transport),batch=pbLikeBatch(s.parse(j,s),s,{limit});
 let total=null;
 if(s.engine==="danbooru"&&page===1){try{const count=await pbAccountJSON(id,"counts/posts.json?"+new URLSearchParams({tags:scope+" "+query}),transport);const n=count?.counts?.posts;if(Number.isSafeInteger(n)&&n>=0)total=n}catch(e){if(opts.signal?.aborted)throw e}}
 if(s.engine==="gelbooru"){const n=Number(j?.["@attributes"]?.count);if(j?.["@attributes"]?.count!=null&&Number.isSafeInteger(n)&&n>=0)total=n}
 return {pins:batch,total,hasMore:batch.hasMore??batch.length>=limit};
}

async function pbTestAuth(id,record,opts={}){
  const s=pbSource(id),a=record||PB_AUTH[id]||{};if(!pbHasAuth(id,a))throw new Error("Fill in all required credentials for "+s.name+".");
  if(s.engine==="danbooru"||s.engine==="e621"){
    const j=await pbAccountJSON(id,s.engine==="danbooru"?"profile.json":"users/me.json",opts,a),name=j?.name||j?.login;
    if(!Number.isSafeInteger(Number(j?.id))||Number(j.id)<=0||!name||name.toLowerCase()!==a.login.replace(/\s/g,"_").toLowerCase())throw new Error("The source did not confirm this account. Check the username and API key.");
    return name;
  }
  if(s.engine==="moebooru"){
    const body=new URLSearchParams({login:a.login,password_hash:a.passHash}).toString(),j=await pbJSONFriendly(s.bases[0]+"user/authenticate.json",{private:true,method:"POST",body,headers:{"Content-Type":"application/x-www-form-urlencoded"},signal:opts.signal,secrets:[a.passHash]});
    if(j?.success!==true)throw new Error("The site did not confirm the password hash.");return a.login;
  }
  if(s.engine==="gelbooru"){
    if(!/^\d+$/.test(a.login))throw new Error("Gelbooru needs your numeric user ID, not your username.");
    const j=await pbAccountJSON(id,"index.php?page=dapi&s=post&q=index&json=1&limit=1&pid=0",opts,a);
    if(!j||typeof j!=="object"||!Array.isArray(j.post))throw new Error("Gelbooru did not return an authenticated API response.");
    return "API access checked for user ID "+a.login+". The separate website session is confirmed when a Like is used.";
  }
  if(s.engine==="philomena"){
    const j=await pbAccountJSON(id,"api/v1/json/search/images?q=*&per_page=1",opts,a);if(!Array.isArray(j?.images))throw new Error("The source did not return a search response.");
    return "Read access checked. This endpoint does not verify a logged-in identity; source Likes are not enabled.";
  }
  throw new Error("This preset does not implement source login.");
}
/** A confirmed Moebooru login, reused briefly. Scoped to the current account
    version, so editing or removing credentials always re-verifies. */
const PB_MOE_AUTH=new Map(),PB_MOE_AUTH_MS=5*60*1000;
async function pbEnsureMoeAuth(id,record,opts={}){
  const key=id+"|"+pbAuthVersion(id)+(record&&record.login?"|"+record.login:"");
  const seen=PB_MOE_AUTH.get(key);
  if(seen&&Date.now()-seen<PB_MOE_AUTH_MS)return true;
  await pbTestAuth(id,record,opts);
  return pbMoeAuthOk(id,record);
}
function pbMoeAuthOk(id,record){
  const key=id+"|"+pbAuthVersion(id)+(record&&record.login?"|"+record.login:"");
  if(PB_MOE_AUTH.size>40)PB_MOE_AUTH.clear();
  PB_MOE_AUTH.set(key,Date.now());return true;
}
async function pbFavoriteStatus(id,postId,opts={}){
  const s=pbSource(id),a=opts.auth||PB_AUTH[id]||{},sid=String(postId),name=(a.login||"").replace(/\s/g,"_");
  if(!/^\d+$/.test(sid)||!Number.isSafeInteger(Number(sid))||Number(sid)<=0||!pbHasAuth(id,a)||!pbLikesOk(id))throw new Error("This post has no available source-Like integration.");
  if(s.engine==="danbooru"){
    const j=await pbAccountJSON(id,"favorites.json?"+new URLSearchParams({"search[user_name]":a.login,"search[post_id]":sid,limit:"1"}),{signal:opts.signal},a);
    if(!Array.isArray(j)||j.some(r=>String(r.post_id??r.post?.id)!==sid))throw new Error("The source did not confirm an exact, account-scoped favourite lookup.");return j.length>0;
  }
  if(s.engine==="moebooru"){
    // GET current-vote silently falls back to the anonymous user's score 0
    // on some Moe versions. Verify the account first, never treat that
    // fallback as "not liked". Do NOT probe vote with a score-less POST:
    // older deployments could interpret a missing score as a destructive 0.
    // The login result is cached, so a status check is one request: asking the
    // site to authenticate for every heart made reads slow and rate-limited
    // enough that the honest answer was often "unknown".
    if(!opts.confirmedWrite)await pbEnsureMoeAuth(id,a,opts);
    const j=await pbAccountJSON(id,"post/vote.json?"+new URLSearchParams({id:sid}),{signal:opts.signal},a);
    if(!Number.isInteger(j?.vote))throw new Error("Could not determine the site's 3-star vote.");return j.vote===3;
  }
  const path=s.engine==="e621"?"posts.json?"+new URLSearchParams({tags:"fav:"+name+" id:"+sid,limit:"1"}):"index.php?"+new URLSearchParams({page:"dapi",s:"post",q:"index",json:"1",tags:"fav:"+a.login+" id:"+sid,limit:"1",pid:"0"});
  const j=await pbAccountJSON(id,path,{signal:opts.signal},a);if(!j||typeof j!=="object")throw new Error("Could not determine the source's liked state.");
  const rows=Array.isArray(j)?j:s.engine==="e621"?j.posts:(j.post??(Number(j["@attributes"]?.count)===0?[]:null));if(!Array.isArray(rows)||rows.some(r=>String(r.id)!==sid))throw new Error("The source did not confirm an exact, account-scoped favourite lookup.");return rows.length>0;
}
function pbWaitForWrite(ms,signal){
  return new Promise((resolve,reject)=>{
    let timer;const cancel=()=>{clearTimeout(timer);signal?.removeEventListener("abort",cancel);const e=new Error("Source action cancelled before it was sent.");e.name="AbortError";reject(e)};
    if(signal?.aborted)return cancel();
    timer=setTimeout(()=>{signal?.removeEventListener("abort",cancel);resolve()},ms);signal?.addEventListener("abort",cancel,{once:true});
  });
}
async function pbSetFavorite(id,postId,liked,opts={}){
  const s=pbSource(id),sid=String(postId),auth=PB_AUTH[id],version=pbAuthVersion(id);
  if(!pbCanLike(id)||!/^\d+$/.test(sid)||!Number.isSafeInteger(Number(sid))||Number(sid)<=0)throw new Error("This source needs complete account credentials before it can Like posts.");
  if(id==="gelbooru"&&!pbGelSessionOk(auth.session))throw new Error("Enter only the Gelbooru pass_hash cookie value, not a full cookie header.");
  const previous=PB_WRITE_LOCKS[id]||Promise.resolve(),job=previous.catch(()=>{}).then(async()=>{
    const wait=Math.max(0,(PB_LAST_WRITE[id]||0)+1100-Date.now());if(wait)await pbWaitForWrite(wait,opts.signal);
    if(opts.signal?.aborted||version!==pbAuthVersion(id)||PB_AUTH[id]!==auth)throw new Error("The account changed or the action was cancelled. No new request was sent.");
    PB_LAST_WRITE[id]=Date.now();let response;
    try{
      if(s.engine==="danbooru"||s.engine==="e621")response=await pbAccountJSON(id,liked?"favorites.json":"favorites/"+sid+".json",{method:liked?"POST":"DELETE",body:liked?JSON.stringify({post_id:Number(sid)}):undefined,mutation:true,signal:opts.signal},auth);
      else if(s.engine==="moebooru"){
        const body=new URLSearchParams({id:sid,score:liked?"3":"0",login:auth.login,password_hash:auth.passHash}).toString();
        response=await pbJSONFriendly(s.bases[0]+"post/vote.json",{private:true,method:"POST",body,headers:{"Content-Type":"application/x-www-form-urlencoded"},mutation:true,signal:opts.signal});
      }else if(s.engine==="gelbooru"){
        const path=liked?"public/addfav.php?id="+sid:"index.php?page=favorites&s=delete&id="+sid;
        response=await pbJSONFriendly(s.bases[0]+path,{private:true,method:"GET",headers:{Cookie:"user_id="+auth.login+"; pass_hash="+auth.session},mutation:true,signal:opts.signal});
        if(liked&&!['1','3'].includes(String(response)))throw new Error("Gelbooru did not accept the favourite. The website session may have expired or require a security check.");
      }
      if(typeof response==="string"&&s.engine!=="gelbooru")throw new Error("The source returned a web page instead of a confirmed API response.");
    }catch(e){
      if(e.status===429){const seconds=Number(e.retryAfter),date=Date.parse(e.retryAfter||"")-Date.now();PB_LAST_WRITE[id]=Date.now()+(Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)&&date>0?date:60000)}
      // Native duplicate responses and Gelbooru's normal removal redirect
      // must be verified by a fresh READ, never by repeating the write.
      if(!(e.status===423||(id==="gelbooru"&&!liked&&[301,302,303].includes(e.status))))throw e;
    }
    if(version!==pbAuthVersion(id)||PB_AUTH[id]!==auth)throw new Error("The account changed while the source action was in progress.");
    if(s.engine==="moebooru")pbMoeAuthOk(id,auth);
    const actual=await pbFavoriteStatus(id,sid,{auth,signal:opts.signal,confirmedWrite:true});
    if(actual!==!!liked)throw new Error("The source did not confirm the requested Like state. Nothing was changed locally.");
    return actual;
  });
  PB_WRITE_LOCKS[id]=job;return job;
}

/* ========================================================================
   PUBLIC API
   ===================================================================== */

/** Server-side chronological ordering, never a reversal of one loaded page. */
function pbPostSortSupported(srcId) {
  return ["danbooru", "moebooru", "e621", "gelbooru", "philomena", "eshuushuu"].includes(pbSource(srcId).engine);
}
/** Global source ranking, not a score-sort of one already-loaded page. */
function pbPostPopularitySupported(srcId) {
  const source=pbSource(srcId);
  return !source.off&&["danbooru", "moebooru", "e621", "gelbooru", "philomena", "eshuushuu"].includes(source.engine);
}
/** Matching-post total. Unsupported/failed counts remain unknown, not zero. */
async function pbLoadPostCount(srcId, opts) {
  const source = pbSource(srcId), base = source.bases[0], a = pbHasAuth(srcId)?PB_AUTH[srcId]:{}, tags = (opts && opts.tags) || "";
  let count = null;
  if (source.engine === "danbooru") {
    const params = new URLSearchParams({tags});
    if (a.login && a.apiKey) {params.set("login", a.login);params.set("api_key", a.apiKey)}
    const j = await pbJSONFriendly(base + "counts/posts.json?" + params, {signal:opts?.signal});
    count = j && j.counts && j.counts.posts;
  } else if (source.engine === "moebooru") {
    const params = new URLSearchParams({tags,limit:"1"});
    if (a.login && a.passHash) {params.set("login", a.login);params.set("password_hash", a.passHash)}
    const xml = await pbText(base + "post.xml?" + params, {signal:opts?.signal}), match = xml.match(/<posts\b[^>]*\bcount=["'](\d+)["']/i);
    count = match ? match[1] : null;
  } else if (source.engine === "gelbooru") {
    const req=await source.list({tags,page:1,limit:1,base,auth:a}),j=await pbJSONFriendly(req.url,{signal:opts?.signal});
    count=j&&j["@attributes"]&&j["@attributes"].count;
  } else if (source.engine === "philomena") {
    const req = await source.list({tags,page:1,limit:1,base,auth:a}), j = await pbJSONFriendly(req.url, {signal:opts?.signal});
    count = j && j.total;
  }
  const n = Number(count);
  return count !== null && count !== undefined && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/* ------------------------------------------------------- per-source explore
   Each site's own explore views (the ones Boorusama exposes):
     • Danbooru    – Popular (day/week/month, by date), Hot (order:rank),
                     Most viewed (by date), Popular searches
     • Moebooru    – Popular recent/day/week/month (yande.re, Konachan, Sakuga)
     • e621 / e926 – Popular (day/week/month)
     • Philomena / Gelbooru – no native explore page; only their global
                     top-score listing, which is labelled as such.
   Everything here is read-only public data. */
const PB_EX_SCALES = ["day", "week", "month"];
const PB_MOE_SCALES = ["recent", "day", "week", "month"];
const PB_EX_SCALE_LABEL = { day: "Day", week: "Week", month: "Month", recent: "Recent" };
function pbExploreDayStamp(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function pbExploreSections(srcId) {
  const s = pbSource(srcId);
  if (!s || s.off || s.custom) return [];   // never invent a view for a source we know nothing about
  if (s.engine === "danbooru") return [
    { key: "popular", title: "Popular", scales: PB_EX_SCALES, def: "day", paged: true },
    { key: "hot", title: "Hot", scales: [], def: "", paged: true },
    { key: "viewed", title: "Most viewed", scales: [], def: "", paged: false }
  ];
  if (s.engine === "moebooru") return [{ key: "popular", title: "Popular", scales: PB_MOE_SCALES, def: "recent", paged: false }];
  if (s.engine === "e621") return [{ key: "popular", title: "Popular", scales: PB_EX_SCALES, def: "day", paged: false }];
  if (s.engine === "philomena" || s.engine === "gelbooru") return [{
    key: "score", title: "Top scored", scales: [], def: "", paged: true,
    note: "This source has no explore page of its own — this is its global top-score order."
  }];
  return [];
}
/** One explore view for a source. Same result shape as pbLoadPosts. */
async function pbLoadExplore(srcId, opts = {}) {
  const s = pbSource(srcId), kind = opts.kind || "popular", scale = opts.scale || "day",
    page = Math.max(1, opts.page || 1), limit = opts.limit || 24, base = opts.base || s.bases[0];
  const sameHost = new URL(base).origin === new URL(s.bases[0]).origin;
  const a = sameHost && pbHasAuth(srcId) ? PB_AUTH[srcId] : {};
  if (kind === "score") {
    // These sites page the global score order by page number; keep going while
    // a page still returns posts (Explore stops as soon as one is empty).
    const ps = await pbLoadPosts(srcId, { page, limit, order: "popularity", signal: opts.signal, tags: opts.tags || "" });
    return Object.assign(ps, { hasMore: (ps.rawCount ?? ps.length) > 0 });
  }
  const stamp = opts.date || pbExploreDayStamp(), now = new Date(), today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let url;
  const dan = new URLSearchParams({ date: stamp });
  if (a.login && a.apiKey) { dan.set("login", a.login); dan.set("api_key", a.apiKey); }
  if (kind === "popular" && s.engine === "danbooru") { dan.set("scale", scale); dan.set("page", page); dan.set("limit", limit); url = base + "explore/posts/popular.json?" + dan; }
  else if (kind === "hot" && s.engine === "danbooru") { const p = new URLSearchParams({ tags: "order:rank", page, limit }); if (a.login && a.apiKey) { p.set("login", a.login); p.set("api_key", a.apiKey); } url = base + "posts.json?" + p; }
  else if (kind === "viewed" && s.engine === "danbooru") url = base + "explore/posts/viewed.json?" + dan;
  else if (kind === "searches" && s.engine === "danbooru") url = base + "explore/posts/searches.json?" + dan;
  else if (kind === "popular" && s.engine === "moebooru") {
    const p = new URLSearchParams();
    if (a.login && a.passHash) { p.set("login", a.login); p.set("password_hash", a.passHash); }
    const d = now;
    if (scale === "recent") { p.set("period", "1d"); url = base + "post/popular_recent.json?" + p; }
    else if (scale === "day") { p.set("day", d.getDate()); p.set("month", d.getMonth() + 1); p.set("year", d.getFullYear()); url = base + "post/popular_by_day.json?" + p; }
    else if (scale === "week") { p.set("day", d.getDate()); p.set("month", d.getMonth() + 1); p.set("year", d.getFullYear()); url = base + "post/popular_by_week.json?" + p; }
    else { p.set("month", d.getMonth() + 1); p.set("year", d.getFullYear()); url = base + "post/popular_by_month.json?" + p; }
  }
  else if (kind === "popular" && s.engine === "e621") {
    const p = new URLSearchParams({ date: stamp, scale: ["day", "week", "month"].includes(scale) ? scale : "day" });
    if (a.login && a.apiKey) { p.set("login", a.login); p.set("api_key", a.apiKey); }
    url = base + "popular.json?" + p;
  }
  else throw new Error("This source has no explore view.");
  const j = await pbJSONFriendly(url, { signal: opts.signal, secrets: [a.apiKey, a.passHash].filter(Boolean) });
  if (kind === "searches") {
    const rows = Array.isArray(j) ? j : [];
    return rows.map(row => Array.isArray(row) ? { name: String(row[0] || ""), count: Number(row[1]) || 0 } : { name: String(row?.name || row?.tag || ""), count: Number(row?.count) || 0 })
      .filter(t => t.name).slice(0, 24);
  }
  if (j === null) throw new Error("Empty response from " + s.name);
  const raw = s.parse(j, s) || [];
  const pins = raw.map(r => { try { return s.map(r, s); } catch (e) { return null; } }).filter(p => p && p.grid);
  const paged = kind === "popular" || kind === "hot";
  return Object.assign(pins, {
    rawCount: raw.length,
    batchKey: pins.map(p => String(p.sid)).join(","),
    nextCursor: null,
    // Only Danbooru's popular/hot endpoints page; everything else is a
    // fixed top-N list, so it must never show a Load more that cannot advance.
    hasMore: paged && s.engine === "danbooru" && raw.length >= limit,
    endConfirmed: !(paged && s.engine === "danbooru" && raw.length >= limit)
  });
}
window.pbExploreSections = pbExploreSections;
window.pbLoadExplore = pbLoadExplore;
window.PB_EX_SCALE_LABEL = PB_EX_SCALE_LABEL;

/** Load a page of posts from a source. */
async function pbLoadPosts(srcId, opts) {
  // Home, Search, Explore and related previews all default to latest uploads.
  // An explicit Oldest selection is the only way to request ascending order.
  // Interactive tag search may carry the source's own order:/sort: operator.
  // Do not erase it, re-sort its results by ID, or paginate it with an ID cursor.
  const nativeOrder=opts && opts.preserveQueryOrder && /(?:^|\s)(?:order|sort):\S+/i.test(opts.tags||"");
  opts = {...(opts || {}),order:nativeOrder ? null : opts && opts.order === "popularity" ? "popularity" : opts && opts.order === "oldest" ? "oldest" : "newest"};
  const s = pbSource(srcId);
  const sameHost=b=>new URL(b).origin===new URL(s.bases[0]).origin;
  const authAt=b=>sameHost(b)&&pbHasAuth(srcId)?PB_AUTH[srcId]:{};
  const auth = authAt(opts.base || s.bases[0]);
  // Danbooru's a<ID> cursor selects the next oldest batch but serializes it
  // descending even with order:id_asc. Normalize each server-selected batch;
  // never reverse a newest-first page to pretend it is the oldest page.
  const chronological=opts.order==="newest"||opts.order==="oldest";
  const ordered = pins => chronological && pbPostSortSupported(srcId)
    ? pins.sort((a,b) => opts.order === "oldest" ? Number(a.sid)-Number(b.sid) : Number(b.sid)-Number(a.sid))
    : pins;
  // Keep the server batch's pagination independently of displayable images.
  // A page of 40 records can contain only 36 usable previews; it is still a
  // full page. Cursor boundaries must include unavailable records as well.
  const batch = (raw, response) => {
    const all = raw.filter(Boolean).map(r => s.map(r, s)).filter(Boolean);
    const ids = all.map(p => String(p.sid));
    const numeric = ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
    const declared = response && !Array.isArray(response) && typeof response.has_more === "boolean" ? response.has_more : null;
    const nextCursor = chronological && ["danbooru", "e621"].includes(s.engine) && numeric.length
      ? (opts.order === "oldest" ? "a" + Math.max(...numeric) : "b" + Math.min(...numeric)) : null;
    return Object.assign(ordered(all.filter(p => p.grid)), {
      rawCount:raw.length, batchKey:ids.join(","), nextCursor,
      hasMore:declared === null ? raw.length >= (opts.limit || 40) : declared,
      endConfirmed:!raw.length || declared === false
    });
  };
  const run = async (a, baseOverride) => {
    const base = baseOverride || opts.base || s.bases[0];
    let tags = opts.tags || "";
    if (opts.order && ["danbooru", "moebooru", "e621", "gelbooru"].includes(s.engine)) {
      tags = tags.split(/\s+/).filter(tag => !/^(order|sort):/i.test(tag)).join(" ");
      // These sites already return newest uploads by default. A redundant
      // order:id_desc / sort:id:desc consumes a search token on Danbooru and
      // breaks valid two-tag queries. Only non-default sorts need a token.
      const order = opts.order === "popularity"
        ? (s.engine === "gelbooru" ? "sort:score:desc" : "order:score")
        : opts.order === "oldest"
          ? (s.engine === "gelbooru" ? "sort:id:asc" : "order:" + (s.engine === "moebooru" ? "id" : "id_asc"))
          : "";
      tags = [tags, order].filter(Boolean).join(" ");
    }
    if (opts.order === "popularity" && !pbPostPopularitySupported(srcId)) throw new Error("This source does not support popularity sorting.");
    if (opts.order === "oldest" && !pbPostSortSupported(srcId)) throw new Error("This source does not support chronological sorting.");
    const req = await s.list({
      tags, page: opts.page || 1, limit: opts.limit || 40, base, auth: a, order: opts.order
    });
    if (opts.order && s.engine === "philomena") {
      const url = new URL(req.url);url.searchParams.set("sf", opts.order === "popularity" ? "score" : "id");url.searchParams.set("sd", opts.order === "oldest" ? "asc" : "desc");req.url = url.toString();
    }
    if (req.inline) {
      return batch(req.inline, req);
    }
    const j = await pbJSON(req.url, {
      method: req.method, body: req.body, headers: req.headers,
      forceProxy: req.html, signal: opts.signal
    });
    if (j === null) throw new Error("Empty response from " + s.name);
    return batch(s.parse(j, s), j);
  };
  try { return await run(auth); }
  catch (e) {
    if (opts.signal && opts.signal.aborted) throw e;
    /* a stale or wrong key must never kill the feed — ask again without it */
    if (auth && (auth.login || auth.apiKey || auth.passHash)) {
      try { return await run({}); } catch (retry) { e = retry; }
    }
    /* Some networks are challenged by one mirror while its sibling answers
       normally (Danbooru ↔ Safebooru are the same API). Fall over once, and say
       so, instead of showing an empty board. */
    const primary = opts.base || s.bases[0];
    const alternate = s.bases.find(b => b !== primary);
    if (alternate && [403, 502, 503].includes(e.status)) {
      try {
        const page = await run(authAt(alternate), alternate);
        if (typeof toast === "function") {
          toast(s.name + " blocked this network · showing " + new URL(alternate).host + " instead");
        }
        return page;
      } catch (fallback) { throw e; }
    }
    throw e;
  }
}

/** Real source tag names. Other engines retain manual tag queries and cached suggestions. */
async function pbAutocomplete(srcId, q, opts={}) {
  const s=pbSource(srcId),term=String(q||"").trim().toLowerCase();
  if(term.length<2||/[\s:*?"'<>]/.test(term)||s.off)return [];
  let url;
  if(s.autocomplete)url=s.autocomplete(term);
  else if(["danbooru","e621"].includes(s.engine)){
    const params=new URLSearchParams({"search[name_matches]":term+"*","search[order]":"count",limit:"12"});url=s.bases[0]+"tags.json?"+params;
  }else if(s.engine==="moebooru"){
    const params=new URLSearchParams({name:term+"*",order:"count",limit:"12"});url=s.bases[0]+"tag.json?"+params;
  }else return [];
  try{
    const j=await pbJSON(url,{signal:opts.signal}),rows=s.parseTags?s.parseTags(j):Array.isArray(j)?j:j?.tags||[];
    const seen=new Set();
    return rows.filter(tag=>!tag?.is_deprecated).map(tag=>{
      const name=typeof tag==="string"?tag:tag?.name||tag?.value||"",raw=tag?.post_count??tag?.count,count=raw!==undefined&&raw!==null&&raw!==""&&Number.isFinite(Number(raw))&&Number(raw)>=0?Number(raw):null;
      return {name,count,category:tag?.category??tag?.type??null};
    }).filter(tag=>tag.name&&!seen.has(tag.name)&&seen.add(tag.name)).slice(0,12);
  }catch(e){if(opts.signal?.aborted)throw e;return []}
}

/* --- SHA-1 for the moebooru password hash ------------------------------ */
async function pbSha1(str) {
  if(typeof crypto==="undefined"||!crypto.subtle)throw new Error("Password hashing requires a secure browser context. Use trusted HTTPS hosting or localhost for local development.");
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const PB_MOEBORU_SALT = "choujin-steiner--{0}--";
const PB_KONACHAN_SALT = "So-I-Heard-You-Like-Mupkids-?--{0}--";
const PB_SAKUGA_SALT = "er@!$rjiajd0$!dkaopc350!Y%)--{0}--";

async function pbMoebooruHash(password, host) {
  const salt = host?.includes("sakugabooru") ? PB_SAKUGA_SALT : host?.includes("konachan") ? PB_KONACHAN_SALT : PB_MOEBORU_SALT;
  return pbSha1(salt.replace("{0}", password));
}

pbLoadAuth();
window.PB_SOURCES = PB_SOURCES;
window.PB_SRC_ORDER = PB_SRC_ORDER;
window.pbLoadPosts = pbLoadPosts;
window.pbLoadPostCount = pbLoadPostCount;
window.pbPostSortSupported = pbPostSortSupported;
window.pbPostPopularitySupported = pbPostPopularitySupported;
window.pbPostMetadata = pbPostMetadata;
window.pbPostFileInfo = pbPostFileInfo;
window.pbPostUploadInfo = pbPostUploadInfo;
window.pbPostSourceInfo = pbPostSourceInfo;
/* ========================================================================
   CUSTOM SOURCES — a booru the user adds themselves.
   Only the transport differs from a preset: the same engine adapter lists,
   parses and maps the posts, so a Danbooru-family or Moebooru-family booru
   behaves exactly like its built-in sibling. Nothing is invented: an unknown
   address is never given an explore page, an order or a Like button.
   ===================================================================== */
const PB_CUSTOM_KEY = "pb-custom-sources-v1";
const PB_CUSTOM_ENGINES = ["danbooru", "moebooru", "e621", "gelbooru", "philomena"];

function pbEngineTemplate(engine) {
  for (const id of PB_SRC_ORDER) {
    const s = PB_SOURCES[id];
    if (s && !s.custom && !s.off && s.engine === engine && s.bases && s.bases.length) return s;
  }
  return null;
}

function pbNormalizeBase(value) {
  let raw = String(value || "").trim();
  if (!raw) throw new Error("Enter the booru's address, for example https://example.booru.org/");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let u;
  try { u = new URL(raw); } catch (e) { throw new Error("That does not look like a web address."); }
  if (u.username || u.password) throw new Error("Do not put a login in the address.");
  u.search = ""; u.hash = "";
  const path = u.pathname.replace(/\/+$/, "");
  return u.origin + path + "/";
}

function pbCustomRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(PB_CUSTOM_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function pbWriteCustomRecords(records) {
  try { localStorage.setItem(PB_CUSTOM_KEY, JSON.stringify(records.slice(0, 40))); } catch (e) {}
}

function pbRegisterCustom(record) {
  if (!record || !record.id || PB_SOURCES[record.id]) return null;
  const tpl = pbEngineTemplate(record.engine);
  if (!tpl) return null;
  let base;
  try { base = pbNormalizeBase(record.base); } catch (e) { return null; }
  const src = Object.assign({}, tpl, {
    id: record.id, name: String(record.name || base), short: String(record.name || base),
    engine: record.engine, bases: [base], custom: true, off: false,
    note: "Added by you. Same API family as " + tpl.name + "."
  });
  delete src.auth;   // no account integration is claimed for a source we cannot verify
  pbRegister(src);
  try {
    const host = new URL(base).host;
    PB_DIRECT_HOSTS.add(host);      // try the site directly first (CORS), proxy second
    PB_PROXY_HOSTS.delete(host);
  } catch (e) {}
  return src;
}

function pbLoadCustomSources() {
  let changed = false;
  for (const record of pbCustomRecords()) {
    if (PB_SOURCES[record.id]) continue;
    if (pbRegisterCustom(record)) changed = true;
  }
  return changed;
}

/** Add one custom source. Returns its id; throws a readable error otherwise. */
function pbAddCustomSource(fields) {
  const name = String(fields && fields.name || "").trim().slice(0, 40);
  const base = pbNormalizeBase(fields && fields.base);
  const engine = String(fields && fields.engine || "").trim();
  if (!name) throw new Error("Give the source a name.");
  if (!PB_CUSTOM_ENGINES.includes(engine)) throw new Error("Choose the booru's API type, or use Guess.");
  const records = pbCustomRecords();
  const clash = records.concat(PB_SRC_ORDER.map(id => PB_SOURCES[id]).filter(Boolean))
    .find(s => s && !s.off && pbSameBase(s, base));
  if (clash) throw new Error("That address is already a source (" + clash.name + ").");
  let id = "custom-" + base.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40);
  let n = 1;
  const taken = new Set(Object.keys(PB_SOURCES));
  while (taken.has(id)) id = "custom-" + base.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 34) + "-" + (++n);
  const record = { id, name, base, engine, addedAt: Date.now() };
  if (!pbRegisterCustom(record)) throw new Error("That source could not be added.");
  pbWriteCustomRecords(records.concat([record]));
  return id;
}

/** Edit one of the user's own sources. The id never changes, so pins and
 *  bookmarks already saved from it keep working. */
function pbUpdateCustomSource(id, fields) {
  const current = PB_SOURCES[id];
  const records = pbCustomRecords();
  const record = records.find(r => r.id === id);
  if (!current || !current.custom || !record) throw new Error("That source cannot be edited.");
  const name = String(fields && fields.name || "").trim().slice(0, 40);
  const base = pbNormalizeBase(fields && fields.base);
  const engine = String(fields && fields.engine || "").trim();
  if (!name) throw new Error("Give the source a name.");
  if (!PB_CUSTOM_ENGINES.includes(engine)) throw new Error("Choose the booru's API type, or use Guess.");
  const clash = records.concat(PB_SRC_ORDER.map(x => PB_SOURCES[x]).filter(Boolean))
    .find(s => s && s.id !== id && !s.off && pbSameBase(s, base));
  if (clash) throw new Error("That address is already a source (" + clash.name + ").");
  const next = Object.assign({}, record, { name: name, base: base, engine: engine, updatedAt: Date.now() });
  delete PB_SOURCES[id];
  const at = PB_SRC_ORDER.indexOf(id);
  if (at >= 0) PB_SRC_ORDER.splice(at, 1);
  if (!pbRegisterCustom(next)) { pbRegisterCustom(record); throw new Error("That source could not be updated."); }
  pbWriteCustomRecords(records.map(r => (r.id === id ? next : r)));
  return next;
}

function pbSameBase(s, base) {
  const norm = value => { try { return pbNormalizeBase(value); } catch (e) { return ""; } };
  const want = norm(base);
  return !!want && (s.bases || []).some(b => norm(b) === want);
}

function pbRemoveCustomSource(id) {
  const s = PB_SOURCES[id];
  if (!s || !s.custom) return false;
  delete PB_SOURCES[id];
  const at = PB_SRC_ORDER.indexOf(id);
  if (at >= 0) PB_SRC_ORDER.splice(at, 1);
  delete PB_AUTH[id];
  pbWriteCustomRecords(pbCustomRecords().filter(r => r.id !== id));
  return true;
}

/** Ask the address itself which API it speaks. Never guesses silently. */
async function pbGuessEngine(base) {
  const norm = pbNormalizeBase(base);
  const read = async url => {
    try {
      const res = await pbRawFetch(url, {});
      const text = String(res.text || "").trim();
      if (!text || (text[0] !== "{" && text[0] !== "[")) return null;
      return JSON.parse(text);
    } catch (e) { return null; }
  };
  let j = await read(norm + "posts.json?limit=1");
  if (Array.isArray(j)) return "danbooru";
  if (j && Array.isArray(j.posts)) return "e621";
  j = await read(norm + "post.json?limit=1");
  if (Array.isArray(j)) return "moebooru";
  j = await read(norm + "api/v1/json/search/posts?q=*&per_page=1");
  if (j && (Array.isArray(j.posts) || j.search !== undefined)) return "philomena";
  j = await read(norm + "index.php?page=dapi&s=post&q=index&json=1&limit=1");
  if (Array.isArray(j) || (j && Array.isArray(j.post))) return "gelbooru";
  return "";
}

pbLoadCustomSources();

window.pbLoadPostDetails = pbLoadPostDetails;
window.pbAutocomplete = pbAutocomplete;
window.pbSource = pbSource;
window.pbMoebooruHash = pbMoebooruHash;
window.pbKeys = PB_KEYS;            // old alias
window.pbAuth = PB_AUTH;            // {sourceId:{login,apiKey,passHash}}
window.pbSetAuth = pbSetAuth;
window.pbSaveAuth = pbSaveAuth;
window.pbLoadAuth = pbLoadAuth;
window.pbHasAuth = pbHasAuth;
window.pbLikesOk = pbLikesOk;
window.pbLoadFavorites = pbLoadFavorites;
window.pbLoadFavoriteCount = pbLoadFavoriteCount;
window.pbTestAuth = pbTestAuth;

window.pbSourceSupport=pbSourceSupport;
window.pbCanLike=pbCanLike;
window.pbFavoriteStatus=pbFavoriteStatus;
window.pbSetFavorite=pbSetFavorite;
window.pbAuthVersion=pbAuthVersion;
window.pbLoadCustomSources=pbLoadCustomSources;
window.pbAddCustomSource=pbAddCustomSource;
window.pbRemoveCustomSource=pbRemoveCustomSource;
window.pbUpdateCustomSource=pbUpdateCustomSource;
window.pbGuessEngine=pbGuessEngine;
window.pbCustomEngines=PB_CUSTOM_ENGINES;
window.pbNormalizeBase=pbNormalizeBase;
