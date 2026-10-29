# Pinboard · v65 — installable Pinterest-style PWA for booru sites

> **v65:** real source-account Likes, independent local Bookmarks, researched source/login capabilities, and a production-hardening pass (gestures, request lifecycle, storage safety, CSP/proxy hardening, accessibility). See [Source account guide](SOURCE-ACCOUNTS.md) and [v65 release notes](RELEASE-NOTES-v65.md).

**Pinboard** is a dark, red-accented Pinterest-style image board that runs entirely in the
browser and installs on a phone like a native app. It has no build step, no framework and no
runtime dependencies — it is plain HTML, CSS and JavaScript, plus a small Python proxy so the
browser can reach booru sites that refuse cross-origin requests.

It ships with **16 source presets** (10 enabled, 6 disabled/unverified), a
**swipeable profile pager** that behaves exactly like Pinterest's, **per-source accounts** so
your Likes come from the site itself, and full PWA plumbing: manifest, icons, service worker,
offline support, install + update UX, share target and shortcuts.

```
┌───────────────────────────────────────────────────────────────────────┐
│  Pinboard                          ✎(edit source)        💬            │  ← home
│  Danbooru   yande.re   +                                            │  ← your sources
│                                                                       │
│   ░░░░░░░░░░░░░░   ░░░░░░░░░░░░░░░                                  │  ← titleless
│   ░░░░░░░░░░░░░░   ░░░░░░░░░░░░░░░░░                                │     2-column
│   ░░░░░░░░░░░░░░░  ░░░░░░░░░░░░░░░░░░░░░░                            │     masonry
│   ░░░░░░░░░░░░░░░  ░░░░░░░░░░░░░░░░░░░░░░                            │
│                                                                       │
│  ╭───╮   ╭───╮   ╭───╮                                               │  ← bottom nav
│  │ ⌂ │   │ 🔍 │   │ ◕ │                                              │
│  ╰───╯   ╰───╯   ╰───╯                                               │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Table of contents

1. [Quick facts](#1-quick-facts)
2. [What's in the box](#2-whats-in-the-box)
3. [Quick start](#3-quick-start)
4. [A tour of the app](#4-a-tour-of-the-app)
5. [The three profile tabs](#5-the-three-profile-tabs-likes-bookmarks-explore)
6. [Signing in to a source](#6-signing-in-to-a-source)
7. [The source catalogue](#7-the-source-catalogue)
8. [The proxy](#8-the-proxy)
9. [PWA internals](#9-pwa-internals)
10. [Architecture & code map](#10-architecture--code-map)
11. [Storage reference](#11-storage-reference)
12. [Settings reference](#12-settings-reference)
13. [The swipe / gesture model](#13-the-swipe--gesture-model)
14. [Device support](#14-device-support)
15. [Testing](#15-testing)
16. [Deploying](#16-deploying)
17. [Shipping an update](#17-shipping-an-update)
18. [Customising](#18-customising)
19. [Troubleshooting](#19-troubleshooting)
20. [Known limits & roadmap](#20-known-limits--roadmap)
21. [v65 production hardening](#21-v65-production-hardening)
21. [Privacy & safety](#21-privacy--safety)
22. [Full changelog](#22-full-changelog-v1--v22)
23. [References](#23-references)

---

## 1. Quick facts

| | |
|---|---|
| **Name** | Pinboard |
| **Version** | `v22` (service worker `pinboard-v22`) |
| **Stack** | Vanilla HTML / CSS / JS. No bundler, no framework, no npm runtime deps. |
| **Theme** | Black `#000` with Pinboard red `#e60023` |
| **Display** | Standalone, portrait, black status bar |
| **Requires** | A modern browser (Chrome, Edge, Safari 16+, Firefox). A server for the proxy. |
| **Runs from a sub-path?** | Yes — every path is relative (`./…`), so GitHub Pages project sites work. |
| **Offline?** | Yes — the shell is precached; the image feed needs a connection. |
| **Stores data** | `localStorage` only. Nothing is uploaded anywhere except the booru site you sign in to. |
| **Installable?** | Yes — manifest + icons + service worker + install prompt. |
| **Mobile target** | 2412 × 1080 physical → 360×804 / 393×877 / 412×919 CSS viewports |

---

## 2. What's in the box

```
pinboard-pwa/
├── index.html              App shell: PWA meta, manifest/icon links, install + update + offline bars,
│                           the build stamp & self-heal script, the #app mount point, #sheet/#ov overlays.
├── styles.css              All styling. Original UI CSS + PWA additions + v2–v22 refinements.
├── app.js                  The whole application: state, rendering, routing, gestures, sheets, actions.
├── sources.js              The source registry (16 sites), transport layer, per-source accounts,
│                           favourites ("Likes") API, tag autocomplete, moebooru password hashing.
├── pwa.js                  Service-worker registration, install prompt + iOS fallback, update flow,
│                           offline indicator, install-bar dismissal.
├── sw.js                   The service worker: precache, navigation handling, runtime image cache.
├── manifest.webmanifest    Standalone portrait manifest: icons, shortcuts, share_target.
├── offline.html            Standalone last-resort offline page.
├── server.py               Local dev server + the /api/proxy route (allow-list, neutral UA, cache).
├── dev-server.mjs          The same server in Node — what `npm start` runs.
├── package.json            Local server, tests, Cloudflare Pages scripts, and Wrangler.
├── tools/build-pages.mjs   Builds the static Cloudflare Pages output into dist/.
├── tools/check-sources.mjs `npm run check:sources` — which sources answer from this network.
├── api/proxy.js            The same proxy as a Vercel serverless function.
├── functions/api/proxy.js  Cloudflare Pages Function for /api/proxy.
├── netlify/functions/proxy.js   The same proxy as a Netlify serverless function.
├── netlify.toml            Netlify config: publish dir + the /api/proxy redirect.
├── wrangler.jsonc          Cloudflare Pages output path and Node compatibility.
├── _headers                Netlify/Cloudflare response headers (cache + content types).
├── vercel.json             Vercel config (routes + headers).
├── icons/                  icon-192, icon-512, maskable-512, apple-touch-icon, favicon-64, favicon.svg
├── generate-icons.py       Regenerates every icon from scratch (Pillow).
└── README.md               This file.
```

**22 files.** The app is ~160 KB of readable, unminified source (plus icons); the ZIP compresses
to ~92 KB, about 39 KB of which is this README. Nothing is minified — read it, change it, ship it.

---

## 3. Quick start

### Run it locally

```bash
cd pinboard-pwa
python3 server.py          # → http://localhost:8000
```

