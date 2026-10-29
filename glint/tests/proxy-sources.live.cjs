/* Live proxy contract: every source the app ships must actually come back
   through `/api/proxy` — list API, grid pictures and Range-streamed video.

   Unlike production.test / proxy-private.test (fixtures, no network) this test
   talks to the real boorus, so it needs outbound network. Run it against a
   server whose allowlist is current:

     NODE_PATH=… PINBOARD_TEST_URL=http://127.0.0.1:8000 node tests/proxy-sources.live.cjs

   A source that needs credentials (Gelbooru since 2026) is allowed to answer
   401/403 — but then the app has to say what to do about it, which is asserted
   below, so a bare "HTTP 401" can never regress back in. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE = process.env.PINBOARD_TEST_URL || "http://127.0.0.1:8000";
/* Sources whose API needs a free key. They may fail, but must fail with advice. */
const NEEDS_KEY = new Set(["gelbooru"]);
/* Disabled in the registry (kept for reference) — never fetched here. */
const SKIP = new Set(["sankaku", "nozomi", "zerochan", "paheal", "szurubooru", "danbooru-ai"]);

const proxy = u => `${BASE}/api/proxy?u=${encodeURIComponent(u)}`;

/* Fetch a picture/video from the app's point of view: an already-proxied URL is
   requested as-is, a plain CDN URL is wrapped in the proxy. */
