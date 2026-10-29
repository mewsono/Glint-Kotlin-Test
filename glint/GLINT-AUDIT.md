# Glint comprehensive project audit

**Audit date:** 2026-10-27  
**Scope:** Glint PWA frontend and interactions, source adapters and proxy paths, Node/Python/Pages hosting, security, accessibility, animation/performance, local storage/Drive behavior, offline/PWA behavior, automated tests, and project documentation.

## Executive summary

The maintained local, fixture-driven test suites pass. The audit found and fixed verified issues in Explore's desktop close gesture, proxied media delivery/redirect handling, light-theme contrast, accessible control names, and test/documentation reproducibility. Existing user-facing behavior, source adapters, storage formats, and same-origin PWA identity were preserved.

This was not a live-source or authenticated-account penetration test. Upstream source availability, real Drive OAuth, and deployment to Cloudflare/Vercel/Netlify were not exercised. Danbooru/Donmai were deliberately excluded from live investigation as requested; test fixtures are not live requests.

## Verified fixes

### UI behavior and motion

- Fixed Explore desktop close clicks being intercepted by pointer capture: the feed now captures the mouse pointer only after a vertical swipe has actually been recognized. Regression coverage checks Explore at 360, 390, and 1200 px, including navigation, close, section paging, and carousel behavior.
- Preserved the requested Explore layout and transitions: pinned single title bar, hidden header action/search controls, compact transparent feed, Home selected in bottom navigation, retained section periods/carousels/View all feeds, and close behavior without a duplicate/black thumbnail tile.
- Related art sections now present matching images as horizontal, snap-scrolling carousels with a visible **See more** action beside each section heading; it opens that section's dedicated full tag feed. Keyboard focus, labelled slider groups, loading/retry states, and the existing source matching/pagination behavior are preserved.
- Follow-up: at the user's request, thumbnails now show tiny, non-interactive bottom-right hearts for source-confirmed Likes and bookmark marks for local saves; both can appear together. Status updates preserve image nodes, remain independent, and do not introduce background source requests or treat legacy local hearts as source Likes. Each glyph is drawn pixel-centred inside its badge (the heart sat 0.32px low before v72) and the badge shadow is symmetric, so the circle reads centred; a canvas-paint regression asserts the drawn outline stays centred and small.
- Browser regressions verify downward close gestures for Related art and Character/Artist/Series feeds from mid-scroll, canceled pull restoration, video interactions, and thumbnail retention. Horizontal scrubs and native video controls remain separately covered.
- Follow-up (2026-10-28): every sheet that paints the grabber now slides down to close, so the affordance is honest. The pull tracks the finger (85% of the travel, with a light fade), springs back under ~104 px unless it is a fast flick, and commits to `close()` with a 0.22 s slide; reduced motion closes at once. Dragging inside a scrolled sheet still scrolls it, sideways swipes, taps, buttons and form fields keep their own behaviour, and the click that follows a real drag is swallowed — so a pull that starts on a row never activates it. Pages that already own a gesture (post details, Related art, tag feeds, Explore feeds, the viewer) and the full-height sheets (no grabber) are left untouched. Covered by `tests/sheet-drag.browser.cjs` at touch 390 px, reduced-motion 360 px and mouse 1200 px.
- Replaced both post-detail ↔ Related art sheet slides with stationary crossfades. Swiping either direction fades the incoming page over the current one rather than translating the sheet; reduced-motion preferences skip the transition, and browser regressions assert opacity-only animations.
- Follow-up (2026-10-28): removed a visible flash at the swipe-to-navigation handoff by retaining the painted post and promoting the actual Related preview instead of redrawing either screen. The same post/video node is reused on return. A fixture-driven screenshot comparison checks the full viewport immediately before and after the handoff at 360, 414 and 1200 px, including mid-scroll, browser Forward and the Back button; reduced motion, canceled gestures, child-post history and video retention are also covered.
- The maintained smoothness test checks in-place pagination, avoids unnecessary layout reads per frame, skips offscreen cards, and batches storage writes. Motion behavior was tested; this is not a full frame-rate benchmark on physical devices.
- Follow-up (2026-10-28): at the user's request, **nothing searches while you type**. In Search, Bookmarks and Likes the text stays in the box — marked with an accent ring — until Enter, the search button, or another explicit action (dropping a chip, picking a suggestion, a recent search, a shared `?q=` link, the sort control). Typing no longer triggers a results request or a result-count request; the applied query is the state, the box text is the draft, and unsubmitted text survives re-renders. Tag suggestions still appear while typing. Covered by `tests/search-on-enter.browser.cjs` at 390 px and 1200 px (Search, Bookmarks and a fixture-backed Likes tab).
- Follow-up (2026-10-28): the Search tab now mirrors the current query as removable tag chips under the search pill, so a long query can be pruned one token at a time instead of retyped. One chip per whitespace token (`sakura_miko`, `-dog`, `rating:safe`); dropping a chip rewrites `S.q`, the input and the running search, focus stays in the chip row for repeat removals, and **Clear all** returns to recent searches. The input stays the single source of truth, so typing, debouncing, tag autocomplete, search history, source switching, sorting and the `?q=` deep link are unchanged; the row is capped at two rows and scrolls. Covered by `tests/search-chips.browser.cjs` at 390 px and 1200 px.
- Follow-up (2026-10-28): each Settings ▸ Sources row keeps the whole row as its pick target and adds a small pencil and bin beside it, labelled "Edit &lt;source&gt;" / "Delete &lt;source&gt;". The pencil opens the account & filters form for a preset and, for a source the user added, a prefilled form that renames it or re-points its address and API type while keeping its identity, so saved pins and bookmarks keep working; a refused edit (duplicate address, unreachable API) is rolled back and explained. The bin asks first: a preset is taken out of the row and stays re-addable from Manage sources, while a source of the user's own is deleted outright with its address and credentials. A browser regression covers both flows, the confirm/cancel paths, the prefilled form, and that picking a row still switches source.

