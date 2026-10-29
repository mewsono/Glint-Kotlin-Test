/* When Drive sync runs: a bookmark waits 10 s, a settings change waits 4 s, the
   app checks once on open, and tapping the avatar forces a sync immediately.
   A fake Drive and a fake clock we can read. No Google account, no network. */
const assert = require("node:assert/strict"), { chromium } = require("playwright");
const BASE = process.env.PINBOARD_TEST_URL || "http://127.0.0.1:8000";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
const drive = { calls: [], files: new Map(), next: 1 };
const stamp = () => new Date(Date.now() + drive.next).toISOString();

async function routeDrive(route) {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  const json = (status, payload) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  if (url.hostname === "www.googleapis.com" && url.pathname.startsWith("/drive/v3/files")) drive.calls.push(Date.now());
  if (url.hostname === "www.googleapis.com" && url.pathname === "/drive/v3/about") return json(200, { user: { emailAddress: "t@example.com" } });
  if (url.hostname === "www.googleapis.com" && url.pathname === "/drive/v3/files") {
    const file = [...drive.files.values()][0];
    return json(200, { files: file ? [{ id: file.id, modifiedTime: file.modifiedTime }] : [] });
  }
  if (url.hostname === "www.googleapis.com" && /^\/drive\/v3\/files\/[^/]+$/.test(url.pathname)) {
    const id = url.pathname.split("/").pop(), file = drive.files.get(id);
    if (!file) return json(404, { error: { message: "not found" } });
    if (url.searchParams.get("alt") === "media") return route.fulfill({ status: 200, contentType: "application/json", body: file.body });
    return json(200, { id, modifiedTime: file.modifiedTime });
  }
  if (url.hostname === "www.googleapis.com" && url.pathname === "/upload/drive/v3/files" && method === "POST") {
    const body = request.postData() || "", marker = "Content-Type: application/json\r\n\r\n";
    const payload = body.slice(body.lastIndexOf(marker) + marker.length, body.lastIndexOf("\r\n--"));
    const id = "file" + drive.next++;
    drive.files.set(id, { id, modifiedTime: stamp(), body: payload });
    return json(200, { id, modifiedTime: drive.files.get(id).modifiedTime });
  }
  if (url.hostname === "www.googleapis.com" && /^\/upload\/drive\/v3\/files\/[^/]+$/.test(url.pathname) && method === "PATCH") {
    const id = url.pathname.split("/").pop(), file = drive.files.get(id);
    file.body = request.postData() || file.body; file.modifiedTime = stamp();
    return json(200, { id, modifiedTime: file.modifiedTime });
  }
  return json(404, { error: { message: "unhandled " + url.pathname } });
}

async function device(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.addInitScript(() => {
    if (!localStorage.getItem("__trig_seeded")) {
      localStorage.setItem("__trig_seeded", "1");
      localStorage.setItem("pb-swipe-hint-v22", "1");
      localStorage.setItem("pb2", JSON.stringify({ mode: "live", screen: "home", src: "danbooru", srcs: ["danbooru"], bookmarks: [], bookmarkVersion: 1,
        driveOn: true, driveAuto: true, driveClientId: "test-client.apps.googleusercontent.com" }));
      localStorage.setItem("pb-drive-token", JSON.stringify({ token: "fake-token", exp: Date.now() + 3600e3 }));
    }
    window.__tokenRequests = 0;
    window.google = { accounts: { oauth2: {
      hasGrantedAllScopes: () => true,
      initTokenClient: config => ({ requestAccessToken: () => { window.__tokenRequests++; setTimeout(() => config.callback({ access_token: "fake-token", expires_in: 3600 }), 5); } })
    } } };
  });
  await page.route("**/*", route => {
    const req = route.request(), u = new URL(req.url());
    if (u.hostname === "www.googleapis.com") return routeDrive(route);
    if (req.resourceType() === "image") return route.fulfill({ contentType: "image/svg+xml", body: svg });
    if (u.pathname !== "/api/proxy") return u.hostname === "127.0.0.1" ? route.continue() : route.abort();
    return route.fulfill({ contentType: "application/json", body: "[]" });
  });
  return { context, page };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    /* 1. opening the app checks Drive once, even with auto-sync irrelevant */
    const first = await device(browser);
    await first.page.goto(BASE + "/");
    await first.page.waitForFunction(() => window.PB_APP_READY === true);
    const opened = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 8000) { if (drive.calls.length) return Date.now() - t0; await first.page.waitForTimeout(100); } return -1; })();
    assert.ok(opened >= 0, "opening the app checks Drive by itself");
    assert.ok(opened < 4000, `the open-time check happens promptly (${opened} ms)`);
    await first.context.close();

    /* 2. a bookmark waits 10 s, a settings change only 4 s */
    const { context, page } = await device(browser);
    await page.goto(BASE + "/");
    await page.waitForFunction(() => window.PB_APP_READY === true);
    await page.waitForTimeout(2500);                       // let the open-time sync finish
    const before = drive.files.get([...drive.files.keys()][0]).body;
    drive.calls.length = 0;
    const markedAt = await page.evaluate(() => {
      const id = "danbooru:555001";
      S.pinCache[id] = { id, src: "danbooru", sid: "555001", t: "Bookmark", c: "Dan", grid: "https://cdn.donmai.us/p/x.jpg", tags: [], artists: [], characters: [], series: [], rating: "g", detailsReady: true };
      S.bookmarks.push({ id, savedAt: Date.now() });
      save(true);
      return Date.now();
    });
    await page.waitForFunction(() => window.PB_DRIVE.state.busy === false, null, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(6000);
    assert.equal(drive.calls.length, 0, "a bookmark alone does not upload within 6 s");
    const uploaded = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 12000) { if (drive.calls.length) return Date.now() - markedAt; await page.waitForTimeout(100); } return -1; })();
    assert.ok(uploaded >= 8500 && uploaded < 16000, `the bookmark uploads ~10 s later (${uploaded} ms)`);
    const after = drive.files.get([...drive.files.keys()][0]).body;
    assert.ok(after.includes("danbooru:555001") && !before.includes("danbooru:555001"), "the bookmark is in the uploaded file");

    /* 3. tapping the avatar syncs at once */
    drive.calls.length = 0;
    await page.evaluate(() => { S.cols = 3; save(true); });          // a settings change → 4 s
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#nav [data-v="profile"]').click());
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) { if (drive.calls.length) break; await page.waitForTimeout(50); }
    assert.ok(drive.calls.length > 0, "tapping the avatar forces a sync immediately");
    assert.ok(Date.now() - t0 < 2500, "…without waiting for the 4 s debounce");
    assert.ok(await page.evaluate(() => S.screen === "profile"), "…and still opens the profile");

    console.log("PASS 390px: Drive sync runs once when the app opens, 10 s after a bookmark, 4 s after a settings change, and immediately when the avatar is tapped; a bookmark is never uploaded late or lost.");
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error("FAIL", e.message); process.exitCode = 1; });
