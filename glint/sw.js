/* Pinboard service worker — offline-first app shell
   ─────────────────────────────────────────────────
   Goal: every piece of UI (markup, styles, scripts, icons, offline page) is on
   the device, so the app opens instantly and stays usable with no network.

   Strategy
   • Install precaches the whole shell (tolerant: one bad file can never block
     the install, which used to leave the app with no offline copy at all).
   • Shell + navigations: stale-while-revalidate — painted from the cache in a
     single frame, refreshed in the background. The version prompt (pwa.js) is
     still the only way a *new* worker takes over.
   • Pictures: cache-first in their own bucket (proxied CDN images included —
     they used to be skipped entirely because of the /api/ guard).
   • Read-only booru API replies: network first with a short deadline, cached
     copy when the network is slow or gone, so feeds/search/post pages you have
     already seen still open offline.
   • Credentials, private envelopes and every mutation are never cached and
     never stored: POST skeletons bypass the worker at the method guard, and
     any proxied URL carrying a credential is refused a cache entry.

   To ship an update: bump VERSION, deploy — pwa.js offers the user “Update”.
*/
const VERSION = "glint-v2-redesign-76";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGE_CACHE = "pinboard-img-v1";
const API_CACHE = "pinboard-api-v1";

/* The whole UI, not just the entry point. */
const PRECACHE = [
  "./",
  "./index.html",
  "./Glint.html",
  "./offline.html",
  "./styles.css",
  "./styles.css?v=74",
  "./boot.js",
  "./boot.js?v=65",
  "./sources.js",
  "./sources.js?v=66",
  "./runtime.js",
  "./runtime.js?v=65",
  "./app.js",
  "./app.js?v=75",
  "./drive.js",
  "./drive.js?v=65",
  "./pwa.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png",
  "./icons/favicon.svg",
];

const API_DEADLINE = 2500;      // ms the network gets before the cached reply wins
const IMAGE_LIMIT = 400;        // pictures kept for offline
const API_LIMIT = 160;          // JSON replies kept for offline
const SHELL = /\/$|\.html$|\/(styles\.css|app\.js|drive\.js|sources\.js|runtime\.js|boot\.js|pwa\.js|manifest\.webmanifest)$/;
const CREDENTIAL = /^(login|api_key|user_api_key|password_hash|pass_hash|password|token|access_token|refresh_token|key)$/i;
const PRIVATE_PATH = /\/(favorites?|profile|profile\.json|post\/vote|public\/addfav)(\.|\/|$)/i;

/* A clear, immediate answer instead of a request that hangs forever. */
const offlineReply = () => new Response(JSON.stringify({ error: "offline" }), {
  status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function trimCache(cache, max) {
  try {
    const keys = await cache.keys();
    if (keys.length <= max) return;
    for (const k of keys.slice(0, keys.length - max)) await cache.delete(k);
  } catch (e) { /* quota/opaque: nothing to trim */ }
}

/* A cache write must never break a response, and a full disk must never lose
   the picture that was just asked for: drop the oldest entries and retry once. */
async function put(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    return true;
  } catch (e) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.ceil(keys.length / 2))) await cache.delete(k);
      await cache.put(request, response.clone());
      return true;
    } catch (x) { return false; }
  }
}

/* Is this proxied URL safe to remember? Anything carrying an account value or
   pointing at a private endpoint is not, ever. */
