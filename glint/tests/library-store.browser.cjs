/* The library store: bookmarks/boards/settings stay in localStorage (small,
   crash-safe) while each pin's preview, tags and names live in IndexedDB, written
   per changed record. 5 000 saves must cost kilobytes and milliseconds, survive a
   reload, and never lose a bookmark. Fixture traffic only. */
const assert = require("node:assert/strict"), { chromium } = require("playwright");
const BASE = process.env.PINBOARD_TEST_URL || "http://127.0.0.1:8000";
const N = Number(process.env.PINBOARD_TEST_LIBRARY || 5000);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await context.addInitScript(() => {
      localStorage.setItem("pb-swipe-hint-v22", "1");
      if (!localStorage.getItem("__lib_seeded")) {
        localStorage.setItem("__lib_seeded", "1");
        localStorage.setItem("pb2", JSON.stringify({ mode: "live", screen: "home", src: "danbooru", srcs: ["danbooru"], bookmarks: [], bookmarkVersion: 1 }));
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.setDefaultTimeout(30000);
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", route => {
      const req = route.request(), u = new URL(req.url());
      if (req.resourceType() === "image") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
      if (u.pathname !== "/api/proxy") return u.hostname === "127.0.0.1" ? route.continue() : route.abort();
      return route.fulfill({ contentType: "application/json", body: "[]" });
    });
    await page.goto(BASE + "/");
    await page.waitForFunction(() => window.PB_APP_READY === true);

    /* 1. the split store is what is running */
    assert.equal(await page.evaluate(() => PB_RUNTIME.libraryMode()), "split", "pins go to IndexedDB");

    /* 2. 5 000 saves: one synchronous write of the small half only */
    const wrote = await page.evaluate(async N => {
      S.bookmarks = []; S.pinCache = {};
      for (let i = 0; i < N; i++) {
        const id = "danbooru:" + (700000 + i);
        S.bookmarks.push({ id, savedAt: Date.now() - i * 60000 });
        S.pinCache[id] = { id, src: "danbooru", sid: String(700000 + i), t: "Post " + i, c: "Dan",
          grid: "https://cdn.donmai.us/p/" + i + ".jpg", sample: "https://cdn.donmai.us/s/" + i + ".jpg",
          width: 900, height: 1300, tags: ["landscape", "tag_" + (i % 97)], artists: ["artist_" + (i % 53)],
          characters: [], series: [], rating: "g", score: 1, detailsReady: true };
      }
      const started = performance.now();
      const ok = save(true);
      const ms = Math.round(performance.now() - started);
      await PB_RUNTIME.libraryFlush();
      const text = localStorage.getItem("pb2");
      return { ok, ms, bytes: text.length, inBlob: !!JSON.parse(text).pinCache, records: JSON.parse(text).bookmarks.length };
    }, N);
    assert.equal(wrote.ok, true, "the save succeeds");
    assert.equal(wrote.inBlob, false, "pin detail is not rewritten into localStorage");
    assert.ok(wrote.bytes < 400 * 1024, `the blob stays small (${Math.round(wrote.bytes / 1024)} KB)`);
    assert.ok(wrote.ms < 150, `saving ${N} bookmarks is quick (${wrote.ms} ms)`);
    assert.equal(wrote.records, N, "every bookmark record is stored");

    /* 3. every pin reached IndexedDB, and a reload reads them back */
    const stored = await page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open("pb-library");
      request.onsuccess = () => {
        const count = request.result.transaction("pins").objectStore("pins").count();
        count.onsuccess = () => resolve(count.result);
      };
    }));
    assert.ok(stored >= N, `all ${N} pins are in IndexedDB (${stored})`);

    await page.reload();
    await page.waitForFunction(() => window.PB_APP_READY === true);
    await page.evaluate(() => Promise.race([PB_RUNTIME.libraryReady(), new Promise(r => setTimeout(r, 20000))]));
    const back = await page.evaluate(() => ({ stats: PB_RUNTIME.libraryStats(), pins: Object.keys(S.pinCache).length,
      withPicture: Object.values(S.pinCache).filter(p => p.grid).length, bookmarks: S.bookmarks.length }));
    assert.equal(back.stats.mode, "split", "the store is still split after a reload");
    assert.ok(back.pins >= N, `every pin came back (${back.pins})`);
    assert.ok(back.withPicture >= N, "every card still has a picture address");
    assert.equal(back.bookmarks, N, "no bookmark was lost");

    /* 4. the library tab draws a screenful, not 5 000 cards */
    const drawn = await page.evaluate(() => {
      const started = performance.now();
      S.screen = "profile"; S.bt = "Bookmarks"; render();
      return { ms: Math.round(performance.now() - started),
        cards: document.querySelectorAll(".bookmarks-library .art, .bookmarks-library .bookmark-unavailable").length,
        tail: !!document.querySelector(".bm-tail") };
    });
    assert.ok(drawn.cards > 0 && drawn.cards <= 60, `only the first screenful is drawn (${drawn.cards})`);
    assert.equal(drawn.tail, true, "the rest is queued behind the tail marker");
    assert.ok(drawn.ms < 900, `opening the library stays quick (${drawn.ms} ms)`);

    assert.deepEqual(errors, [], "no uncaught page errors");
    console.log(`PASS 390px: the library store keeps ${N} bookmarks in a ${Math.round(wrote.bytes / 1024)} KB blob (save ${wrote.ms} ms), puts every pin in IndexedDB, reads all of them back after a reload and draws the library a screenful at a time (${drawn.ms} ms).`);
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error("FAIL", e.message); process.exitCode = 1; });