async function head(url, range) {
  const abs = new URL(url, BASE + "/");
  const target = abs.pathname.endsWith("/api/proxy") ? abs.href : proxy(url);
  const res = await fetch(target, { headers: range ? { Range: range } : {} });
  return { status: res.status, type: res.headers.get("content-type") || "", range: res.headers.get("content-range") || "", res };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const failures = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block"
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.addInitScript(() => localStorage.setItem("pb-swipe-hint-v22", "1"));
    await page.goto(BASE + "/");

    /* --- 1. the proxy refuses what it must refuse -------------------------- */
    // 403 is the server's answer for anything the policy does not allow (400 for
    // a malformed envelope): both mean "refused before any network call".
    const refused = async (url, why) => {
      const status = (await fetch(proxy(url))).status;
      assert.ok(status === 400 || status === 403, `${why} — got ${status}, expected 400/403`);
    };
    await refused("https://example.com/", "an unlisted host must be refused");
    await refused("http://danbooru.donmai.us/posts.json", "plain http must be refused");
    await refused("https://user:pw@danbooru.donmai.us/posts.json", "credentials in the URL must be refused");
    await refused("https://danbooru.donmai.us:8443/posts.json", "a non-443 port must be refused");
    await refused("https://danbooru.donmai.us/posts.json#frag", "a fragment must be refused");

    /* --- 2. every enabled source lists real posts with loadable pictures -- */
    const ids = await page.evaluate(() =>
      Object.keys(PB_SOURCES).filter(id => !PB_SOURCES[id].off && !PB_SOURCES[id].custom));
    // read the allowlist from the checkout the server runs from (it is not served)
    const allow = JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "proxy-policy.json"), "utf8"));
    const allowed = new Set(allow.hosts);
    const report = [], allSamples = [];

    for (const id of ids) {
      if (SKIP.has(id)) continue;
      let tiles = 0, loaded = 0, sample = [], note = "";
      try {
        tiles = await page.evaluate(async id => {
          S.srcs = [id]; S.src = id; S.mode = "live"; S.screen = "home"; S.live = {};
          render();
          try { await loadLive(true); } catch (e) { window.__proxyErr = String(e.message || e); }
          const count = () => document.querySelectorAll("#app .grid [data-id]").length;
          for (let i = 0; i < 30 && !count() && !window.__proxyErr; i++) await new Promise(r => setTimeout(r, 400));
          return count();
        }, id);
      } catch (e) { note = String(e.message || e); }

      if (NEEDS_KEY.has(id) && !tiles) {
        const message = await page.evaluate(() => (window.__proxyErr || document.body.innerText).slice(0, 400));
        assert.match(message, /API key|credentials|denied|rate-limit/i,
          `${id}: a key-less failure must explain itself, got "${message.slice(0, 120)}"`);
        report.push(`${id}: needs a key — refused with advice`);
        continue;
      }
      assert.ok(tiles > 0, `${id}: no tiles came back through the proxy ${note ? "(" + note + ")" : ""}`);

      // grid URLs must point at allowlisted hosts, else the picture host is a policy gap
      sample = await page.evaluate(id => (S.live[id] || []).slice(0, 40).map(p => p.grid).filter(Boolean), id);
      allSamples.push(...sample);
      // A picture we route through /api/proxy must have its host allow-listed;
      // a picture the browser loads directly only has to decode (checked below).
      const gaps = [];
      for (const url of sample) {
        let u; try { u = new URL(url, BASE + "/"); } catch (e) { assert.fail(`${id}: unusable grid URL "${url}"`); }
        if (!u.pathname.endsWith("/api/proxy")) continue;
        const target = new URL(u.searchParams.get("u"));
        if (!allowed.has(target.hostname)) gaps.push(target.hostname);
      }
      assert.deepEqual([...new Set(gaps)], [], `${id}: these picture hosts are missing from proxy-policy.json`);

      // and the pictures themselves have to decode in the browser
      loaded = await page.evaluate(async () => {
        const imgs = [...document.querySelectorAll("#app .grid .art img")].slice(0, 12);
        const ok = () => imgs.filter(i => i.complete && i.naturalWidth > 0).length;
        for (let i = 0; i < 40 && ok() === 0; i++) await new Promise(r => setTimeout(r, 250));
        return ok();
      });
      assert.ok(loaded > 0, `${id}: ${tiles} tiles but not one picture decoded`);
      report.push(`${id}: ${tiles} tiles, ${loaded}+ pictures loaded`);
    }

    /* --- 3. tag search still goes through the proxy ------------------------ */
    for (const [id, tags] of [["danbooru", "cat_ears"], ["eshuushuu", "blue hair"]]) {
      const got = await page.evaluate(async ([id, tags]) => {
        const s = PB_SOURCES[id];
        const req = await s.list({ tags, page: 1, limit: 20, base: s.bases[0], order: "newest" });
        const j = await pbJSON(req.url, { forceProxy: req.html });
        const rows = (s.parse(j) || []).map(r => s.map(r)).filter(p => p && p.grid);
        return { url: req.url, rows: rows.length, first: rows[0] && rows[0].grid };
      }, [id, tags]);
      assert.ok(got.rows > 0, `${id}: tag search for "${tags}" returned nothing (${got.url})`);
      assert.match(got.url, /tags=/, `${id}: tag search did not carry the tag upstream`);
      report.push(`${id}: tag search "${tags}" → ${got.rows} rows`);
    }

    /* --- 4. media: a real image and a Range-streamed video ----------------- */
    const img = allSamples.find(u => /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(u));
    if (img) {
      const r = await head(img);
      assert.equal(r.status, 200, `grid picture ${img} should stream through the proxy`);
      assert.match(r.type, /^image\//, `grid picture must be an image, got ${r.type || "nothing"}`);
    }
    // a video that ranges: e621 posts a webm with every file
    const video = await (async () => {
      const res = await fetch(proxy("https://e621.net/posts.json?limit=20&tags=webm"));
      if (!res.ok) return "";
      const rows = (await res.json()).posts || [];
      const hit = rows.find(p => /\.(webm|mp4)$/i.test(p.file?.url || ""));
      return hit ? hit.file.url : "";
    })();
    if (video) {
      const r = await head(video, "bytes=0-1023");
      assert.equal(r.status, 206, "Range must reach the CDN (a player needs 206 to seek)");
      assert.match(r.range, /^bytes 0-1023\//, `unexpected Content-Range: ${r.range}`);
      assert.match(r.type, /^(video|application\/octet-stream)/, `unexpected video type: ${r.type}`);
      report.push("video: 206 partial content with Content-Range");
    } else report.push("video: no webm on e621 right now — range check skipped");

    /* --- 5. the page never hit a proxy error while all that happened ------ */
    const errors = await page.evaluate(() => window.__pageErrors || []);
    assert.deepEqual(errors, [], "no uncaught page errors");

    console.log("PASS live proxy: allowlist refusals, real lists from "
      + report.length + " sources through /api/proxy, allowlisted picture hosts, decoded grid images"
      + (video ? ", 206 Range video streaming" : "") + ".");
    for (const line of report) console.log("  · " + line);
  } catch (e) {
    failures.push(e);
    console.error("FAIL", e.message);
  } finally {
    await browser.close();
  }
  if (failures.length) process.exitCode = 1;
})();
