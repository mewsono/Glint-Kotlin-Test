# Pinboard v65 — production hardening

v65 keeps the v64 Likes/Bookmarks model and fixes what broke in real use.

## User-visible

- Canceled/interrupted swipes no longer leave the feed or source underline displaced;
  rapid post → related art → post gestures no longer miss.
- Home and Explore show a real error with **Retry** instead of a spin that never ends.
- **Explore is now per source** (Boorusama-style): the tab follows the source selected on
  Home and shows only that site's real views — Danbooru Popular / Hot / Most viewed /
  Popular searches, Moebooru Popular with Day / Week / Month / Recent, e621 Popular with
  Day / Week / Month. Sources with no explore page say so instead of inventing one; each
  view has its own date/period control, its own server-side pagination and its own Retry.
- **A sync light on your avatar**: the profile button in the bottom bar now wears the Drive state —
  red when sync is off or broken, a green arc turning while a sync runs, steady green when the
  device and Drive agree. The face never rotates, and the state is in the accessible name too.
- **Google Drive sync**: bookmarks, their cached details, boards, hidden pins, custom sources and
  the settings that matter now sync between devices through one hidden file in your own Drive
  (`appDataFolder`), ported from the BooruHub APK's sync design — merge by newest change,
  tombstones so deletions stick, upload only when something differs, 4-second auto-sync, and no
  sign-in window ever opened by a background sync. Source API keys stay off unless you switch
  them on. Setup needs your own OAuth Client ID (Settings → Google Drive sync).
- **A large library stays fast**: 5,000 bookmarks used to draw 5,000 cards (861 ms), scan every
  record to answer "is this saved?" per card, re-normalise all of them on every keystroke (up to
  531 ms), and — worst — **fail to save at all** once the cached pins passed the ~5 MB storage
  budget. Now the library draws the first screenful and appends the rest in place as you scroll
  (78 ms to open), lookups are a `Set`, search text is built once per post (7–17 ms per
  keystroke), and a full store **grades each saved post down instead of failing**: original-file
  URLs first, then the general tags of older saves, then (only past ~14,000 posts) the cached
  previews. **Every bookmark record is always saved**, artist names stay searchable at every
  tier, and anything that was shed is fetched again the moment you open that post.
- **yande.re artist/character names arrive with the post**: Moebooru tags are unprefixed, so the
  app only knew a name was an *artist* after a second request — the post page showed blanks and
  filled them in a moment later. The feed now requests the site's tag categories in the same call
  (`include_tags`), and every category learned is cached on the device, so the names are there at
  first paint. Costs about 4 KB per 40 posts.
- **Smoother feed**: the next page is **appended in place** instead of re-rendering the screen —
  cards, pictures and their decoded bitmaps are kept, so scrolling through a long feed no longer
  flashes or jumps; storage writes are **coalesced** (one write per idle moment, and immediate
  for bookmarks/imports/sources); the scroll handler is **one `requestAnimationFrame` per frame**
  with the next page requested 1200 px early; offscreen cards use **`content-visibility:auto`**
  and the first screenful loads eagerly at high priority while the rest stays lazy.
- **The whole UI is offline**: every file the interface needs is precached (tolerantly, so one
  missing icon can never break the install), shell files are served from the cache in a single
  frame and refreshed behind you, and the feed/search/post JSON plus their pictures are kept in
  their own buckets. Previously the app opened offline but the feed was empty — proxied CDN
  pictures and every API reply were excluded from the cache by the `/api/` guard. Settings,
  tabs, search, post view and cached pictures now all work with the network switched off.
  Videos are still streamed, never stored; credentialed and private requests are still never
  cached, and only the *Update* button can reload the page.
- **Play marks show on video posts again**: the badge was painted *behind* the picture. Feed
  images carry a fade-in animation and therefore get their own compositor layer, which lifted
  them over the mark — so an Explore view opened from “See more” (e.g. Most viewed) showed plain
  stills for videos. The mark now stacks above the image in every card.
- **Favouriting is reliable**: the ♥ no longer sits disabled while the app reads the account
  (a failed or slow read used to leave it dead, which is why it "only sometimes worked"). A tap
  now reads the truth and favourites in the same action, taps that land during the read are
  remembered, a read is retried once, and a heart is never left untappable — a denied or
  timed-out write keeps the heart live with **Recheck** beside it. Moebooru sources
  (yande.re / Konachan / Sakuga) no longer re-login for every status read.
- **Fast source switching is clean**: tapping through danbooru → yande.re → konachan no longer
  paints the previous site's pictures under the new tab. Only the source you stop on is fetched
  (a 150 ms settle window cancels the one you flicked past), the feed is filtered to the selected
  source, at most one outgoing feed is ever on screen, and a quick tap skips the slide entirely.
  Each feed keeps the source's own newest-first order top to bottom.
- **Image quality is a setting**: Settings → *Feed image quality* (Thumbnail · fast / Sharp),
  *Post detail quality* (Sample / Original) and *Full-screen quality* (Sample / Original). Each
  place picks its own file from the three the source offers, the choice is remembered, and a
  missing size falls back to what the post has.
