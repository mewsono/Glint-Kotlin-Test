# Glint UI rebuild — revision 2

The live preview runs on port 8000. Run locally with `npm start` in this folder. Use Node 22+ to match `package.json` and the Cloudflare Wrangler deployment tool.

This revision replaces the primary app markup, not just its colors:
- Glint's fixed minimal header and image-only masonry wall.
- Feed / Saved / Settings pill, without the old home/search/avatar navigation.
- Tiny bottom-right image markers for bookmarks and source-confirmed Likes; actions remain in the post viewer.
- Purpose-built Settings sheet, source selection, 1/2/3-column segments and theme segments.
- Full-viewport contain-fit image viewer, floating bookmark control and an optional information/action panel.
- Library options and search/filter controls tucked behind the Saved header menu.
- Original account, source, sync, import/export and advanced operations retained and restyled.
- Figtree and Instrument Serif font data embedded locally; no remote font requests needed.
- New neutral/gold bookmark PWA icons.

Primary appearance follows the uploaded Glint prototype. This does not add the prototype's simulated merged-source timer: real feeds retain the original source engine. A source can be changed in Settings. Original engine gestures, source behavior, and advanced workflows remain, rather than inventing unsupported backend features.

Maintained browser tests cover the redesigned shell, small image markers, viewer actions, layout, theme changes, Saved navigation and accessibility at mobile and desktop sizes. Existing proxy and search contract tests also pass. Authenticated live services were not end-to-end tested. Upstream tests written for the old navigation/selectors need adaptation; do not assume the whole original suite passes.

The original app files and tests are included. `Glint.html` and `index.html` are matching entry points and require all supporting files. Personal browser data is not part of the source ZIP: retain the same origin or use bookmark export/import or Drive sync to migrate it.

---

## Earlier migration notes (revision 1)

# Glint — Pinboard v65 migration

## Run

Node.js 22 or later is recommended and required by the declared project engine / Wrangler deployment tooling. Extract the entire ZIP, open a terminal in the `glint` folder and run:

```sh
npm start
```

Visit http://localhost:8000. The root `index.html` and `Glint.html` are identical entry points. **Keep all supporting files beside them.** Double-clicking the HTML or deploying to a plain static-only host is not sufficient for source feeds: they need `/api/proxy`.

The original Vercel and Netlify proxy/deployment files are included. Google Drive needs your existing Google OAuth client configuration and the correct authorized origin for the deployed site; a new domain may require an OAuth configuration change.

## What was transferred

All original source adapters, source account handling, custom sources, real feeds, pagination and ordering, tag search, bookmarks and their export/import, boards, likes, viewer and gestures, metadata and related art, settings, Google Drive sync, offline service worker, install/update prompts, proxy/security policy, documentation and tests are retained.

Glint's warm neutral/gold palette, serif branding, image-first masonry presentation, rounded cards, translucent pill navigation, light/dark styling and sheet styling are applied to the working engine. No prototype-generated pictures or fake live-feed timer are used.

This is a **Glint-styled adaptation of the original working application**, not a pixel-for-pixel conversion of the prototype. Source tabs and Search remain available so the original functionality is accessible. Pinboard's existing viewer/gesture implementation is retained rather than replaced by the prototype viewer. The original PWA icon artwork remains included. Fonts use local fallbacks when Figtree / Instrument Serif are not installed; no remote font dependency is required.

## Existing personal data

The ZIP contains app code, not the browser storage from your device. No personal bookmarks or account credentials were extracted from the ZIP.

- **Same site / origin, browser and profile:** original storage keys, database names and backup formats are unchanged. Deploy over the old app on the same origin and scope to retain browser-local data. Export a backup first. Accept the app update/reload prompt if an old service worker is still controlling the page.
- **Different site / origin or device:** use the old app's bookmark export/import, or configure the same Drive sync account and restore/sync. Bookmark JSON exports cover bookmarks, not every account credential or setting. Do not erase the old installation until the restored data is checked.
- Source credentials are excluded from Drive sync by default. Re-enter them if needed. Existing credentials in same-origin storage remain compatible.

The service worker shell version was bumped; existing shared image/API cache names were retained. PWA identity and start URL remain stable for same-origin upgrades.

## Verification

Passed:
- JavaScript syntax check on app.js.
- Existing production proxy and private-proxy contract tests.
- Existing Drive-sync browser tests.
- Existing search-header contract test.
- New `tests/glint-smoke.cjs` at 390px and 1280px: Glint.html startup, navigation, settings, theme toggle, no runtime JS errors and no horizontal overflow (mocked empty source replies).

Current verification commands:
- `npm test` runs local-only Node regression suites plus both Python local HTTP tests. It excludes live-source traffic and requires Python 3.
- `npm run test:browser` runs the current fixture-driven Glint browser subset (Explore, Related art/tag-feed gestures, drag-down-to-close sheets, Search tag chips, search-on-Enter behavior, post-close thumbnail, thumbnail corner marks, Settings source-row edit/delete actions, scrolling/performance, video, Drive indicators, library storage and pagination) plus axe WCAG 2.1 A/AA scans across Home, Explore, Bookmarks, Search, Related art and Settings in dark and light themes. Start `npm start` first so the preview is on port 8000.
- Browser tests use the committed Playwright and axe-core dev dependencies. After `npm install`, install Chromium once with `npx playwright install chromium`.

Historical v65 tests are still present under `tests/`; several target earlier navigation/DOM selectors and are not part of the current browser aggregate. See [GLINT-AUDIT.md](GLINT-AUDIT.md) for the current audit, verified fixes and outstanding test limitations. Live authenticated source and Drive accounts were not used.

`glint-theme.css` is an editable reference. Its contents are embedded at the end of the head in both HTML entry points, so existing host allow-lists and offline caching work without a new stylesheet route. If you edit it, update both embedded copies too.

Original detailed documentation remains in README.md, SOURCE-ACCOUNTS.md and the release/QA notes.