### Backend, proxy, and media

- Hardened the shared media path to validate each redirect target instead of following redirects blindly, enforce the existing HTTPS/host allow-list on every hop, bound redirect hops and request time, and stream media rather than buffering large image/video payloads in memory.
- Extended the Python production proxy to stream proxied image responses as well as videos. The Pages and Python paths retain safe streaming headers, range/CORS behavior where applicable, private no-store behavior, and sandboxed content policy.
- Local proxy tests cover private/disallowed destinations, redirect validation, method/body/auth forwarding, response-size limits, timeout propagation, credentials and cookies, CORS/ranges, and serverless response constraints. These tests use local fixtures and do not contact upstream services.
- The source adapters continue to use their native ordering, filters, cursor semantics, and account routes. Offline suites validate their request contracts and explicitly avoid fabricating ranked ID cursors or unsupported counts.

### Accessibility and themes

- Fixed verified light-theme contrast failures by darkening muted text (`--mu: #6b6570`) and the gold accent (`--ac: #805000`) in the editable theme source and both embedded HTML copies. Inactive Settings theme choices now use the normal text color.
- Removed unnecessary opacity reduction from Search helper text. Updated Search/Saved sort and Settings source controls so accessible names match their visible labels; selected source state remains exposed through `aria-pressed` and a checkmark.
- Added `tests/accessibility.browser.cjs`, wired it into `npm run test:browser`, and added `axe-core` as a dev dependency. The fixture-driven axe WCAG 2.1 A/AA scan reports **zero violations** on Home, Explore, Bookmarks, Search, Related art, and Settings in both dark and light themes at 390 px and 1280 px.
- Automated axe results are not a substitute for keyboard-only, screen-reader, or user testing. Those were not independently performed in this audit.

