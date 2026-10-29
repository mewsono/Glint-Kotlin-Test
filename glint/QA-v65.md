# v65 verification — 24 October 2026

> Historical QA record for the v65 snapshot, not a current test run. The current Glint audit and
> canonical commands are in [GLINT-AUDIT.md](GLINT-AUDIT.md) and the project root `README.md`.
> Earlier browser-suite counts and live-source notes below describe that historical snapshot.

## What was inspected

The uploaded archive was integrity-checked (61 files) and every file matched the
workspace v64 project byte-for-byte before being copied into a separate `v65` folder.
v64 was left untouched. The audit covered the app shell, service worker, all source
adapters, both proxy implementations and every regression test.

Defects that were reproduced before being fixed:

1. A cancelled/aborted horizontal source drag left the feed translated and the source
   underline stuck between two tabs (also after a second finger landed).
2. The regression for post swipes only passed because the test waited for a 300 ms
   animation between gestures; without that wait, a real second gesture was swallowed.
3. Page transitions reused an in-flight WAAPI animation; leaving the viewer, the image
   viewer's zoom cleanup or a settings screen could produce stale buttons/frames.
4. Only `String(S)` was guarded when loading `pb2`; a malformed field (for example
   `likes` saved as a string) aborted every render after `app.innerHTML` was cleared,
   leaving a permanent blank screen. Nothing ever reported a failed `localStorage`
   write either, so a bookmark could appear saved and be lost on reload.
5. The settings sheet clipped its "Swipe direction" control (unreachable/overflowing),
   the source row could hide the “+” control, and the profile tab strip scrolled the
   wrong way when “swipe right = next” was selected.
6. Source data was interpolated into HTML attributes without escaping in the card
   markup, and images/cards used inline `onerror`; a source value containing a quote
   could inject attributes, and no CSP was present.
7. A slow Home/Explore request for the previous source could overwrite the new source's
   feed or clear the loading state of another request; leaving Home could still append
   results later from the scroll auto-loader.
8. Serving the project directory exposed source files and test files; the proxy was a
   general POST passthrough for any allow-listed host and could be used to read an
   upstream HTML/JS response in the app's own origin.
9. `inert` was used as a proxy for “background enabled”, which conflicted across
   overlapping dialogs, and focus was never trapped or restored.

## Fixes

See [RELEASE-NOTES-v65.md](RELEASE-NOTES-v65.md) for the user-facing list. Summary:
gesture interruption/rewind, request generations with abort and deadlines, visible
retry/error states, state normalisation with a non-destructive recovery copy, save
rollback plus backup export/import, entity-safe rendering and validated media URLs,
strict shell CSP, sandboxed proxy responses, read-only public proxy policy with scoped
auth, static allowlist, focus-trapped dialogs with Escape and focus return, keyboard
operable cards/settings, proper tab/tablist roles, reduced-motion support, pager
observer/timer cleanup, settings layout fixes and cross-tab credential cancellation.

## Test results (all executed on this workspace)

- **15 offline Node suites** (`tests/*.test.cjs`, excluding the archived credential
  live test) — pass, including the two new production tests.
- **2 Python suites** (`proxy-private.test.py`, `production.test.py`) — 14 tests pass,
  the latter against a real local HTTP server.
- **21 browser suites** (19 preserved + feed-order + post-tags-related) — pass at their configured phone/desktop widths,
  including the actual v64 → v65 service-worker upgrade, the masonry cache repair,
  source Likes at 360/390/435/1200, post swipes at 390/360-legacy/1200, related art,
  tag feeds, tag pagination, pinch/file info, bookmarks/search/grid, feeds, search
  header/tags/recents/two-tag, post details, tags viewer, source links and
  auto-feed upload.
- **New `production.browser.cjs`** at 360/390/435/1200: malformed-storage recovery;
  injected attribute/URL payloads stay inert; keyboard-only open + focus trap + Escape
  + focus return; **seven consecutive post → related-art → post round-trips with no
  waits at all** reusing exactly one history entry; cancelled and multitouch source
  drags leave DOM state unchanged; quota failure rolls back with a visible notice;
  settings/add-source controls are not clipped; no horizontal overflow; no page errors.
  Also: backup export contains bookmarks/metadata only (no keys/sessions/hearts) and
  import merges without duplicates or partial state; failed images stay usable with a
  working retry; a stale source response cannot cross into another source; reduced
  motion leaves no long animations; reverse direction maps to the correct pane; 12
  profile renders leave exactly one `ResizeObserver` and leaving Profile leaves none;
  removing an account in another tab cancels that tab's queued write.