function cacheableProxy(target) {
  if (!target) return false;
  for (const key of target.searchParams.keys()) if (CREDENTIAL.test(key)) return false;
  if (PRIVATE_PATH.test(target.pathname)) return false;
  return true;
}
function proxyTarget(url) {
  try {
    if (!url.pathname.endsWith("/api/proxy")) return null;
    const raw = url.searchParams.get("u");
    return raw ? new URL(raw) : null;
  } catch (e) { return null; }
}
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|svg)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Individually, so a single 404 (an icon a deployment forgot) cannot
    // abort the install and leave the app with no offline copy.
    await Promise.allSettled(PRECACHE.map(async (path) => {
      const request = new Request(new URL(path, self.location.href), { cache: "reload" });
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
    }));
    // No skipWaiting() on purpose: pwa.js asks the user before updating.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const currentPrefix = `${VERSION}-`;
    await Promise.all(
      keys.filter((k) => {
        if ([IMAGE_CACHE, API_CACHE].includes(k)) return false;
        const isAppCache = k.startsWith("pinboard-") || k.startsWith("glint-v2-redesign-");
        return isAppCache && !k.startsWith(currentPrefix);
      }).map((k) => caches.delete(k))
    );
    // Old image/API entries should be media and public reads only. Remove any
    // historical credential/account request without throwing away real data.
    for (const name of [IMAGE_CACHE, API_CACHE]) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        try {
          const u = new URL(request.url), target = proxyTarget(u) || u;
          if ([...target.searchParams.keys()].some((k) => CREDENTIAL.test(k)) || PRIVATE_PATH.test(target.pathname)) await cache.delete(request);
        } catch (e) { /* ignore malformed */ }
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* Serve the cached copy now, refresh it in the background. The user sees the UI
   in one frame; the next launch already has whatever changed. */
function staleWhileRevalidate(event, cacheName) {
  const request = event.request;
  const network = (async () => {
    try {
      const fresh = await fetch(request, { cache: "no-cache" });
      if (fresh && fresh.ok) await put(cacheName, request, fresh);
      return fresh;
    } catch (e) { return null; }
  })();
  event.waitUntil(network.catch(() => {}));
  return (async () => {
    const cached = await caches.match(request, { cacheName });
    if (cached) return cached;
    const fresh = await network;
    if (fresh) return fresh;
    return null;
  })();
}

/* JSON reads: the network gets a short deadline, the cache answers when it is
   slow or missing. Offline answers immediately from the cache. */
async function apiRead(event) {
  const request = event.request;
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);
  if (self.navigator && self.navigator.onLine === false) {
    return cached || offlineReply();
  }
  const fresh = await Promise.race([
    fetch(request).then(async (response) => {
      if (response && response.ok) { await put(API_CACHE, request, response); trimCache(cache, API_LIMIT); }
      return response;
    }).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), API_DEADLINE)),
  ]);
  return fresh || cached || offlineReply();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;                       // never cache a write

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;            // CDN hits go direct

  const target = proxyTarget(url);

  /* ── pictures (including proxied CDN images) ───────────────────────────── */
  const picture = request.destination === "image" || (target ? IMAGE_EXT.test(target.pathname) : IMAGE_EXT.test(url.pathname));
  if (picture && (!target || cacheableProxy(target))) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) { await put(IMAGE_CACHE, request, fresh); trimCache(cache, IMAGE_LIMIT); }
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  /* Videos are streamed, never stored: a single clip can be larger than the
     whole cache budget. Only their poster stills are kept. */
  if (request.destination === "video" || (target && VIDEO_EXT.test(target.pathname))) return;

  /* ── booru API reads over the proxy ────────────────────────────────────── */
  if (target) {
    if (!cacheableProxy(target)) return;                     // credentialed: leave alone
    event.respondWith(apiRead(event));
    return;
  }
  if (/\/(api|\.netlify\/functions)\//.test(url.pathname)) return;

  /* ── page loads: instant shell, refreshed behind you ───────────────────── */
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const shell = await staleWhileRevalidate(event, STATIC_CACHE);
      if (shell) return shell;
      return (await caches.match("./index.html")) || (await caches.match("./offline.html")) || Response.error();
    })());
    return;
  }

  /* ── everything else in the shell: same treatment ──────────────────────── */
  if (SHELL.test(url.pathname)) {
    event.respondWith((async () => {
      const shell = await staleWhileRevalidate(event, STATIC_CACHE);
      return shell || (await caches.match(request)) || Response.error();
    })());
    return;
  }

  /* ── last resort: cache first, network refresh ─────────────────────────── */
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (response) => {
      if (response && response.ok) await put(RUNTIME_CACHE, request, response);
      return response;
    }).catch(() => cached || Response.error());
    return cached || network;
  })());
});