- The **top-bar source edit button is gone** (settings stay one tap away in
  Settings → Image source → Features & login). Explore's header is now just the **source
  name as a small muted caption** — no "Explore" label, no repeated line — and the dead space
  above the first view is tightened. Explore also asks for its own data when the pane is
  built, so it fills in without waiting for an idle callback.
- **Custom sources**: the catalogue sheet adds any booru by name + address + API type, with a
  **Guess the API type** button that asks the address itself. New sources are verified with a
  real request, join the source row, persist across reloads and can be deleted again.
- Explore polish: **equal square thumbnails** at roughly half the screen wide, **Popular
  searches removed**, a source with a single view rendered as a **two-per-row infinite
  feed with no See more**, a **play mark on video thumbnails**, and Explore posts now open
  normally instead of claiming *"This post is no longer available."*
- **Video playback.** A video post now opens a real player — native controls, inline on
  mobile, the preview as poster, looped, with the source file streamed directly from the
  CDN over Range requests (seeking included). The proxied copy is a one-shot fallback; a
  file that cannot play reports *"Video could not play"* with **Retry video**. The local
  dev server's proxy now passes `Range` through and streams media (206 + `Content-Range`)
  instead of buffering whole files, and a drag that starts on a player no longer triggers
  the post swipe gesture. The player sits centred in the post page, exactly like a
  picture, and never overflows its box.
  A failed image stays usable and offers **Retry image**.
- Settings gained **Export bookmark backup** and **Import bookmarks (merge)**; reset
  asks for confirmation and no longer silently wipes a corrupted save.
- Unreadable saved settings no longer produce a blank screen; they are preserved and a
  recovery copy can be downloaded.
- Keyboard and screen-reader support: focus-trapped dialogs with Escape, focus return,
  role/tab semantics, switch roles, 44 px touch targets and a real `h1`. Reduced-motion
  removes transforms and smooth scroll.
- Honest labels: “Messages” is reported as unavailable, and the local demo pin creator
  says it creates a device-only pin rather than publishing.

- **Tappable tags and sorted related art**: the character / series / artist names on a
  post and every tag chip in Post info now open that tag's own feed, and related art has
  the same Newest / Popular chip as the feeds (the tag feed keeps Newest/Oldest and gains
  Popular as one control that switches on tap). One tap on a name is a filter; a swipe
  that starts on it still opens related art.
- **Newest / Popular where it belongs**: Home is now deliberately control-free (a source
  tab is simply that source's newest uploads). The order chip lives on the tag feed and on
  related art, uses the source's real server-side score ranking, keeps Newest token-free,
  persists the choice per source and is honestly disabled where no popularity order
  exists. Explore keeps its own chip.

## Proxy and source fixes (worker v65.22)

- **Every enabled source was re-measured against the live network.** Danbooru, yande.re,
  Konachan, Sakugabooru, e621, Derpibooru, Ponybooru, Anime Pictures and e-shuushuu list
  40 posts each with pictures that actually decode; Gelbooru explains its missing key.
- **Anime Pictures: pictures appear again.** The preview CDN switched to AVIF-only
  (`_sp/_cp/_bp.avif`); the old `.jpg` URLs 404'd, so the grid filled with empty tiles.
- **e621/e926: pictures appear again.** Their CDN sends `cross-origin-resource-policy:
  same-origin`, so the browser dropped every `<img>` (ORB). Those hosts now go through the proxy.
- **e-shuushuu works again** after the site's 2026 rebuild: `per_page` pagination, tag ids
  resolved from names (`api/v1/tags?search=`), `sort_by=favorites` for Popular,
  `sort_order=ASC` for Oldest, and a `/search?tags=` fallback for free text.
- **Gelbooru failures read as advice**, not `HTTP 401`, and `donmai.moe` (a permanent
  Cloudflare challenge) is no longer a Danbooru fallback.
- **Allow-list gaps closed:** `assets.yande.re`, `cdn.e-shuushuu.net`, `oavatars.anime-pictures.net`
  and the Sankaku media hosts.
- **New test:** `tests/proxy-sources.live.cjs` — allow-list refusals, all sources, proxied
  picture hosts, decoded images, tag search and `206` Range video streaming.

## Reliability and security

- Per-source/query/account request generation with abort and deadline; stale responses
  can never land in another source.
- State normalisation prevents malformed storage from breaking startup; quota/save
  failures roll back and are reported; feed/Explore snapshots are compacted before
  bookmarks.
- Every dynamic value escaped; media URL validation; no inline handlers; strict CSP
  (`script-src 'self'`) with external boot/runtime; sandboxed proxy responses; public
  proxy mutations rejected; auth restricted to the two Basic-auth sources; bounded
  bodies, bounded cache, 18 s deadline; static server publishes only the shell.
- Worker v65 purges only Pinboard caches, keeps normal media, and never caches API
  responses (verified by an actual v64 → v65 upgrade test).
- Cross-tab credential removal cancels queued writes and invalidates old-account state.

## Version stamp

The visible app version stays **v65** — the preserved v64→v65 upgrade tests pin that
exact string — while the service-worker cache was bumped to `pinboard-v65-3`, so
installed copies reliably pick up the new feed-order UI on the next update prompt.

## Verification

See [QA-v65.md](QA-v65.md). No real account credentials were supplied and no
authenticated write was sent to a live website.
