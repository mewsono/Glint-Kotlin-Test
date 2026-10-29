# Glint — Kotlin Multiplatform

A Kotlin Multiplatform + Compose Multiplatform rewrite of the Glint PWA
(`../glint`). One `shared` module holds **all** UI, navigation, theming, the
source engine, models and state; `androidApp` and `webApp` are thin shells
around the same composables.

```
glint-kmp/
├── shared/      all app code (commonMain) + small expect/actual platform layer
├── androidApp/  Android launcher (MainActivity + manifest + icons)
├── webApp/      Kotlin/Wasm browser launcher (index.html + sw.js shell)
├── dev-proxy/   local CORS proxy — the PWA's proxy-core.cjs, unchanged
├── dev.sh       starts proxy (:8081) + web app (:8080)        — macOS/Linux
└── dev.bat      the same for Windows
```

## 1. Preview in the browser (start here)

Requirements: **JDK 17+** and **Node.js 18+** on the PATH. The Gradle wrapper
downloads Gradle itself; no Android SDK is needed for the web preview.

```sh
cd glint-kmp
./dev.sh            # Windows: dev.bat
```

Then open **http://localhost:8080**.

- `dev.sh` starts the CORS dev proxy on `http://localhost:8081/api/proxy`
  (same engine and host policy as the deployed PWA proxy) and then runs
  `./gradlew :webApp:wasmJsBrowserDevelopmentRun`.
- The first build downloads dependencies and compiles the wasm bundle — expect
  several minutes. Later runs are fast.
- To run the two pieces by hand:

```sh
node dev-proxy/server.cjs                       # terminal 1
./gradlew :webApp:wasmJsBrowserDevelopmentRun   # terminal 2
```

A different proxy location can be injected in `webApp/src/wasmJsMain/resources/index.html`
via `window.GLINT_PROXY`.

Web-only limits (by design, like the PWA tested in a browser): Google Drive
sync and native sharing say "available on Android only"; everything else —
sources, search, likes, bookmarks, explore, custom sources, import/export —
works in the preview.

## 2. Build the Android APK

Requirements: Android SDK (or Android Studio), JDK 17.

```sh
cd glint-kmp
./gradlew :androidApp:assembleDebug
# APK: androidApp/build/outputs/apk/debug/androidApp-debug.apk
```

Android talks to every source **directly** (no proxy) with the same
User-Agent and header rules the PWA proxy applies. Drive sync and native
sharing are fully functional; see `NOTES.md` for the one-time Google OAuth
client setup (client ID + SHA-1).

## 3. Tests

```sh
./gradlew :shared:wasmJsBrowserTest      # common tests in a browser
./gradlew :shared:testDebugUnitTest      # common tests on the JVM
```

The common tests port the logic assertions from the PWA's `tests/` folder
(masonry ratios and placement, bookmark migration/search rules, feed-order
tokens, post metadata/file info parsing, account hashing and gating).

## 4. Data compatibility

Backups are byte-compatible with the PWA: `{"format":"pinboard-bookmarks",
"version":1,…}` exports/imports in both directions. Likes are real,
source-confirmed favourites on your booru account — never a local flag.