### PWA, state, and compatibility

- The service-worker regression checks the current stylesheet pre-cache and removal of obsolete Glint shell/runtime caches without deleting media/API or unrelated caches.
- Existing storage schemas, bookmark migration, source preferences, local data, and Drive merge/tombstone behavior remain covered by offline tests. The 5,000-bookmark browser test verifies a 241 KB store and reload persistence.
- Drive status indicators are tested against the specified states: static red when disconnected/problem, flickering green while syncing, steady green when synced. Backup tests verify credentials are excluded by default.
- `index.html` and `Glint.html` are byte-identical entry points. The Pages build succeeds and emits the deployment assets. Personal browser data is not part of the project archive and remains origin/profile-specific.

### Documentation and test maintenance

- Updated START-HERE and README test instructions to use the checked-in Playwright and axe-core dev dependencies, require Node 22+, and explain that the local preview must run on port 8000.
- Added current audit guidance and marked the old v65 QA material as historical. Legacy browser files remain in `tests/`; they are not part of the current maintained aggregate because some depend on outdated selectors/expectations.
- One exploratory run of all historical browser scripts had 8 passes, 29 failures, and 1 skip. Several failures reflect stale selectors/expectations; not every historical failure was individually triaged. The desktop Explore close failure that did correspond to current accepted behavior was fixed and is now covered by the maintained suite. Do not interpret the legacy run as 29 confirmed product defects or as a fully green legacy suite.
- Test-only disconnect logging now suppresses expected broken-pipe/reset noise only for `BrokenPipeError` and `ConnectionResetError`; it does not hide unrelated failures.

## Final verification

All commands below passed against the audited workspace on 2026-10-27:

| Check | Result |
|---|---|
| `npm test` | 19/19 offline Node suites; Python production tests 6/6; private-proxy tests 9/9 |
| `npm run test:browser` | All 10 maintained fixture-driven browser scripts passed, including Explore at 360/390/1200 px, accessibility scans at 390/1280 px, swipe/close, media, Drive, pagination, smoothness, and library storage |
| `npm audit` | 0 vulnerabilities (info/low/moderate/high/critical) |
| `npm run build:pages` | Passed; Pages assets prepared |
| JavaScript syntax checks | Passed for app, source/runtime/Drive/boot/PWA/service-worker, Node server/media, and Pages proxy modules |
| Python compilation | Passed for server and both Python test suites |
| Entry point parity | `index.html` and `Glint.html` are identical |
| Live preview | Port 8000 returned HTTP 200 |

The 2026-10-28 motion follow-up passed `npm test` (19 Node suites and 15 Python tests), all 11 maintained browser scripts including the new pixel-level transition regression, the Pages build, syntax checks, entry-point parity and an HTTP 200 preview check. The screenshot comparisons used fixture content in headless Chromium, not physical-device testing.

The sandbox runtime was Node 20.20.2, below the declared Node `>=22.0.0` requirement, so npm printed engine warnings for Wrangler/Miniflare. The tested commands above nevertheless passed in that sandbox. Use Node 22+ for supported local development and deployment.

## Remaining limitations / recommendations

1. Install dependencies with `npm install` and the browser binary once with `npx playwright install chromium`; then start `npm start` before `npm run test:browser`. Python 3 is required by `npm test`.
2. The current browser suite uses local fixtures. It validates the UI and proxy contracts without authenticating to Google Drive or contacting upstream artwork services. Test those integrations only in a controlled environment with disposable credentials.
3. The proxy is intentionally public and allow-list constrained, but the application itself does not impose per-client rate limits. For public production traffic, configure edge-level rate limiting/monitoring appropriate to the deployment.
4. Legacy v65 browser tests remain unmaintained; update their selectors and expectations before using them as acceptance gates.
5. Physical-device performance, mobile browser edge cases, assistive-technology behavior, and production deployment headers/domains should receive their own release checks.