- **New `feed-order.test.cjs`** — Popular maps to `order:score` for Danbooru/Moebooru/e621,
  `sort:score:desc` for Gelbooru and `sf=score&sd=desc` for Philomena; popularity is
  server-paginated with no ID cursor and is never re-sorted by ID; Newest stays the
  default and adds no token; unsupported sources reject the order without a request;
  an explicit `order:` typed by the user is preserved.
- **New `feed-order.browser.cjs`** at 360/390/1200 — Home renders **no** order control and
  never sends a sort token even when a popularity choice is stored; Explore toggles Newest
  ↔ Popular per capable source and names the ones left on Newest; unsupported sources show
  a disabled control with a reason and receive no popularity request; Search and Bookmarks
  keep their own independent controls.
- **New `post-tags-related.browser.cjs`** at 360/390/1200 — post-info names and every tag
  chip are real buttons with descriptive labels, a tap opens that tag's feed with the
  source-namespaced query, the tag feed's single control switches Newest → Popular (server
  order, no ID cursor) → Newest with no token, related art re-requests every section in the
  chosen order, the choice is saved per source and inherited by Load more, and a source
  without popularity shows a disabled chip on Newest.
- **axe-core** (WCAG 2.1 A/AA): **0 violations** on Home, Search, Profile, source
  catalogue, account setup and post details, in dark and light themes.
- Anonymous live smoke through the v65 server: Danbooru `landscape rating:g` returned
  40 real records, no page errors, and the Home grid rendered correctly in both
  themes. No account credentials were used and no authenticated write was sent.

## Corrections made to the regression suite

Only assertions whose intent changed were updated, and each is documented in place:

- `feeds.browser.cjs` matched the literal text `caption_should_not_be_visible`
  anywhere in card HTML; the card now carries an accessible `aria-label="View …"`,
  which contains it. The test now asserts the text is not *rendered*.
- `post-swipe.browser.cjs` and `tags-viewer.browser.cjs` asserted `#app.inert === false`
  while a dialog was open. The background is now `inert` for **every** dialog (the
  supported accessibility mechanism) and is released when the dialog closes, which both
  tests now verify.
- `source-likes.browser.cjs` and `search-recents.browser.cjs` expected the v64 build
  string/screenshot name.
- The upgrade test now upgrades v64 → v65 and additionally proves an unrelated cache on
  the same origin is not deleted.

## Not verified / out of scope

- **No real source-account credentials were supplied.** No authenticated Like/Unlike
  was executed against a live website; writer behaviour remains covered by API-shaped
  mocks and the upstream contracts reviewed for v64.
- Deployment-specific limits (Netlify/Vercel response caps, egress IP allowlists,
  Cloudflare challenges) and future source changes are not verified. The serverless
  path is covered by contract tests with a mocked `fetch`.
- Legacy local hearts are still retained only as saved data and are never uploaded.

## Running it

```bash
cd pinboard-pwa-v65
python3 -u server.py            # http://localhost:8000
PINBOARD_TEST_MODE=1 PORT=8001 python3 -u server.py   # serves the SW test fixtures too
```

Browser tests: `NODE_PATH=<playwright> PINBOARD_TEST_URL=http://127.0.0.1:8001 node tests/<name>.browser.cjs`.

## Explore, per source

`tests/explore.browser.cjs` (360 / 390 / 1200 px, fixtures only) covers:

1. Danbooru renders **Popular / Hot / Most viewed** (no Popular searches, and no
   `searches.json` request); the period chip switches Day → Week and reloads **only** that
   view; each thumbnail is an equal square wider than 150 px and only the video post
   carries a centred play mark.
2. **See more** opens the full feed for that view; tapping an Explore post opens it with
   no "no longer available" toast.
3. Switching the Home source to **yande.re** shows one Popular view as the feed: two
   columns, no See more, Day / Week / Month / Recent; **e621** the same for its Popular
   with Day / Week / Month.
4. **Anime-Pictures** (no explore module) shows “no explore view” and makes no request.
5. A `500` on Most viewed shows the server message plus **Retry** and leaves the other
   views populated.
6. Live check against the real APIs: Danbooru 3 views × 12 equal 179 px squares with the
   play mark on its video posts, a tap opens the post; yande.re one view as a 40-tile
   two-column feed with no See more. No page errors; the search screen still renders.

## Video playback

`tests/video.browser.cjs` (360 / 390 / 1200 px, fixture traffic only) uses a 1 KB VP8 WebM
so playback is asserted, not assumed:

1. A video card carries the play mark; a picture card does not.
2. Tapping it opens `<video class="post-video">`: direct CDN `src` (not `/api/proxy`),
   proxied `data-fallback-src`, the still preview as `poster`, `controls`, `playsinline`,
   `preload="metadata"`, no zoom gesture on the wrapper, laid out at a usable size and
   **centred** in the media box (same centre as the picture area).
3. It **decodes and plays**: `readyState >= 2`, `duration` 2 s, `currentTime` advances, no
   failure message.
4. Pictures still open the full-screen zoom viewer.
5. A file that cannot load falls back once, then reports *"Video could not play"* with
   **Retry video**, and Retry requests it again.
6. Explore cards mark their videos too.

Checked by hand against the live APIs: `cdn.donmai.us` answers `Range: bytes=0-1023` with
`206`/`Content-Range`, and the local proxy now streams (`206`, `video/mp4`,
`Content-Range: bytes 0-20138/20139`). Playwright's bundled Chromium ships without H.264, so
an MP4 there ends in a codec error — that is the test browser, not the app; WebM playback is
exercised end to end.

## Custom sources and the Explore header

`tests/custom-source.browser.cjs` (360 / 390 / 1200 px, fixture traffic only):

1. The top bar carries no source edit button; source settings remain reachable from the
   catalogue sheet.
2. Explore renders **no source row**; its header is the source name alone (`Danbooru`) drawn
   at ≤13 px in the muted colour (no second line), and the gap from that header to the first
   view's title is ~9 px. The pane fetches its own sections on build — no tap needed — and
   issues exactly one request per view.
3. The catalogue offers **Add a custom source**; the sheet has name, address and API type.
4. **Guess the API type** asks the address (`posts.json`) and fills the picker with Danbooru.
5. **Add source** verifies it with a real request, registers it, puts it in the source row and
   Home shows its posts under its own source id.
6. It survives a reload (the `pb-custom-sources-v1` record and the row entry both persist).
7. Explore for it shows the honest "no explore view" empty state and makes no explore request.
8. **Delete** removes it from `PB_SOURCES`, the row and storage.

## Image quality

`tests/image-quality.browser.cjs` (360 / 390 / 1200 px, fixture traffic only):

1. Defaults reproduce the old behaviour: feed = the `360x360` preview, post page = the sample
   file, full screen = the original.
2. Settings shows all three rows with both chips each; the feed row starts on *Thumbnail · fast*.
3. Choosing **Sharp** makes every feed tile request the larger file; the value is stored.
4. Choosing **Original** for the post page changes the `post-image` request; choosing
   **Sample** for the full screen changes the `fullscreen-image` request.
5. All three survive a reload (`pb2.iq`).
6. `iqURL` falls back correctly: a post with only a preview uses it for all three places, and a
   complete post resolves thumb→sample, detail→orig, viewer→sample.

## Rapid source switching

`tests/source-switch.browser.cjs` (360 / 390 / 1200 px, fixture traffic, per-source delays
700 / 1200 / 400 ms so the first tap answers last):

1. Danbooru is on screen first; after two taps 40 ms apart the grid is empty (loading) and at
   most one outgoing feed exists.
2. Sampled every 120 ms for ~1.7 s: every tile in `#app` belongs to Konachan, and no second
   outgoing feed ever appears.
3. Yande.re is never fetched at all (the settle window cancelled it); Konachan is fetched once.
4. Once settled: no ghost left, six Konachan pictures, each column newest → oldest, the union of
   the columns being exactly the six posts (nothing lost, nothing duplicated).
5. A slow, deliberate switch still slides and still never mixes sources; going back to a cached
   feed shows only that source's pictures. No page errors at any width.

## Favouriting a post

`tests/source-likes.browser.cjs` (360 / 390 / 435 / 1200 px, mocked source traffic; no real
account is ever written):

1. Opening a post starts a read-only status check. The heart is **not disabled** during it —
   it is `aria-busy`, keeps `aria-pressed="mixed"` and is tappable.
2. With the state forgotten, **one tap** reads the account and then writes exactly one native
   favourite (the old behaviour only checked and returned).
3. A second tap that lands 40 ms later, while the read is still running, is remembered: on an
   already-favourited post it writes nothing (toast: *Already in your … favourites*); on an
   unfavourited post it adds with exactly one write.
4. A denied (403) or rate-limited (429) write leaves the heart **enabled** with the Recheck
   action, no secret or HTML in the message, and no replay of the write.
