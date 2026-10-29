/* A network that Cloudflare challenges. Danbooru → 403 must fall over to its
   sibling mirror (safebooru.donmai.us, same API) once, show the pictures, and say
   so; a healthy source must never be re-routed. Fixture traffic only. */
const assert = require("node:assert/strict"), { chromium } = require("playwright");
const BASE = process.env.PINBOARD_TEST_URL || "http://127.0.0.1:8000";
const WIDTH = Number((process.env.PINBOARD_TEST_WIDTHS || "390").split(",")[0]);
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#3d6a76"/></svg>';
const post = (i, host) => ({
  id: i, md5: "a".repeat(32), image_width: 400, image_height: 600, tag_string: "safe", rating: "g", score: i,
  preview_file_url: `https://${host}/preview-${i}.jpg`,
  large_file_url: `https://${host}/large-${i}.jpg`,
  file_url: `https://${host}/file-${i}.jpg`
});

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const make = async blockDanbooru => {
      const context = await browser.newContext({
        viewport: { width: WIDTH, height: 844 }, isMobile: WIDTH < 600, hasTouch: WIDTH < 600, serviceWorkers: "block"
      });
      await context.addInitScript(() => localStorage.setItem("pb-swipe-hint-v22", "1"));
      const page = await context.newPage();
      const hosts = [];
      await page.route("**/*", async route => {
        const req = route.request(), u = new URL(req.url());
        if (req.resourceType() === "image") return route.fulfill({ contentType: "image/svg+xml", body: svg });
        if (u.pathname !== "/api/proxy") return u.hostname === "127.0.0.1" ? route.continue() : route.abort();
        const target = new URL(u.searchParams.get("u"));
        hosts.push(target.hostname);
        if (target.hostname === "danbooru.donmai.us" && blockDanbooru) {
          return route.fulfill({ status: 403, contentType: "text/html", body: "<html>Just a moment…</html>" });
        }
        const body = /\.json$|posts|images/.test(target.pathname + target.search)
          ? [1, 2, 3, 4, 5].map(i => post(i, target.hostname)) : [];
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto(BASE + "/");
      return { context, page, hosts };
    };

    /* 1. challenged → the mirror answers */
    {
      const { context, page, hosts } = await make(true);
      const tiles = await page.evaluate(async () => {
        S.srcs = ["danbooru"]; S.src = "danbooru"; S.mode = "live"; S.screen = "home"; S.live = {};
        render();
        try { await loadLive(true); } catch (e) { }
        const n = () => document.querySelectorAll("#app .grid [data-id]").length;
        for (let i = 0; i < 25 && !n(); i++) await new Promise(r => setTimeout(r, 200));
        return n();
      });
      assert.ok(tiles > 0, "a 403 from the primary mirror must not leave an empty board");
      assert.ok(hosts.includes("safebooru.donmai.us"), "the sibling mirror should have been asked");
      assert.ok(hosts.indexOf("safebooru.donmai.us") > hosts.indexOf("danbooru.donmai.us"), "primary is tried first");
      const said = await page.evaluate(() => (document.querySelector(".toast,.snack,[role=status]") || {}).textContent || "");
      assert.match(said, /safebooru/i, `the fallback has to be announced, got "${said}"`);
      await context.close();
    }

    /* 2. healthy → never re-routed */
    {
      const { context, page, hosts } = await make(false);
      const tiles = await page.evaluate(async () => {
        S.srcs = ["danbooru"]; S.src = "danbooru"; S.mode = "live"; S.screen = "home"; S.live = {};
        render();
        try { await loadLive(true); } catch (e) { }
        const n = () => document.querySelectorAll("#app .grid [data-id]").length;
        for (let i = 0; i < 25 && !n(); i++) await new Promise(r => setTimeout(r, 200));
        return n();
      });
      assert.ok(tiles > 0, "a healthy source still lists posts");
      assert.equal(hosts.some(h => h === "safebooru.donmai.us"), false, "no fallback on a working source");
      await context.close();
    }

    console.log("PASS " + WIDTH + "px: a network the site challenges (Danbooru 403) falls over to its sibling mirror once and says so, while a healthy source is never re-routed. Fixture traffic.");
  } finally { await browser.close(); }
})().catch(e => { console.error("FAIL", e.message); process.exitCode = 1; });