`server.py` does two jobs: it serves the static files **and** it provides `/api/proxy`, which
most booru sites need (see [§8](#8-the-proxy)). `npm start` (that is `dev-server.mjs`) does the
same two jobs in Node.

### Running it with npm (`npm start`)

```bash
cd pinboard-pwa-v65
npm start                  # → http://localhost:8000
PORT=8080 npm start        # another port
```

`npm start` runs `dev-server.mjs` — a dependency-free Node server (`node >= 18`, no `npm install`
needed) that serves the shell **and** `/api/proxy`. Media requests are streamed with their
`Range` header passed through, so videos start and seek. It shares its allow-list, request
validation, auth rules and size limits with the Vercel/Netlify functions through
`proxy-core.cjs`, so there is one security implementation rather than three.

> **A static server alone cannot work.** `npx serve .` (or `python3 -m http.server`) publishes the
> files but has no `/api/proxy`, so every source answers `404` and the grid stays empty with
> “HTTP 404 · Retry”. The app is a shell plus a proxy; both halves have to be running.

### Try it on your phone

1. Put the folder on any host that serves **HTTPS** (see [§16](#16-deploying)).
2. Open the URL in Chrome on Android → the install bar appears → **Install**.
   On iOS: **Share → Add to Home Screen**.
3. Once installed it opens full-screen with the Pinboard icon and a black status bar.

> **HTTPS rule:** service workers and install prompts only work on **HTTPS** or **localhost**.
> `localhost` is fine for testing; anything else must be HTTPS.

---

## 4. A tour of the app

### Home

* The **pencil** in the top bar opens **Edit *source*** for the source you are currently on
  (see [§6](#6-signing-in-to-a-source)). The chat bubble is a placeholder.
* Below it, the **source row**: the sources you pinned, in order, plus a **+** that opens the
  source manager to add or remove sites. The row reuses the exact typography of the original
  board tabs (18.9 px / 600 / 3 px underline).
* The feed is a **two-column masonry** of live posts from the current source.
  * **No titles** — a card is the picture and nothing else (that was a deliberate change in v20).
  * **No “•••” button on the picture** — it was removed in v21. Tap the picture to open the post,
    which carries **Like / Share / Save** and a “•••” menu.
  * Corner radius **16 px**, gutters **4 px**, grid edge **4 px**.
* Scrolling to the bottom loads the next page behind a **spinning circle** (not a “Load more”
  label — that was removed in v17).
* Switching source always opens that source **at the top** of its feed (v18).
* Switching **quickly** (danbooru → yande.re → konachan in one go) is safe: only the source you
  stop on is fetched, the grid only ever contains that source's pictures, an outgoing feed is
  never left on screen, and each feed keeps the source's own newest-first order top to bottom.

### Search

* Same source row on top, a search pill, and quick tag chips.
* The query is mirrored as **removable tag chips** under the pill — one chip per token, so
  `hololive`, `-dog` and `rating:safe` each get their own. Tapping a chip's × drops that one
  token, rewrites the query and re-runs the search; **Clear all** starts over. The chips share
  the Saved-tab styling and leave typing, autocomplete, recent searches and sorting untouched.
* Search runs against the **current source**; results are a normal masonry grid **with** titles.
* **Nothing searches while you type.** The text waits in the box — with an accent ring around it
  — until you press **Enter** (or tap the search button). No request and no result count is
  fetched per keystroke. Dropping a chip, choosing a tag suggestion, a recent search, a shared
  `?q=` link or the sort control all apply immediately, because they are explicit choices.
  Tag suggestions still appear while you type. The same rule holds in **Bookmarks** and
  **Likes**: a half-typed word is a draft, and space or Enter commits it into a chip and applies
  the search.

### Profile

* The tab row: **Likes · Bookmarks · Explore** — but only **Likes** appears when the source you
  are on has your details written (see [§5](#5-the-three-profile-tabs-likes-bookmarks-explore)).
* The gear opens **Settings**.

### Sheets

Tapping a picture opens the **post sheet**: the full-size image, the tags as the title, a
subtitle with source / rating / author, and Like / Share / Save buttons.

---

## 5. The three profile tabs: Likes, Bookmarks, Explore

This is the heart of the current design, and the two collection concepts are deliberately
**different things**.

### Likes — real source-account favourites

The tab is available only for an implemented reader with complete per-source credentials.
Post hearts exist only for implemented writers: **Danbooru, yande.re, Konachan,
Sakugabooru, e621 and Gelbooru**. Gelbooru needs a separate optional website session
in addition to its User ID/API key; without it, the heart is hidden.

Like/Unlike calls the original source, then reads the real state back. Pending or
unknown state is disabled; failure is never converted to a local pink heart. Profile
Likes and the native account total are invalidated/refreshed after confirmation,
including recovery from an uncertain write. A missing total stays unavailable.

- Danbooru uses `ordfav:<username>` for newest favourites; oldest pagination uses
  native favourite-record cursors, not post IDs. Mutations use the **post ID**.
- Moebooru lists use `vote:3:<username> order:vote`; Like is score 3, Unlike is score 0.
- e621 uses real HTTP Basic username/API-key authentication and its favourites API.
- Gelbooru uses `fav:<numeric UID>` reads and a separately supplied website cookie
  for source writes. Ordering is explicit post-ID order, not claimed favourite dates.
- Other presets may have account/favourite support on the website or in native
  Boorusama but have no writer in this PWA. That is an **app limitation**, not proof
  that the website has no API.

See **[SOURCE-ACCOUNTS.md](SOURCE-ACCOUNTS.md)** for all 16 presets, credential
instructions, native-vs-PWA differences, limitations, protocol details and test scope.
**No real credentials were supplied; production authenticated writes are not live-verified.**

### Bookmarks — universal, local and independent

One-tap Bookmark saves metadata locally without requiring a source account or making
any favourite request. Saved-only search, source filters, save-time ordering and the
two/three-column masonry remain available. Unlike never removes a Bookmark and removing
a Bookmark never unfavourites on the website.

Older device-only `S.likes` and archived collections remain in saved data, but are not
used as remote favourite truth or silently uploaded.

### Explore — the selected source's own explore page

Explore mirrors the site that is selected on Home; it never mixes sources. Each source
shows **only the views that site really has**, in that site's own order and with its own
pagination, so nothing is invented.

| Source | Views | Period control |
|---|---|---|
| Danbooru | **Popular** (`explore/posts/popular.json`), **Hot** (`order:rank`), **Most viewed** (`explore/posts/viewed.json`) | Popular takes a date, default today (Day / Week / Month) |
| yande.re · Konachan · Sakugabooru | **Popular** (`popular_recent`, `popular_by_day/_week/_month`) | Day / Week / Month / Recent — first page only, as the site offers |
| e621 · e926 | **Popular** (`/popular.json`) | Day / Week / Month |
| Gelbooru, Philomena (Derpibooru, Furbooru), Anime-Pictures | — | a plain "this source has no explore view" empty state, no request made |

* **Big, equal thumbnails.** Every tile in a section is the same square, so a view reads as
  a grid instead of a ragged rail.
* **One view, one feed.** A source that has a single explore view (yande.re, Konachan,
  e621, Gelbooru…) skips the section headings entirely: it opens as the feed itself,
  **two posts per row**, and loads the next page as you scroll — no **See more**.
* **Videos carry a play mark** on their thumbnail, everywhere a card is drawn, and the post
  opens a real player (`<video>` with native controls, inline playback and the still preview
  as its poster). Files stream straight from the site's CDN with Range requests, so playback
  starts immediately and seeking works; the proxied copy is kept as a one-shot fallback, and
  a file that will not load says so and offers **Retry video** instead of a black box.
* Explore **opens straight on the source it follows** — the only heading is the source name,
  drawn as a small muted caption (no "Explore" label, no second line), and the source row is
  not repeated; change the source on Home and Explore follows it.
* **See more** (only where there is more than one view) opens a full feed of that view;
  **Load more** appears only where the endpoint can advance.
* A failing view shows its own error and **Retry** and never blanks the rest of the tab.

---

### Artist / Character / Series names

On Danbooru and e621 the post itself says what each name is (prefixed tags, `tag_string_artist`
fields). Moebooru sites (yande.re, Konachan, Sakuga) do not: a tag is only an *artist* tag if
the site's tag list says so. Two things follow, and both are handled:

* The feed request asks for the tag categories **in the same call** (`api_version=2` +
  `include_tags=1`, about +4 KB per 40 posts), so opening a post paints Character / Series /
  Artist at once instead of a round-trip later.
* Every category learned is remembered on the device (`pb-tag-types-v1`, up to 4000 tags,
  written on idle), so later posts — and later launches — classify instantly even when a
  response carries no tag map.

### Favouriting (the ♥ on a post)

The heart is a **favourite on the original website**, not a local save. One tap is enough:
if the app does not yet know whether the account already has that post, the tap reads the
account's real state and then favourites it. A tap made while that read is still running is
remembered and applied when the answer lands — and a tap made while the state is unknown only
ever **adds**, it never removes something you could not see. Reading the state is retried once
(it is read-only, so a retry is always safe), and a heart is never left dead: after a denied,
rate-limited or timed-out write it stays tappable and the small line under the image offers
**Recheck**. On yande.re / Konachan the login a vote read needs is remembered for a few minutes,
so a heart tap is one request, not two.

### Image quality

**Settings → Feed image quality / Post detail quality / Full-screen quality** decides which
of the three files a source gives us is used, per place:

| Row | Default | Choices |
|---|---|---|
| Feed image quality | Thumbnail · fast | the small preview, or **Sharp** (the larger file) |
| Post detail quality | Sample | the site's medium file, or **Original** |
| Full-screen quality | Original | **Sample** or the untouched upload |

The choice is saved on this device (`pb2.iq`) and applies to every source. If a post has no
larger file, the card falls back to what it does have instead of showing nothing — it never
breaks a grid because one size is missing.

---

### Adding a source the app does not ship with

**Settings → Image source → Add a custom source** (or the **+** in the Home source row).

| Field | What it means |
|---|---|
| **Name** | Anything you like, shown in the source row. |
| **Address** | The booru's base address, e.g. `https://example.booru.org/`. https is added if you leave it out. |
| **API type** | Danbooru, Moebooru, e621, Gelbooru or Philomena. |

**Guess the API type** asks the address itself (`posts.json`, `post.json`,
`api/v1/json/search/posts`, `index.php?page=dapi…`) and fills the picker — you can always
correct it. **Add source** registers it only after it answers a real request, then puts it in
your row.

A custom source gets Home, Search, tags, bookmarks and video playback like any other. It
does **not** get Explore views, a popularity order or a Like button: those are only offered
where the app can verify them. Its own host is tried directly first (the site must allow
CORS); the app's proxy is the fallback. Custom sources are stored in
`localStorage["pb-custom-sources-v1"]`. Use the **Edit** button on the card (or the pencil on
its **Settings → Sources** row) to rename one, re-point its address or change its API type —
its identity is kept, so pins and bookmarks saved from it keep working. An address that already
belongs to another source, or one that does not answer, is refused and rolled back. **Delete**
removes a custom source completely; on a preset the bin only takes it out of your row, and it
stays re-addable from the same sheet.

---

## 6. Signing in to a source

Tap the **pencil** in the top bar (or **Settings → Source accounts → Edit**, or the pencil on that
source's **Settings → Sources** row).

| Field | What it is |
|---|---|
| **Username** | Your login on that site. Danbooru and Gelbooru also accept a numeric user id. |
| **API key / password** | **Danbooru, e621** — an API key from your account page (free). **yande.re / Konachan** — your password; it is salted + SHA-1 hashed on the device and never stored in clear. Leave the field blank to keep the saved one. |
| **Tags for this source** | Optional tags the feed always starts from, e.g. `1girl rating:e`. Saved per source. |

Buttons:

* **Save** — stores it on this device and refreshes the feed if you changed the tags.
* **Test connection** — checks the details against the site and reports the account name
  (or the site's own error, e.g. “Invalid API key”).
* **Remove details** — deletes them; the Likes tab disappears with them.

**Where it is stored:** `localStorage["pb-auth"]`, one entry per source:

```json
{
  "danbooru": { "login": "yourname", "apiKey": "…", "passHash": "" },
  "yandere":  { "login": "yourname", "apiKey": "",     "passHash": "40-hex-sha1" }
}
```

**What it is used for:** the favourites request, the “Test connection” check, and — when the
credentials are valid — the authenticated feed (Danbooru applies your blacklist and your rate
limit). **A wrong key can never break your feed:** if an authenticated request fails, the app
retries anonymously and shows you the error only in the Likes tab.

---

## 7. The source catalogue

Sixteen sites are registered. Nine are verified working end-to-end.

| Source | Engine | Status | Likes? | Needs a key? | Reached via |
|---|---|---|---|---|---|
| **Danbooru** | danbooru | ✅ works | ✅ `ordfav:` | API key (free) | proxy |
| **yande.re** | moebooru | ✅ works | ✅ `favorites=` | login (+ optional password) | proxy |
| **Konachan** | moebooru | ✅ works | ✅ `favorites=` | login | proxy |
| **Sakugabooru** | moebooru | ✅ works | ✅ `favorites=` | login | proxy |
| **e621** | e621 | ✅ works | ✅ `fav:` | username | direct or proxy |
| **Derpibooru** | philomena | ✅ works | — | — | direct |
| **Ponybooru** | philomena | ✅ works | — | — | proxy |
| **Anime Pictures** | anime-pictures | ✅ works | — | — | direct or proxy |
| **e-shuushuu** | eshuushuu | ✅ works | — | — | proxy |
| **Gelbooru** | gelbooru | ⚠️ needs a key | — | user id + API key (free) — reads are `401` without one | proxy |
| **Szurubooru** | szurubooru | ⛔ off | — | — | host no longer resolves |
| **booru.funmaker.moe** | szurubooru | ⛔ off | — | — | API returns ids only, no images |
| **Sankaku** | sankaku | ⛔ off | — | — | upstream returns 502 |
| **Nozomi.la** | nozomi | ⛔ off | — | — | per-post JSON 404s |
| **Zerochan** | zerochan | ⛔ off | — | — | upstream returns 503 |
| **Rule34.paheal** | shimmie2 | ⛔ off | — | — | GraphQL search endpoint removed |

Sources marked **off** stay in the code for reference but are hidden in the manager and cannot be
picked.

### Measured behaviour (why the proxy exists)

CORS is decided by the site, so it is the same on every device:

| Answer | Sources |
|---|---|
| `access-control-allow-origin: *` → **direct fetch works** | Derpibooru, e621, e926, Anime Pictures |
| **No CORS header** → our proxy is required | yande.re, Konachan, Ponybooru, e-shuushuu, Funmaker, Sakuga, paheal, Sankaku, Nozomi, Zerochan, realbooru |
| **Cloudflare challenge** → our proxy (neutral UA) | Danbooru, safebooru |

### A trap worth knowing

**Danbooru's CDN (`cdn.donmai.us`) answers `403` + `cross-origin-resource-policy: same-origin`
to any request that carries a `Referer`** — and every browser sends one. Danbooru images are
therefore fetched through the proxy as well, which sends no Referer. The grid uses
`cdn.donmai.us/360x360/…` (≈20 KB, aspect-preserving).

Three more CDNs behave the same way and are proxied for that reason: **`static1.e621.net`**
(and e926) — ORB blocks the `<img>` outright; **`opreviews.anime-pictures.net`** — AVIF only,
`cross-origin-resource-policy: same-origin`; and **`cdn.e-shuushuu.net`**, which answers `403`
to a request without a real User-Agent. Everything else still loads straight from the CDN.

### What the proxy was verified against

`tests/proxy-sources.live.cjs` walks **every enabled source** with the real network and asserts
four things: the allow-list refuses an unlisted host / plain `http` / a URL with credentials / a
non-443 port; each source lists real posts through `/api/proxy`; each proxied picture host is in
`proxy-policy.json` and its pictures actually decode in the browser; and a video answers
`206 Partial Content` with `Content-Range` so a player can seek. Last run (2026-10-24):
Danbooru, yande.re, Konachan, Sakugabooru, e621, Derpibooru, Ponybooru, Anime Pictures and
e-shuushuu all listed 40 posts with decoded pictures, Danbooru and e-shuushuu tag searches
returned 20 rows each, and e621's webm streamed with `bytes 0-1023`. Gelbooru answers `401`
without a key, and the app now says so instead of "HTTP 401".

### "A source says 403 on my network"

Danbooru sits behind Cloudflare, and Cloudflare decides per network: the same
`/posts.json` answers `200` from one connection and `403` from another. The app cannot fix
the site's opinion of your IP, so it does two things instead:

* **`npm run check:sources`** prints the status of every source from *your* machine, through
  the very same proxy code the app uses. If `danbooru` says `403` there, the app will too.
* **One mirror fallback.** Danbooru's API is identical on `safebooru.donmai.us` (safe-only
  mirror). A `403/502/503` from the primary is retried **once** on the sibling host, and a toast
  says so: *"Danbooru blocked this network · showing safebooru.donmai.us instead"*. A healthy
  source is never re-routed (`tests/mirror-fallback.browser.cjs`).

The proxy's User-Agent is the same `Mozilla/5.0 (compatible; Pinboard/65; …)` string on
Python, Node and serverless, because Danbooru challenges a full Chrome UA and a bare app token
from some networks.

### Source fixes from that pass (worker v65.22)

* **Anime Pictures** — the preview CDN only serves AVIF now: `<md5:3>/<md5>_sp|_cp|_bp.avif`.
  Asking for the upload's own extension (`_sp.jpg`) returned `404`, which is why the grid filled
  but the pictures never appeared. Small/medium/full all map to the AVIF trio.
* **e621 / e926** — grid pictures go through the proxy (ORB was blocking them: 40 tiles, 0
  pictures).
* **e-shuushuu** — the site was rebuilt in 2026. `api/v1/images?limit=` is gone; reads are
  `api/v1/images?page=&per_page=`, tag filtering is by **tag id** (`tags=131&tags_mode=all`,
  resolved from the name through `api/v1/tags?search=`), and `sort_by=favorites` /
  `sort_order=ASC` drive Popular and Oldest. Free text that is not a tag name falls back to the
  server-rendered `/search?tags=` gallery.
* **Danbooru** — `donmai.moe` is behind a Cloudflare challenge for every datacenter request
  (`403`, "Just a moment…"), so it is no longer a fallback base. `danbooru.donmai.us` and
  `safebooru.donmai.us` are.
* **Gelbooru** — reads now require a free account key; the old generic 401 reads as advice:
  "Gelbooru now needs a free API key for reads. Add your user id and API key in Settings →
  Source accounts → Gelbooru, then reload."
* **Allow-list gaps** — `assets.yande.re` (yande.re's sample/preview host), `cdn.e-shuushuu.net`,
  `oavatars.anime-pictures.net` and the Sankaku media hosts (`s.`, `v.`, `i.sankakucomplex.com`)
  were missing from `proxy-policy.json`; they are all listed now.

---

### When sync runs

| Trigger | Delay |
|---|---|
| You tap the **avatar** in the bottom bar | immediately (an explicit tap, so a lapsed Google session may renew itself) |
| The **app opens** with Drive connected | ~1 s after launch, once, regardless of the auto-sync switch |
| A **bookmark** is saved or removed | 10 s debounce — a burst of saves is one upload |
| A **settings/board** change | 4 s debounce |
| Network returns · tab hidden with unsaved changes · tab visible after 30 s | ~0.6 s |
| Visible-tab heartbeat | every 2 min |

### A 5 000-bookmark library without lag

A saved post costs ~1.5 KB of text, so 5 000 of them are ~3.7 MB — and the old store
re-serialised and rewrote **all of it** through the synchronous `localStorage` API on every
single save. That was the jank after a bookmark, and the reason a big library had to shed
tags and names.

Now the state is split in two:

| Where | What | Why |
|---|---|---|
| `localStorage` `pb2` | bookmark records (id + savedAt), boards, settings, source list, cached feed | small and synchronous, so it cannot be lost in a crash |
| IndexedDB `pb-library/pins` | a pin's preview/original URLs, tags, artists, characters, series | no 5 MB ceiling, written off the main thread |

* only the records that **changed** are written, debounced into one transaction every 250 ms;
* opening the app hydrates IndexedDB once (`getAll()`) after the first paint, so the shell is
  interactive immediately and the library redraws itself when the previews land;
* if IndexedDB is unavailable (some private modes) it falls back to the old single-blob save.

Measured at **5 000 bookmarks**: `save()` **26–35 ms** and **241 KB** written (was ~3.7 MB);
every pin comes back after a reload; opening the library draws 48 cards in **72–83 ms** with the
rest appended as you scroll. `tests/library-store.browser.cjs` holds that line.

### Google sign-in: “Access blocked — Error 400: origin_mismatch”

That error comes from your Google Cloud project, not from the app: the OAuth Client ID does
not list the page's origin. The app now shows the exact string to register at
**Settings → Google Drive sync**.

1. `console.cloud.google.com` → **APIs & Services → Credentials** → your OAuth 2.0 Client ID.
   It must be type **Web application** (an Android/iOS/Desktop client has no JavaScript origins).
2. **Authorized JavaScript origins → Add URI** and paste the page's origin from the app verbatim,
   e.g. `http://localhost:8000`. Scheme, host and port must match exactly — no path, no trailing
   slash. If you opened `127.0.0.1`, register that one instead (they are different origins);
   registering both is easiest.
3. **Enabled APIs → Google Drive API** must be on, otherwise the next call fails with
   `accessNotConfigured`.
4. Save, wait a few minutes (Google is not instant), then hard-reload the app.

Notes that save an hour: `http://localhost:<any port>` is allowed for local testing, but a LAN
address such as `http://192.168.1.5:8000` generally is not — Drive sync inside a locally served
copy therefore belongs on `localhost`. On a real deploy register the HTTPS origin instead
(`https://your-app.netlify.app`, no trailing slash).

## 8. The proxy

Most booru sites send **no CORS headers**, so a browser cannot call them from a page. Pinboard
ships the same proxy in three flavours:

```
GET /api/proxy?u=<absolute-url>
```

| File | Runs on |
|---|---|
| `server.py` | your machine (`python3 server.py`) and any Python host |
| `dev-server.mjs` | your machine with Node (`npm start`) |
| `netlify/functions/proxy.js` | Netlify |
| `api/proxy.js` | Vercel |
| `functions/api/proxy.js` | Cloudflare Pages Functions |

**What the proxy does**

* Only forwards to an **allow-list** of booru hosts (the table in `server.py` / the array in
  `netlify/functions/proxy.js`).
* Sends a **neutral User-Agent**:
  `Mozilla/5.0 (compatible; Pinboard/1.0; +https://github.com/khoadng/Boorusama)`
  — a Chrome UA makes Danbooru answer `403`.
* Answers `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: *`.
* Caches **JSON** responses for **120 s** in memory.
* Caps the response size and the request body.

**When you need it:** any host that can run a small function (Netlify, Vercel, Cloudflare
Workers, your own box, an APK's bundled backend). On **GitHub Pages** there is no server-side
runtime, so only the directly-reachable sources (Derpibooru, e621, Anime Pictures) work — or you
deploy the proxy somewhere else and point `S.proxy` at it.

### Shipping it inside an APK

The app is written so the proxy can travel with it: `sources.js` detects a
`window.Capacitor.Plugins.CapacitorHttp` plugin and uses it **first** — native HTTP has no CORS
restrictions at all, so every source works without any proxy. That is why the transport order is

```
native plugin  →  direct fetch  →  ./api/proxy?u=…
```

---

## 9. PWA internals

### Manifest (`manifest.webmanifest`)

* `display: standalone`, `orientation: portrait`, `theme_color`/`background_color` `#000000`.
* `id`, `start_url` and `scope` are all `./` → the app works from a sub-path.
* Icons: 192, 512, and a **maskable** 512 for Android's adaptive masks, plus an Apple touch
  icon and a favicon.
* **Shortcuts** (long-press the app icon): *Search ideas* `?screen=search`, *Create a pin*
  `?action=create`, *My boards* `?screen=profile`.
* **Share target**: `GET /?share=1` with `title`/`text`/`url` → opens the Create Pin sheet
  pre-filled.

### Google Drive sync (`drive.js`)

Your bookmarks, cached post details, boards, hidden pins, custom sources and the settings that
matter travel between devices through **one JSON file in your own Google Drive**, inside Drive's
hidden `appDataFolder`. There is no server of ours in the path; the app talks to
`www.googleapis.com` with the token Google gives it.

**One-time setup (about five minutes)**

1. `console.cloud.google.com` → create (or pick) a project → **APIs & Services → Library →
   Google Drive API → Enable**.
2. **APIs & Services → OAuth consent screen** → *External*, add yourself as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application**, and add the origin
   the app is served from (`http://localhost:8000`, and/or your hosted URL) to **Authorised
   JavaScript origins**.
4. Paste that client ID into **Settings → Google Drive sync → OAuth Client ID → Save**, then tap
   **Connect & sync** once and tick the Drive permission.

The Client ID shipped inside the BooruHub APK cannot be reused: a Google *web* client ID only
works on the origins its owner authorised, and that list belongs to the APK's author. The field
therefore starts empty and is stored on the device only.

**The status light**

The profile avatar in the bottom bar is the sync indicator, so the state is visible from anywhere
in the app — not buried in Settings:

| Ring | Meaning |
|---|---|
| **Steady red** | sync is off, or Drive needs attention (message in Settings → Google Drive sync) |
| **Turning green arc** | a sync is in flight; only the ring turns, the face never does |
| **Steady green** | this device and Drive agree; nothing pending |

It also carries the state in its accessible name (`Profile · Synced with Google Drive`), and with
*reduce motion* the arc stops turning and shows a filled green ring instead.

**What it does**

| Behaviour | Detail |
|---|---|
| File | `pinboard-data.json` in `appDataFolder` (invisible in the normal Drive UI), ~0.35 KB per saved post |
| Merge | by **newest change per post**, so two devices never clobber each other |
| Deletions | tombstones (`S.bmDeleted`, 90 days) — a post you remove on one device does not come back from the other |
| Settings | `cols`, theme, swipe direction, image quality, sources, feed order and tag presets travel once the newer side wins (`setAt`) |
| Credentials | **not** synced unless you switch on *Also sync source API keys* |
| Uploads | only when something actually differs; the Drive file's `modifiedTime` is remembered so two devices do not bounce identical copies |
| Auto-sync | 4 s after a change, when you return to the app (>30 s), when you go hidden with pending changes, on `online`, and every 2 minutes while visible |
| Popups | **never** in the background — a background sync reuses the 1-hour token and otherwise waits for your tap |
| Errors | a switched-off Drive API, an unticked scope or a foreign file each get a plain-language message |

Token handling is the same as BooruHub's: Google's browser token lasts an hour, it is cached
(`pb-drive-token`) so reopening the app needs no sign-in, and anything older is renewed by a tap.

### A large local library (thousands of bookmarks)

Bookmarks live in local storage, so the ceiling is the browser's (~5 MB per origin), not the screen.
The pictures are **not** in that budget — they are in the service worker's image cache. What the
5 MB holds is text: a fully cached saved post costs about 1.5 KB of URLs, tags and names.

So a big library is stored in tiers, cheapest-to-richest as it grows:

| Tier | What is kept per saved post | Rough cost | When |
|---|---|---|---|
| **Full** | everything: preview + sample + original URLs, tags, names, file info | ~1.5 KB | normal libraries |
| **Lean** | preview URL, tags, names, dimensions — the original-file URLs are dropped and fetched when the post is opened | ~0.75 KB | storage is getting full (newest posts keep tags, up to a 2.6 MB budget) |
| **Link** | the picture's address, its size, its title and its artist/character/series names | ~0.35 KB | very large libraries; the oldest saves keep this |
| **Card** | the bookmark record only — the card says "Preview not cached" and loads it when seen | ~50 B | past ~14,000 posts |

Nothing the user saved is ever dropped, and whatever was shed is fetched again the moment that
post is opened (the pin knows its detail is missing, so it asks the source once).

Also, for speed:

| Lever | What it buys |
|---|---|
| **First screenful drawn, rest appended on scroll** (`BOOKMARK_FIRST` 48, then 240 at a time, into the same grid) | opening a 5,000-post library draws 48 cards instead of 5,000 |
| **Bookmark ids in a `Set`** | "is this card saved?" is O(1) instead of scanning every record per card |
| **Search text built once per post** (`BOOKMARK_TEXT`, invalidated when that post gains details) | typing filters instead of re-normalising the whole library per keystroke |

Measured at 5,000 saved posts (390 px): library opens in **66–78 ms**, keystrokes **7–42 ms**,
un-bookmarking **108–138 ms**, scrolling keeps every drawn card. `tests/library-large.browser.cjs`.

### Smoothness budget

| Lever | What it buys |
|---|---|
| **The feed grows in place** — the next page is appended into the existing masonry columns (`masonryAppend`), never re-rendered | the cards and pictures already on screen keep their DOM nodes and decoded bitmaps: no flash, no re-decode, no scroll jump |
| **Storage writes are coalesced** (`save()` → one write per idle moment; `save(true)` for bookmarks, imports, sources) | a burst of state changes costs one synchronous `localStorage` write instead of one per render |
| **Scroll work is one `requestAnimationFrame`** per frame, with the document height read once and the next page requested 1200 px early | no forced layout per scroll event, and the next page is usually already there when you arrive |
| **`content-visibility:auto`** on feed cards, `contain` on cards and pictures | offscreen cards are not laid out or painted; a card's own reflow cannot reach the feed |
| **First screenful eager/high priority, the rest lazy/low** | the pictures you are looking at win the bandwidth |

Measured by `tests/smoothness.browser.cjs` (no long tasks when a page is appended, zero dropped
frames while flicking a long feed, ≤1 layout read per frame, one storage write for 12 renders).

### Service worker (`sw.js`)

| Resource | Strategy |
|---|---|
| App shell (HTML/CSS/JS/icons/manifest/offline page) | **Precached on install**, one file at a time so a single 404 cannot abort it → the whole UI opens offline |
| Page navigations & shell files | **Stale-while-revalidate** — painted from the cache in one frame, refreshed behind you |
| Pictures, including proxied CDN images | **Cache-first**, capped at **400** (`pinboard-img-v1`) |
| Read-only booru API replies over the proxy | **Network-first with a 2.5 s deadline**, then the cached reply, capped at **160** (`pinboard-api-v1`) |
| Videos | **Never cached** (a clip can exceed the whole budget); the poster still is |
| Anything credentialed or private (`favorites`, `profile`, `vote`, `addfav`, `api_key`, `pass_hash`…) | **Never cached, never stored** |

Rules that make it smooth rather than merely available:

* The UI is **not** re-rendered from the network on every launch; the cached shell shows first
  and the refresh happens in the background, so a slow connection can never blank the screen.
* Cache writes never break a response, and a full disk trims the oldest half and retries once.
* The first visit is warm-started: as soon as the worker takes control, the current screen is
  drawn once more (`pb-shell-ready`), so the feed data and the pictures on screen are kept for
  offline without paying for a second visit.
* A worker taking control **never reloads the page** by itself; only the *Update* button does.
* Offline the app says so honestly (“You're offline — showing your saved pins”, feed:
  “You're offline — showing what is already saved on this device”), and the notice is
  `pointer-events:none` so it can never swallow a tap.

There is deliberately **no `skipWaiting()`** on install: `pwa.js` shows a *“New version
available”* bar and waits for the user to tap **Update**, then posts `SKIP_WAITING` to the
worker and reloads on `controllerchange`.

### Install & update UX (`pwa.js`)

* **Android / desktop Chrome** — a custom install bar, or the browser menu → *Install app*,
  or **Profile → ⚙ Settings → Install app**. The prompt is captured via `beforeinstallprompt`.
* **iOS** — no install API exists, so the bar shows *Share → Add to Home Screen* instructions.
* Dismissing the bar hides it for **7 days**.
* An **offline indicator** appears when the connection drops.
* A **build stamp** (`window.__PB_BUILD` in `index.html`) is compared with the running bundle
  (`window.PB_APP_VERSION`). If the shell is newer than the bundle — the classic “stale build”
  problem — the app clears the service-worker caches and reloads **itself, once**.

### Deep links

| URL | Opens |
|---|---|
| `?screen=home` / `?screen=search` / `?screen=profile` | that screen |
| `?q=<text>` | the search screen with the query |
| `?action=create` | the Create Pin sheet |
| `?share=1` (+ `title`/`text`/`url`) | the Create Pin sheet, pre-filled |
| `?tab=likes` / `?tab=bookmarks` / `?tab=explore` | that profile tab (legacy `boards` / `collages` still map) |

---

## 10. Architecture & code map

### `sources.js` — the data layer

Every source is one object registered with `pbRegister()`:

```js
pbRegister({
  id: "danbooru", name: "Danbooru", short: "Danbooru", engine: "danbooru",
  bases: ["https://danbooru.donmai.us/", "https://donmai.moe/", "https://safebooru.donmai.us/"],
  tagSep: " ", ratingTag: "rating:",
  auth: { u: "Username", k: "API key", likes: 1 },
  note: "Public API, works straight from the browser.",
  list({ tags, page, limit, base, auth }) { … },   // → { url, method?, body?, headers? }
  parse(j) { … },                                  // raw JSON → raw posts
  map(o) { … }                                     // raw post → normalised pin
});
```

The registry is the single source of truth for the UI, so adding a site means adding one object
— no UI changes required.

**Normalised pin shape** (what the rest of the app consumes):

```js
{ sid, title, tags[], rating, w, h, ar, grid, sample, orig, score, author, date, meta }
```

`app.js`'s `normPin()` wraps that into the app's own pin shape, prefixing the id with the
source (`"danbooru:12345"`) so two sources can never collide.

**Public API of `sources.js`:**

| Export | Purpose |
|---|---|
| `PB_SOURCES`, `PB_SRC_ORDER` | the registry / the ordered list of live sources |
| `pbSource(id)` | look up a source (falls back to the first) |
| `pbLoadPosts(id, {tags,page,limit})` | one page of posts, normalised |
| `pbLoadFavorites(id, {page,limit})` | the account's favourites (Likes) |
| `pbAutocomplete(id, q)` | tag suggestions (best effort) |
| `pbTestAuth(id)` | check the stored details, return the account name |
| `pbHasAuth(id)` / `pbLikesOk(id)` | is this source signed in / does it have favourites |
| `pbSetAuth(id, rec)` / `pbAuth` | read & write the credentials |
| `pbMoebooruHash(password, host)` | SHA-1 + the site's salt, for moebooru sites |

### `app.js` — the application

Roughly in order:

| Area | Functions |
|---|---|
| **State** | `S` (the whole app state), `save()`, `DEF` (defaults), the migration block |
| **Rendering** | `render()`, `home()`, `search()`, `profile()`, `paneHTML(tab)`, `masonry(list, fn, ex)` |
| **Cards** | `pc(p)` (with caption + menu), `pcN(p)` (bare picture), `pcx(p)` (Explore card with a source badge) |
| **Feeds** | `loadLive(reset)`, `doSearch(q)`, `exploreEnsure()` / `exploreLoad(sec,{scale,reset})`, `loadFavorites(reset)`, `trimLive(id)` |
| **Tabs** | `tabsList()`, `paneHTML()`, `slideTo()`, `carStart/carMove/carEnd`, `syncPanes()`, `markTab()` |
| **Gestures** | `gStart/gMove/gEnd`, the pointer + touch listeners, `swallow`, `GSTATS` |
| **Sheets** | `sheet()`, `close()`, `detail()`, `menu()`, `saveSheet()`, `createSheet()`, `boardForm()`, `sourceEditSheet()`, `accountsSheet()`, `settings()` |
| **Actions** | one `switch` on `data-a` attributes — every tappable thing in the app |

**State lives in one object `S`** and is persisted to `localStorage["pb2"]`. Migration code at
the top of the file upgrades old shapes (`Pins`→`Likes`, `Boards`→`Bookmarks`,
`Collages`→`Explore`, global tags → per-source tags).

### `styles.css`

Plain CSS with custom properties for the theme. `--ac` is the red accent, `--bg`/`--tx`/`--mu`
the background/text/muted trio, and `data-theme="light"` on `<html>` flips the palette.

---

## 11. Storage reference

| Key | Store | Contents |
|---|---|---|
| `pb2` | `localStorage` | the whole app state: boards, pins, likes, hidden, theme, columns, source list, per-source tags, current source, sort/filter, the active tab, live feed caches and page counters |
| `pb-auth` | `localStorage` | per-source credentials (`login`, `apiKey`, `passHash`) |
| `pb-keys` | `sessionStorage` | **legacy** — the old session-only key store; migrated into `pb-auth` on first load and then ignored |
| `pb-swipe-hint-v22` | `localStorage` | shows the one-time “swipe left for …” hint |
| `pb-install-dismissed` | `localStorage` | timestamp; hides the install bar for 7 days |
| `pinboard-img-v1` | Cache Storage | up to 320 image files |

Nothing leaves the device except the requests you make to the booru site you sign in to.

---

## 12. Settings reference

| Row | What it does |
|---|---|
| **Image source** | the source manager: add/remove sources, toggle demo artwork, shows the current one |
| **Source accounts** | every site with its own login; shows which are connected; opens the editor |
| **Light theme** | flips the palette (remembered) |
| **Grid columns** | 2 or 3 |
| **Restore hidden pins (n)** | un-hides everything you hid |
| **Viewport** | live readout: CSS pixels × device pixel ratio |
| **Install app** | triggers the install flow |
| **App version** | the running build (e.g. `v22`) |
| **Swipe direction** | *Swipe left = next* / *Swipe right = next* — flip it without touching code |
| **Swipe gestures** | live diagnostics: how many swipes, which input type, the last distance |
| **Clear cache & reload** | drops every cache and reloads — the “it shows me the old build” button |
| **Reset demo data** | wipes `pb2` and starts over |

---

## 13. The swipe / gesture model

The profile tab strip is a **Pinterest-style pager**: the content follows your finger 1:1 and
settles into place when you let go.

* **Direction** — swipe **left = next tab**, swipe **right = previous** (flip it in Settings).
  No wrap-around: swiping past the last tab does nothing.
* **Threshold** — 46 px of travel, or a fast flick of 36 px+.
* **Input** — touch events own touch; pointer events own mouse and pen. They are de-duplicated
  so a device that fires both only produces one gesture. (Pointer-only was tried and failed:
  Chromium fires `pointercancel` when it claims the gesture.)
* **Smoothness** — the incoming pane is **pre-built while the browser is idle**
  (`requestIdleCallback`), so nothing is constructed mid-gesture. The panes move with
  `translate3d` (GPU composited), the wrap height is frozen during the slide (no page reflow),
  and the release is velocity-aware. Measured: worst idle gap 17 ms, max frame 26 ms, no frame
  over 32 ms, no scroll jump.
* **A swipe never opens a pin** — the click that follows a swipe is swallowed.
* **Sheets slide down to close** — any sheet that shows the grabber follows a downward pull
  (85% of the travel, with a light fade) and dismisses past ~104 px or on a fast flick; shorter
  pulls spring back, a scrolled sheet scrolls instead, and the click after a real drag is
  swallowed too. Post details, Related art, tag feeds, Explore feeds and the image viewer keep
  their own gestures.
* **Diagnostics** — Settings → *Swipe gestures* shows what the machine saw.

---

## 14. Device support

Built for a **2412 × 1080** phone (and anything else):

| Physical | CSS viewport | Device pixel ratio |
|---|---|---|
| 2412 × 1080 | 360 × 804 | 3× |
| — | 393 × 877 | 2.75× |
| — | 412 × 919 | 2.625× |

* Fluid layout — verified by real browser renders at all three widths with **no horizontal
  overflow** and **no overlap** between the tab strip and the settings gear.
* `100dvh` heights for the tall 20:9 screen, `clamp()` type scaling, and a compact pass at
  ≤ 380 px.
* `-webkit-text-size-adjust: 100%` stops Android's “large font” setting from inflating the tab
  labels and pushing them under the gear.
* The profile header is a CSS grid (`minmax(0,1fr) 40px`) so the gear owns a fixed column and
  the tabs can never slide under it.
* The 430 px column is desktop-only; phones get the full-bleed layout.

---

## 15. Testing

Run the local-only regression suites from the project root:

```bash
npm test                         # Node unit/contract tests plus the two Python HTTP suites
npm run test:unit                # all local Node *.test.cjs suites; live-source tests excluded
npm run test:python              # production and private-proxy tests using local fixtures
```

The current fixture-driven browser regression subset requires the local preview on port 8000,
Playwright, and Chromium:

```bash
npm install                      # Node.js 22+; includes Playwright and axe-core
npx playwright install chromium  # install the browser binary once
npm start                        # in one terminal; serves port 8000
npm run test:browser             # in another terminal
```

`test:browser` exercises the current Glint shell, Explore layouts/navigation, Related-art image
sliders and See more feeds, small Like/bookmark image markers, pixel-continuous post/Related-art crossfades, tag-feed swipe/close behavior, drag-down-to-close sheets, post-close thumbnail retention,
scrolling/performance, video playback, Drive-status semantics, large local bookmark storage,
and tag pagination. Its axe suite checks WCAG 2.1 A/AA on Home, Explore, Bookmarks, Search,
Related art and Settings in both themes at phone and desktop widths. All source/API traffic in
this subset is fixture-driven. It does not use real account credentials or call upstream
services.

Additional historical browser tests remain under `tests/`; some were written against earlier
navigation and DOM selectors and are not part of the current aggregate command. Do not treat
them as current UI acceptance tests without first updating their selectors and expectations.


---

## 16. Deploying

Pick any HTTPS host — everything is relative, so sub-paths work.

### Netlify (easiest)

Drag the folder onto [app.netlify.com/drop](https://app.netlify.com/drop). `netlify.toml`
publishes the root and redirects `/api/proxy` to `netlify/functions/proxy.js`; `_headers` sets
the cache and content types.

### Vercel

```bash
npx vercel
```

`vercel.json` wires `/api/proxy` to `api/proxy.js` and sets the headers.

### Cloudflare Pages

The project includes a Pages Function at `functions/api/proxy.js`; it uses the shared allow-listed
proxy core, enforces the same request-size limit, and serves `/api/proxy` without a redirect.
`wrangler.jsonc` enables `nodejs_compat` for the shared CommonJS proxy core. Node.js 22 or newer is
required for the pinned Wrangler CLI.

**Local Pages preview** (after `npm install`):

```bash
npm run pages:dev
```

This builds the static app into `dist/` and starts a local Pages preview. To build without starting
Wrangler, run `npm run build:pages`.

**Git-connected Pages project:** choose the repository root as the project root, set the build
command to `npm run build:pages`, and set the build output directory to `dist`. Keep the Functions
folder at the repository root. The `wrangler.jsonc` file supplies the Pages output path and
compatibility settings. No proxy secrets or environment variables are needed for public booru
reads; the proxy deliberately forwards only hosts listed in `proxy-policy.json`.

**Deploy to the live `aiastin.pages.dev` project:** from the repository root, on Node.js 22 or newer,
run `npm install`, authenticate once with `npx wrangler login`, then deploy with:

```bash
npm run pages:deploy
```

This script rebuilds `dist/` and explicitly targets the `aiastin` Pages project. Keep the shell's
working directory at the repository root: Wrangler must see the top-level `functions/` directory as
well as `dist/`. A dashboard drag-and-drop deployment uploads static assets but does **not** compile
Pages Functions, so it leaves `/api/proxy` missing; use Wrangler for this project. A Git-connected
Pages project can instead build from the repository root with `npm run build:pages` and output
`dist`, while keeping `functions/` at the root.

After deployment, verify `/api/proxy` on the live origin: an `OPTIONS` request should return `204`,
and `GET /api/proxy?u=https%3A%2F%2Fexample.com%2F` should return a JSON `502` (the test host is
intentionally not allow-listed). If `/api/proxy` returns the app's HTML with status `200`, the
Function was not deployed. For Google Drive sign-in on a `*.pages.dev` preview, add that preview
origin to the Google OAuth client’s allowed JavaScript origins. Do not put source credentials in
Cloudflare environment variables; the app stores them locally and sends them through the private
proxy envelope.

### GitHub Pages

Push the folder, then **Settings → Pages**. There is **no server-side runtime**, so the proxy
is unavailable: only Derpibooru, e621 and Anime Pictures will load. To get the rest, deploy the
proxy elsewhere and point the app at it.

### Anywhere else

Serve the folder statically and expose `GET /api/proxy?u=…` from any small backend. A Cloudflare
Worker is ~20 lines and works.

### The APK path

`server.py` (or the function) is designed to ship **inside** the app. Wrap the project with
Capacitor; `sources.js` will prefer the native HTTP plugin and no proxy is needed at all.

---

## 17. Shipping an update

1. Edit your files.
2. Bump the version in **four** places — they must agree, or the browser will serve you a mix:

   | File | Change |
   |---|---|
   | `app.js` | `const APP_VERSION = "v23";` |
   | `index.html` | `?v=23` on `styles.css`, `sources.js`, `app.js` **and** `window.__PB_BUILD="v23"` |
   | `sw.js` | `const VERSION = "pinboard-v23";` and the three `?v=23` entries in `PRECACHE` |
   | `README.md` | a changelog entry |

3. Deploy.
4. Installed users get the **“New version available”** bar → **Update**. Nobody is
   force-reloaded mid-session.
5. If someone still sees the old build, **Settings → Clear cache & reload** fixes it, and the
   build-stamp self-heal does it automatically.

---

## 18. Customising

| Thing | Where |
|---|---|
| **Icon** | edit the colours/letter in `generate-icons.py`, run `python3 generate-icons.py`, bump `VERSION` in `sw.js` |
| **App name** | `manifest.webmanifest` (`name`, `short_name`) and the `<title>` in `index.html` |
| **Colours** | `styles.css` → `--ac` (accent), `--bg`, `--tx`, `--mu`; the manifest `theme_color` / `background_color` |
| **Default columns** | `app.js` → `DEF.cols` |
| **Sources shown by default** | `app.js` → `DEF.srcs` (e.g. `["danbooru","yandere"]`) |
| **Default source** | `app.js` → `DEF.src` |
| **Swipe direction** | default in `app.js` → `DEF.sw` (`"left"` = swipe left = next tab) |
| **Proxy location** | `app.js` → `DEF.proxy` (e.g. `"https://your-proxy.example/api/proxy"`) |
| **Booru allow-list** | `server.py` → `ALLOW`; the same list in `netlify/functions/proxy.js` and `api/proxy.js` |

---

## 19. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **The app shows an old build** | Tap **Update** on the version bar, or **Settings → Clear cache & reload**. The build stamp self-heals it too. |
| **“Install app” does nothing** | You are not on HTTPS (or `localhost`). iOS has no install API — use *Share → Add to Home Screen*. |
| **A source never loads** | It may be one of the **off** sources, or it may need a key (Gelbooru). Check **Settings → Image source** for the note next to the site. |
| **“Invalid API key”** | The key is wrong, or it belongs to another account. Danbooru keys can also be restricted to an IP. Generate a new one from your account page. |
| **“Likes” shows nothing but says there are no favourites** | Your favourites may be private (Danbooru: a paid feature), the username may be spelled differently (the app retries with Danbooru's own spelling), or the account genuinely has none. |
| **“No favourites on … yet”** | The account has no favourites yet — favourite a post on the site and reload. |
| **Images are broken but the feed loads** | Danbooru's CDN needs the proxy for its images. Make sure `/api/proxy` is reachable and allows `cdn.donmai.us`. |
| **Everything fails with a CORS error** | The proxy is not running or the allow-list is missing that host. Check the host against `ALLOW`. |
| **The feed is empty on GitHub Pages** | Expected — GitHub Pages has no runtime, so the proxy is unavailable. Deploy the proxy elsewhere. |
| **The swipe does nothing** | Check **Settings → Swipe gestures**: it shows whether the machine saw the gesture at all and which input type it used. |

---

## 20. Known limits & roadmap

**Limits today**

* Push notifications and background sync need a backend — not included.
* Pins you create are generated artwork, not uploads. Real uploads would need IndexedDB or
  object storage.
* No Pinboard cloud account or bookmark sync. Source accounts/favourites are separate remote integrations.
* The local proxy may cache anonymous public JSON for 120 seconds. Account reads/writes are private and never shared-cached.
* Source Likes require an implemented adapter and complete credentials. Native Boorusama login support does not automatically enable a PWA preset.
* Ratings are **unrestricted** by default (like Boorusama); tags are passed through as-is, so
  `rating:safe` works on the sites that understand it.

**Natural next steps**

* Real image uploads (IndexedDB + a blob backend).
* A “collections” concept that spans boards and sources.
* Offline reading of already-visited boards.
* Pushing the proxy into the bundle for the APK build.

---

## 21. Privacy & safety

* Browser local storage is **not encrypted**. Trust the device and every script served
  by the deployment. Password hashes/session cookies are secrets too.
* Authenticated traffic passes through **this deployment's proxy and the selected
  original source**. The proxy necessarily handles credentials; use trusted HTTPS hosting.
  Moebooru passwords are hashed locally with each site's own salt; raw passwords are
  neither persisted nor sent by the app.
* Private account requests use POST envelopes, no credential-bearing proxy URLs,
  `no-store, private` responses, allow-listed HTTPS hosts and no credentialed redirects.
* The service worker bypasses all API traffic. Updates remove unsafe old runtime
  entries while preserving local saved data and normal cached media.
* No automatic mutation retries or anonymous/alternate-transport fallbacks are used.
  Uncertain results require a read-only **Recheck** before another action.
* The Python server, Vercel entry point and Netlify entry point share the same contract.
  When deploying, include **`proxy-core.cjs` and `proxy-policy.json`** as well as the
  existing proxy entry files. Do not log request bodies or authentication headers.
* For the complete source-specific privacy/setup guide and verification limitations,
  see **[SOURCE-ACCOUNTS.md](SOURCE-ACCOUNTS.md)**.

---

## 22. Full changelog (v1 → v22)

### v22 — the Likes tab actually finds your favourites
* **Danbooru was answering with nothing.** The search was `tags=fav:self`, but Danbooru looks
  the user up *by name* (`User.find_by_name`) — there is no `self`, so the query matched nobody
  and came back empty **without an error**. It now asks for the account by name:
  `ordfav:<your login>` (newest favourite first), with `fav:<your login>` as a fallback. If the
  name is spelled differently, the app asks Danbooru who you are (`profile.json`) and retries
  with its own spelling.
* **The tab now loads however you reach it** — tapping it, swiping into it, opening it from a
  link, or right after you save your details. Only tapping used to trigger the load.
* **No more dead ends.** The button always re-fetches, a 30-second timeout stops a hanging site
  from freezing the tab, and the empty state says what actually happened. A failed load shows
  the site's own message plus **Try again**.
* A **Reload** chip sits under the Likes heading.

### v21 — Likes come from the site, Bookmarks stay ours, and the top “+” edits your source
* **The “•••” button is off the feed pictures.** A card is now just the image — tap it and the
  post opens with Like / Share / Save.
* **The top bar “+” is now a pencil.** It opens **Edit *source*** for the current source:
  username, API key (or password), and optional tags for that source's feed, with
  **Test connection** and **Remove details**. Details are stored per source
  (`localStorage["pb-auth"]`) and survive a reload — the old session-only store lost everything
  on refresh. yande.re's password is hashed locally and never kept in clear.
* **Likes and Bookmarks are two different things.** *Likes* is fetched from the source's own
  API; *Bookmarks* is universal — your boards plus every pin you liked or saved (the
  **Liked / Saved** chips live there now).
* **The tab row follows the source.** With details written you get **Likes · Bookmarks ·
  Explore**; without them **Bookmarks · Explore**. Switching source re-checks it, and removing
  your details hides it again.
* **Settings → Source accounts** lists every site and opens the same editor.
* A wrong API key can no longer break the feed (it retries anonymously) and is reported in the
  site's own words.

### v20 — a tighter, titleless home feed
* Corner radius 22 px → **16 px**; gutters 8 px → **4 px**; a 4 px grid edge.
* **No title captions in the home feed.** Search, profile and board cards keep theirs.

### v19 — a cleaner profile header
* The avatar is gone from the profile bar; the row reads **Likes · Bookmarks · Explore**.
* **Boards** → **Bookmarks**, **Collages** → **Explore** — and Explore is a live **mixed feed
  from every source in your row**, interleaved, with a source badge on each card.

### v18 — switching source starts you at the top
* Tapping another source always opens it at the very top, including while a page is still
  loading, and on the search screen (which re-runs against the new source).

### v17 — a spinner instead of “Load more”
* Every loading label is gone. The feed ends in a spinning circle that is still tappable, and
  the “Danbooru selected”-style announcements were removed.

### v16 — only the sources you pinned
* The Home row shows **only your pinned sources** (default: Danbooru, yande.re) plus a **+**
  next to them. No “All”, no demo board tabs.

### v15 — the source tabs, in the old tab style
* The “Ai news Art” tab was replaced by the real source tabs, rendered in the **exact** font,
  size and style that tab had.

### v14 — the booru stage
* **16 sources** wired up with a data-driven registry, a transport layer
  (native → direct → proxy), the proxy in three flavours, **live search**, **infinite scroll**
  (37 → 211 posts verified), and per-source accounts.
* Ratings unrestricted; yande.re works.

### v13 — smooth swipe
* Pre-built hidden panes, GPU compositing, a frozen wrap height, a velocity-aware release.
  Worst idle gap 17 ms, max frame 26 ms, no frame over 32 ms, no scroll jump.

### v12 — Pinterest's native pager
* Content follows the finger 1:1, the incoming tab arrives from the correct edge, and
  **Settings → Swipe direction** flips the mapping without a code change.

### v10 — the swipe actually works on a real phone
* Touch events own touch, pointers own mouse/pen, the gesture is threshold-based, and the
  click after a swipe is swallowed.

### v7 — the tab row
* Profile tabs became **Likes, Boards, Collages** with a bigger font; the removed *Pins*
  content became the **Liked / Saved** chips inside Likes.

### v3 — device scaling
* 2412 × 1080 → 360 × 804 / 393 × 877 / 412 × 919 CSS viewports; no overflow at any size.

### v1 — the PWA conversion
* Manifest, icons, service worker (offline), install/update UX, share target, shortcuts.

---

## 23. References

* **Boorusama** — the reference implementation whose site registry this project follows:
  [github.com/khoadng/Boorusama](https://github.com/khoadng/Boorusama).
* **Danbooru API help** — <https://danbooru.donmai.us/wiki_pages/help:api>
* **Danbooru favourites** — <https://danbooru.donmai.us/wiki_pages/help:favorites>
* **Pinterest's swipeable feeds** — the pager behaviour this app imitates.
* Every booru site keeps its own rules about what may be fetched and how; this app only asks
  for public posts, plus your own favourites when you sign in.

---

*Pinboard — made for one person, on one device, offline-friendly.*


---

## 21. v65 production hardening

v65 is the production-readiness pass over v64. It keeps the source-favourites/Likes
semantics and all saved data, and fixes defects that were observed in real use.

### Fixed

- **Interrupted animations no longer break gestures.** A short, cancelled horizontal
  drag used to leave the feed offset and the source underline mid-way; a multi-touch
  cancellation did the same. Gestures are now cancelled/rewound consistently, the
  browser hides the intermediate frames, and a new gesture finishes the previous
  visual transition instead of racing it. Consecutive post → related-art → post
  round-trips are smooth with zero waits between them.
- **Requests cannot cross sources.** Every Home request is keyed by source, query and
  account version, has its own abort controller and an 18 s deadline. A slow response
  for the old source cannot overwrite the new one, cannot clear its own spinner for a
  different request, and is aborted on navigation. Pagination state per source is kept
  (it was reset to page 1 on some tab changes).
- **Failures are visible and recoverable.** Home shows the source error with a Retry
  button instead of an endless idle spinner; Explore names the sources that failed and
  retries only those; a broken post image stays usable with an in-place “Retry image”
  control instead of a dead “open full-screen” action.
- **Malformed saved settings can no longer blank the app.** State is normalised before
  use. A record that cannot be read is preserved, never silently overwritten, and a
  recovery/repair notice offers a JSON copy. Oversized state is re-saved compactly
  (feeds/Explore first) so bookmarks are never lost to quota.
- **Storage failures are reported.** A bookmark that cannot be written is rolled back
  with a visible message instead of appearing to succeed. Backup export/import
  (bookmarks + saved metadata only, allow-listed fields, merge without duplicates) is
  available in Settings; “Reset” asks first and keeps source credentials.
- **Unsafe markup is impossible.** All saved/feed values are escaped, image URLs are
  validated (no `javascript:`/`data:text`, no embedded credentials), and inline event
  handlers are gone. The shell now runs under a strict CSP
  (`script-src 'self'`) with external `boot.js`/`runtime.js`, so a source that returns
  HTML/JS through the proxy cannot execute in the app origin.
- **Proxy boundary.** Public proxy traffic may only be a GET or the one read-only
  legacy GraphQL query; every write must use the authenticated private envelope. Auth
  headers are restricted to the two sources that use Basic auth and to a safe token
  pattern. All upstream responses carry `default-src 'none'; sandbox` (defence in depth
  for images opened directly), a request-wide 18 s deadline, body limits that fit
  serverless response limits, a bounded in-memory cache, and a static server that
  publishes only the app shell (no source files, tests or directory listings).
- **Accessibility and motion.** Every dialog is a focus trap with focus restored to the
  control that opened it, the background is `inert`, Escape closes it, cards/settings
  rows/switches are keyboard operable with correct roles, the profile tabs are a proper
  tab list, and `prefers-reduced-motion` disables transforms, WAAPI animations and
  smooth scrolling. axe-core reports no WCAG 2.1 AA violations on Home, Search,
  Profile, Source catalogue, account setup and post details in either theme.
- **Lifecycle leaks.** Re-rendering the profile disconnects the previous
  `ResizeObserver` and timers (12 renders leave one observer, leaving Profile leaves
  none), pending feed loads are aborted on navigation, and a new worker version keeps
  unrelated caches on the same origin.
- **Multi-tab accounts.** Removing/replacing an account in one tab invalidates the
  other tabs' account-scoped state, cancels queued writes and never replays them.

### Newest / Popular on tag feeds and related art (v65.1)

**Home has no order control** — a source tab always shows that source's own newest
uploads, so nothing is applied silently there and no extra sort token is ever spent.

The tag feed (opened from related art or from any tag in Post info) has **one** order
control that switches with a tap:

- **Newest** (default) is the source's own upload order and adds **no** sort token.
- **Popular** asks the source to rank server-side: Danbooru/Moebooru/e621 `order:score`,
  Gelbooru `sort:score:desc`, Philomena `sf=score&sd=desc`. Results are never re-sorted
  from one loaded page, and popularity pages use server pagination (no ID cursor).
- Sources with no real popularity order (Anime Pictures, e-shushuu, disabled presets) get
  a **disabled** control with the reason instead of a guessed order.
- The choice is per source (`S.forder`), survives reload, and never changes the Search
  sort or the Likes/Bookmarks controls. Oldest-by-upload is still supported internally
  and by restored history entries, but it is not offered in the tag-feed UI.

**Related art** carries the same Newest / Popular chip in its header and re-loads every
related section in that order; Load more inherits it.

**Tags are entry points.** The character / series / artist names on a post and every chip
in Post info are buttons: tapping one opens that tag's own feed on the same source (with
its count, sort control, pagination and Back to the post). Names are sent with the
source's namespace where the source uses one (`character:`, `artist:`, `copyright:`),
and a vertical swipe that starts on a metadata name still opens related art.

### Deployment

- Local: `python3 -u server.py` (or `PORT=… python3 server.py`). `PINBOARD_TEST_MODE=1`
  additionally serves temporary `/_*.js` service-worker fixtures used by the
  upgrade tests; leave it unset in production.
- Vercel: `api/proxy.js` + `proxy-core.cjs` + `proxy-policy.json`; `vercel.json` sets
  the security headers and `maxDuration` 30. Netlify: `netlify/functions/proxy.js`,
  `netlify.toml` bundles the shared core and maps `/api/proxy`; `_headers` mirrors the
  security headers.
- Any static host works, but Likes/private requests need one of the three proxy
  implementations. HTTPS is required for WebCrypto password hashing and service
  workers.

### Still not verified for you

- **No real source-account credentials were provided, so no authenticated Like/Unlike
  was executed against a live website.** Writers are covered by API-shaped tests.
- Deployment-specific behaviour (hosting limits, egress IP allowlists, Cloudflare
  challenges) and the upstream sites can change; the app reports those failures rather
  than inventing success.