5. A network failure after the write lands requires a fresh read; the heart recovers on the
   next tap.
6. yande.re: the first read verifies the account, later reads/writes reuse the cached login
   (one `user/authenticate.json`, not one per action).
7. Account switches, post/account races and the "post reached only from Profile Likes" cases
   keep working, and no credential appears in a request URL.

## Video play marks

`tests/video.browser.cjs` now proves the mark is **painted**, not just present in the DOM:
the badge's square is screenshotted, the badge is hidden, and the square must change. This is
checked on an Explore strip cell and in the full Explore feed page opened from “See more”
(the case that used to lose the mark, because `pbFade` promotes the image to its own layer).
`elementFromPoint` cannot be used here — the badge is `pointer-events:none`.

## Offline UI

`tests/offline.browser.cjs` (360 / 390 / 1200 px, a **real** server — no stubs, because the
service-worker cache is what is being tested):

1. One normal visit: the feed loads, the worker controls the page, and the page is loaded
   exactly once (a worker taking control must not reload under the user).
2. The shell is complete in the cache: `index.html`, `styles.css`, `app.js`, `sources.js`,
   `runtime.js`, `boot.js`, `pwa.js`, `manifest.webmanifest`, `icon-192.png`.
3. The API and image buckets hold real entries (first-visit warm start, or one second visit).
4. `context.setOffline(true)` → a reload still shows **Pinboard**, the offline notice, the feed
   with its posts, pictures rendering from cache, and a stylesheet with >100 rules (proving the
   CSS is served, not just the HTML).
5. With no network: a post opens, **Settings** opens with the image-quality rows, the Explore
   pane builds, the search screen renders, and the source row still works.
6. A second cold start offline is just as good, and there are no page errors.

## Smoothness (measured)

`tests/smoothness.browser.cjs` (360 / 390 / 1200 px, fixture traffic):

1. Feed cards report `content-visibility:auto`.
2. The first four pictures are `loading="eager"` + `fetchpriority="high"`; everything past the
   sixth is `lazy` + `low`.
3. Scrolling to the bottom appends the next page: the first picture is **the same DOM node**,
   the same `.col` element is extended, the feed still starts at the newest post, the scroll
   position is kept, and **no long task** is recorded.
4. Thirty scroll steps cause at most one `scrollHeight` read per frame.
5. Twelve consecutive renders produce at most two `localStorage` writes, while a bookmark write
   is immediate.
6. Flicking 24 steps through the loaded feed drops **zero** frames (>50 ms).

## Moebooru tag categories

`tests/tag-types.browser.cjs` (360 / 390 / 1200 px, fixture traffic shaped like a real yande.re
response):

1. The feed request carries `api_version=2` and `include_tags=1`.
2. Before any post is opened, the pin already has `artists`, `characters` and `series` filled and
   `detailsReady:true`.
3. Opening the post paints Character / Series / Artist rows at first paint (`Shirona
   (Canvas+Garden)`, `Miyasaka Miyu`) with **no additional request**.
4. The learned categories are stored in `pb-tag-types-v1`.
5. A later response with **no** tag map still classifies correctly from the stored cache, which
   is what makes the second launch instant.

## Large library (5,000 bookmarks)

`tests/library-large.browser.cjs` (390 px, fixture traffic, 5,000 seeded records + cached pins):

1. All 5,000 records reach storage; opening the library draws **48** cards in **83 ms** with a
   tail marker and a count that still says 5,000.
2. Scrolling appends into the same grid — the first picture stays the same node.
3. Keystrokes stay under 250 ms (measured 7–54 ms); an empty-ish query matches everything, a tag
   query narrows it.
4. Un-bookmarking updates the array, the card and storage.
5. With `setItem` forced to throw above 1.2 MB, `save(true)` still returns true, **all records
   survive**, only cached previews are dropped, and the storage notice explains it.

## Storage tiers under pressure

`tests/library-large.browser.cjs` (part 5–6): with `setItem` forced to throw above 3 MB —

* the save still succeeds and **all 5,000 records** survive;
* every saved post keeps its picture address (`grid`) and its artist/character/series names, so
  cards render and the library is still searchable by name;
* the original-file URLs are the thing that is given up, and a notice explains it;
* the stripped post, opened after a reload, is marked as missing its detail, refetches it, and
  shows Artist / Series again with the original file — not a blown-up thumbnail.

