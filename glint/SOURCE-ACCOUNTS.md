# Source accounts, Likes and Bookmarks — v65

**Likes are favourites on the original website. Bookmarks are independent, local saves.**

- A source heart appears only for an implemented writer, a numeric source post ID and the required per-source credentials. Gelbooru additionally requires a website-session credential.
- The heart is disabled while checking, saving or uncertain. The app commits its appearance only after a fresh source read confirms the requested state. HTTP 200 alone is not enough.
- Like/Unlike never adds or removes a Bookmark. A Bookmark never calls a favourite writer.
- Old device-only `S.likes` data remains in the saved app data, but is not used as source truth or automatically uploaded. Saved images, collections, source settings and recent searches are retained.

## Current presets

| Source | Website / Boorusama login | This PWA | Source heart |
|---|---|---|---|
| Danbooru | Username + API key | Authenticated browsing, favourites and counts | Yes |
| yande.re | Username + site-specific password hash | Hashed-password login and 3-star favourites | Yes |
| Konachan | Username + its own password hash | Hashed-password login and 3-star favourites | Yes |
| Sakugabooru | Username + its own password hash | Corrected site salt; re-enter old saved passwords once | Yes, after re-entering an old password |
| e621 | Username + API key, HTTP Basic | Full pair required; `/users/me.json` verifies identity | Yes |
| Gelbooru | Numeric User ID + API key; website session for writes | API reads; optional manually supplied `pass_hash` website cookie for writes | Only with that session as well |
| Derpibooru | Optional API key | Key-only read integration; no username needed | No |
| Ponybooru | Optional API key | Key-only read integration; no username needed | No |
| Anime Pictures | Native cookie/session login in Boorusama | Public browsing; cookie login / starred-account integration not implemented here | No |
| e-shuushuu | Native username/password → access and refresh tokens in Boorusama | Existing public adapter; token login/refresh not implemented here | No |
| Szurubooru preset | Instance-dependent username + access token | Disabled / unverified instance; no account controls | No |
| Hybooru preset | No login configured in this preset | Disabled / unverified; correctly described as Hybooru, not Szurubooru | No |
| Sankaku preset | Native username/password → access token in Boorusama | Disabled / unverified; no token flow here | No |
| Paheal preset | Native Shimmie2 session / site-specific authentication | Disabled / unverified old adapter | No |
| Zerochan preset | Website account; reviewed adapter is public | Disabled / unverified | No |
| Nozomi preset | Reviewed public-index adapter has no login | Disabled / unverified | No |

An app limitation is **not** a claim that the website has no API or account support. Boorusama is native and can capture website sessions in its embedded browser; this PWA cannot automatically read another website's cookies, including HttpOnly cookies.

## Setup in the app

Home → **+** opens Image sources. **Features & login** opens the source's capability matrix, instructions, limitations and documentation. **Use**, **Add** and **Remove** are separate buttons; inspecting features cannot accidentally remove a source.

**Set up account & filters** opens that source's actual fields. **Check these credentials** tests the current draft, not an older saved key. Checking does not silently save it. **Save source settings** applies the draft. Changing a username/User ID requires re-entering associated credentials; an old account's key, hash or session is not silently carried to another account.

### Danbooru

Sign in → profile → API keys. Use a dedicated key for this trusted deployment. It needs profile/users, posts and counts read access and favourites index/create/destroy access. Read-only or narrowly scoped keys can browse yet be unable to Like. If a key is IP-restricted, allow the trusted proxy's egress IP(s), not just the phone's IP; do not indiscriminately relax restrictions to work around an error.

**Native vote side effects:** Danbooru's favourite model may add your upvote when creating a favourite (subject to its vote permissions), and removes your active positive vote when destroying that favourite. This includes an upvote that already existed before favouriting. Pinboard uses the native favourite endpoint and does not bypass or separately reverse this website behaviour.

