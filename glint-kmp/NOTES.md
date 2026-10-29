# NOTES — decisions, equivalents, user-supplied configuration

## Decisions made during the port

- **Versions are pinned, not verified.** The sandbox used to write this port
  had no access to Maven/Google repositories, so no Gradle build could run.
  Pinned: Kotlin 2.2.10, Compose Multiplatform 1.8.2, AGP 8.7.3, Ktor 3.2.2,
  Coil 3.3.0, Media3 1.6.1, coroutines 1.10.2, serialization 1.9.0,
  kotlinx-browser 0.3, Gradle 8.13 (wrapper included). If any pairing has
  drifted, bump the entry in `gradle/libs.versions.toml` — the code uses only
  long-stable APIs.
- **One store, same keys.** App state persists under the PWA's keys
  (`pb2`, `pb-auth`, `pb-tag-types-v1`, `pb-custom-sources-v1`,
  `pb-search-history-v1`) through an `expect/actual KeyValueStore`
  (localStorage on web, SharedPreferences on Android). The PWA's own `pb2`
  blob is readable: a legacy decoder maps its field layout.
- **Masonry** uses Compose's `LazyVerticalStaggeredGrid` (feed/search/saved)
  — the same shortest-column behaviour as `masonry()` in app.js — plus an
  exact shortest-column port (`masonryColumns`) for explore/related sections,
  which is what the common tests exercise.
- **Source engine is a line-for-line port** of sources.js: same registry
  order, endpoints, query/order tokens, pagination cursors (`a<id>`/`b<id>`),
  mirror fallback on 403/502/503 with the same toast, auth-retry without
  credentials, Philomena `sf/sd` parameters, tag-type caching, custom-source
  probing, and the account/likes contract (verify-by-read, 1100 ms write
  spacing, 429 Retry-After backoff, Mutex per source).
- **Web transport = the PWA proxy contract.** The dev proxy
  (`dev-proxy/server.cjs`) wraps the PWA's untouched `proxy-core.cjs` +
  `proxy-policy.json`. Account traffic travels as the same `pb_private`
  envelope. Android bypasses all of it and calls sources directly with the
  same compatible User-Agent.
- **Pin metadata is computed eagerly** when a post is mapped (the PWA keeps
  the raw `p.meta` and derives lazily). Same resulting fields; `detailsReady`
  / `fileInfoReady` / `uploadInfoReady` / `sourceInfoReady` semantics are kept.
- **Demo mode** is kept, including the seeded PRNG gradient artwork.

## Not identical — closest equivalent

| PWA | This port |
| --- | --- |
| `sw.js` offline caching + `offline.html` | Web: a service worker in `webApp` caches the wasm shell and serves `offline.html` offline. Android: the app itself is the offline shell; saved pins and settings live on-device. |
| Browser history (`pushState`) for sheets/posts | An in-app overlay stack; Android's system Back pops it identically. |
| `navigator.share` / clipboard share chain | Android: native share sheet. Web: "available on Android only" toast (the wasm canvas has no share API). |
| Google Drive sync via Google Identity Services popup | Android: full port (appDataFolder file `pinboard-data.json`, merge-by-newest with 90-day tombstones, debounced auto-sync) using OAuth PKCE in the system browser with redirect `dev.glint:/oauth2redirect`. Web: "available on Android only". |
| `<video>` posts inline | Android: Media3/ExoPlayer. Web: a real HTML `<video>` overlaid on the canvas at the composable's exact bounds (streaming + native controls). |
| CSS view transitions between grid and post | Compose screen transitions; swipe left/right between posts follows the same `sw` setting. |
| Pinch zoom in the viewer | Tap-to-open full-screen contain-fit viewer with swipe navigation; pinch zoom is not reimplemented. |
| Install prompt ("Install app" row) | Meaningless for a native app; omitted on Android, PWA manifest kept for the web preview. |
| Account help texts | Trimmed of browser-only phrasing (cookie copying steps stay, "PWA/Boorusama" wording removed where it referenced browser mechanics). |

## You must configure (Android-only features)

1. **Google Drive sync** needs your own OAuth client:
   - Google Cloud Console → *Credentials* → *Create OAuth client ID* →
     **Android**.
   - Package name: `dev.glint.android`.
   - SHA-1: from your signing key —
     `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`
     (use your release keystore's SHA-1 for release builds).
   - Enable the **Google Drive API** for the project.
   - Paste the client ID (…`apps.googleusercontent.com`) in the app:
     Settings → *Quality, Drive setup & advanced* → *OAuth Client ID* → Save,
     then *Connect & sync*.
2. **Release signing**: `androidApp` ships unsigned release config; add your
   keystore via the usual `signingConfigs` block or sign with Android Studio.
3. **Source accounts** (optional, per user): API keys are entered in
   Settings → *Source accounts* — identical fields and rules as the PWA
   (Gelbooru needs the numeric user id + API key, plus the `pass_hash`
   cookie only for setting Likes; Moebooru stores the salted SHA-1 hash,
   never the password).

## Known build-environment caveat

Everything in this repository was written and self-audited without a JVM or
Android SDK available (offline sandbox). The Gradle wrapper, module wiring and
code target the pinned versions above; the first `./gradlew` run on a normal
machine will download toolchains and may surface version-drift warnings that
are safe to resolve by bumping `libs.versions.toml`.