**Regression caught here:** an earlier version of the shedding code wrote the *compact* snapshot
in the `full` path, which silently emptied the offline feed. `tests/offline.browser.cjs` failed on
the second cold start; the full path now writes the full snapshot again.

## Google Drive sync

`tests/drive-sync.browser.cjs` runs two browser contexts as two devices against a fake Drive kept
in the test process (no Google account, no network):

1. Settings shows the Drive rows; the client ID is stored and a connect creates
   `pinboard-data.json` in `appDataFolder` with both bookmarks, their picture addresses and the
   settings — and **no credentials**.
2. Un-bookmarking a post uploads within the 4-second debounce and leaves a tombstone.
3. A second device connects, merges both libraries, receives the newer `cols`, and does **not**
   resurrect the deleted post.
4. A deletion made on the second device propagates back to the first.
5. After the token is cleared, a background sync opens **no** sign-in window (token requests
   stay at the same count).
6. A 403 `accessNotConfigured` from Google is turned into “the Google Drive API is switched off…”.

## The source proxy, against the real network

`tests/proxy-sources.live.cjs` (needs outbound network and a running server, so it is not part of
the offline suite):

| Check | Result |
|---|---|
| Unlisted host, plain `http`, URL credentials, a non-443 port, a fragment | refused `400/403` before any network call |
| Danbooru | 40 tiles, pictures decoded |
| yande.re | 40 tiles, pictures decoded |
| Konachan | 40 tiles, pictures decoded |
| Sakugabooru | 40 tiles, pictures decoded |
| e621 | 39 tiles, pictures decoded (through the proxy — ORB blocks it directly) |
| Derpibooru | 40 tiles, pictures decoded |
| Ponybooru | 40 tiles, pictures decoded |
| Anime Pictures | 40 tiles, AVIF previews decoded |
| e-shuushuu | 40 tiles, pictures decoded |
| Gelbooru | no tiles, and the feed says *"Gelbooru now needs a free API key for reads…"* |
| Tag search | Danbooru `cat_ears` → 20 rows; e-shuushuu `blue hair` → 20 rows |
| Video | e621 webm, `Range: bytes=0-1023` → `206` + `Content-Range: bytes 0-1023/…` |

Command:

```bash
NODE_PATH=/home/user/.tools/browser/node_modules node tests/proxy-sources.live.cjs
```

The same suite was re-run against the Node server (`npm start`, port 8010) and passed all
thirteen checks — including the `206` Range video — so the npm path and the Python path are
interchangeably complete. A static-only server (`python3 -m http.server`) reproduces the
"nothing loads" symptom exactly: `404 /api/proxy`, 0 tiles, “HTTP 404 · Retry”.

## Sync triggers and the large library

`tests/drive-triggers.browser.cjs` (fake Drive, no network): Drive is checked once when the app
opens (<4 s), a bookmark waits ~10 s before uploading, a settings change waits ~4 s, and tapping
the avatar in the nav syncs immediately without waiting for the debounce.

`tests/library-store.browser.cjs` at 5 000 bookmarks: localStorage blob 241 KB, `save()` 26 ms,
all 5 000 pins in IndexedDB, every pin restored after a reload, library opens in 72 ms with 48
cards drawn and a tail marker. `library-large.browser.cjs` was retired — the store test covers the
same scale with the new storage model.

## Drive sign-in origin

Settings → Google Drive sync prints the exact origin to register (`[data-drive-origin]`, verified
at 390 px: `http://127.0.0.1:8001` on the QA server). A sign-in that Google rejects for
`origin_mismatch` — which the app only sees as a closed popup — is reported as: “Google blocked
the sign-in: this page's origin is not registered for your OAuth Client ID… add exactly
<origin>, save, wait a few minutes, reload.”

## Mirror fallback on a challenged network

`tests/mirror-fallback.browser.cjs` (fixtures): with `danbooru.donmai.us` answering `403`,
the feed asks `safebooru.donmai.us` once, renders its posts, and announces the switch; with a
healthy Danbooru the mirror is never contacted. `npm run check:sources` reports the same status
per source from the machine that runs the app.

## Sync status dots

Same test, `tests/drive-sync.browser.cjs`:

* Home and Bookmarks each show a Google Drive status dot;
* when Drive is off or a Drive error occurs, the dot is static red (`rgb(229, 72, 77)`);
* while a sync is in flight (Drive slowed to 700 ms on purpose), the green dot pulses with
  `glint-sync-pulse`;
* after a successful sync, the dot is steady green (`rgb(47, 191, 113)`) with no animation;
* the dot's accessible label and the profile button communicate the current sync status.