- [Profile / API keys](https://danbooru.donmai.us/profile)
- [API documentation](https://danbooru.donmai.us/wiki_pages/help:api)

### yande.re, Konachan and Sakugabooru

Use that site's own username and password. The original password is not persisted or sent by the app; the browser computes a site-specific SHA-1 hash. The saved hash **is still a credential**. Password whitespace is preserved during hashing.

- yande.re: `choujin-steiner--{password}--`
- Konachan: `So-I-Heard-You-Like-Mupkids-?--{password}--`
- Sakugabooru: `er@!$rjiajd0$!dkaopc350!Y%)--{password}--`

An older Sakugabooru hash was generated with the wrong salt. It is retained, but cannot enable a new heart until the password is re-entered using the corrected algorithm.

Like corresponds to a **3-star vote**; Unlike sets score **0**. Before checking current vote, the app verifies credentials because a public current-vote GET can otherwise silently return the anonymous user's zero. It never uses a score-less vote POST as a state probe: on an older deployment that could clear a vote.

### e621

My Account → Manage API Access. Enter the complete username/API-key pair, not a website password. Identity checking uses authenticated `/users/me.json`, not a successful public username lookup. API access, privacy, account restrictions and rate limits remain controlled by the site.

- [My account](https://e621.net/users/home)
- [API documentation](https://e621.net/help/api)

### Gelbooru

My Account → Options → API Access Credentials. Enter the numeric `user_id` and `api_key`, or paste the credential line into **Paste API credential line** and use **Fill User ID and API key**.

That pair enables reads, **not favouriting**. Advanced users may additionally enter **only the `pass_hash` website cookie value** for the same account. This is a website session, not an API key or a Moebooru hash. Obtain it from the site's browser developer tools on a trusted computer. Do not paste it into chat or share it. The app cannot import it automatically.

Without that optional session, the post heart stays hidden, while Profile Likes can still be read. Website sessions can expire or require CAPTCHA/security checks; open the original site to handle those. Writes originate from the proxy, so an IP/device-bound browser session may not be usable here even while the browser remains signed in. This app does not bypass them. A successful API read is labelled a read-access check; it does not claim the separate cookie was verified.

Gelbooru's native state-changing GETs travel browser → proxy inside a private POST envelope. Removal redirects are not followed with credentials; only a subsequent source-state check can confirm success. The list uses an explicit post-ID sort, not unverified favourite-added timestamps.

- [Options / API credentials](https://gelbooru.com/index.php?page=account&s=options)

### Philomena sources

Find the optional API key in the original website's account settings. No username is required here. A successful public search checks read access, **not logged-in identity**. There is no source-favourite writer in this build; use local Bookmarks or the original site.

## Privacy and failure behaviour

- Bookmark backup/import (Settings) contains bookmarks and saved post metadata only. It never contains API keys, password hashes, sessions or source credentials.
- Credentials are in browser **local storage without encryption**, not in a secure vault. Trust the device, deployment and any scripts served by it.
- Authenticated requests go through **this deployment's proxy and the intended source**. The proxy necessarily handles the credentials. Use trusted HTTPS hosting. Website passwords for Moebooru are hashed locally first; hashes and session cookies remain sensitive.
- Account traffic uses same-origin POST envelopes, never key-bearing browser/proxy URLs. The Python, Vercel and Netlify proxies forward the correct native method, content type and explicit authentication. No ambient browser cookies are forwarded.
- Account responses have `Cache-Control: no-store, private`. They do not enter shared proxy caches or the service worker's runtime/image caches. The update clears old runtime caches and unsafe historical image entries while retaining normal cached media and local saved data.
- HTTPS target hosts are allow-listed. Credentialed redirects are never followed. A failed or timed-out write is never automatically repeated or retried anonymously/via another transport.
- Unknown outcomes remain unknown. If a request may have reached the source, **Recheck** performs a read, not another mutation. Confirmation also refreshes Profile Likes and its native total. Unknown totals are never replaced with the number of loaded cards.
- Per-source writes are serialized and spaced. Rate-limit responses defer later queued writes. Duplicate taps are ignored while pending. Account changes cancel queued work, invalidate account-scoped state and prevent late responses from recolouring another account's heart.
- Source state is checked on opening a post. Profile data is refreshed on re-entry after 30 seconds and on relevant return-to-app visibility changes; there is no background polling or claim of instantaneous cross-client push sync.
- Legacy site-scoped accounts migrate once. Unscoped shared Moebooru details are retained locally under `pb-unassigned-auth-v64`, **not copied to multiple websites**. They are never automatically applied again, and removing an account removes legacy session copies to prevent resurrection. Already-duplicated legacy Moebooru hashes are retained but marked for per-site password re-entry, so an ambiguous hash is not transmitted to several sites.

## Verification and limitations

Protocol tests and isolated browser tests use mocks only. They cover six writers, canonical post IDs for deletion, true source readback, malformed responses, denied permissions, rate limits, uncertain network outcomes, duplicate taps, stale account/post responses, no secret-bearing URLs, proxy privacy and independent saved data. Standard feed/search/history/bookmark/post regressions remain part of the suite.

**No real account credentials were supplied. Authenticated live writes have not been verified against the production websites.** Upstream deployment versions, sessions, scopes, security challenges and hosting limits can affect availability. The app must show these failures rather than claim a successful Like.

## Reviewed reference

Boorusama 4.6.1 at commit `1716a68401249c78a6325f21308ebc59ca4e462c`, plus upstream API documentation and official Moebooru, Danbooru and e621 controller/model contracts. Source was inspected, not executed.

- [Pinned Boorusama reference](https://github.com/khoadng/Boorusama/tree/1716a68401249c78a6325f21308ebc59ca4e462c)
- [Moebooru implementation](https://github.com/moebooru/moebooru)
- [Danbooru implementation](https://github.com/danbooru/danbooru)
- [e621 implementation](https://github.com/e621ng/e621ng)
