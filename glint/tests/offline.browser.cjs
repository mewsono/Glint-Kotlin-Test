/* Everything the UI needs must already be on the device: open the app once
   with a network, then take the network away and the whole interface — feed,
   navigation, tabs, settings, search, post view — must still work, with the
   pictures that were already seen.
   This test talks to the real server (no route stubs) because a service
   worker's cache is the thing under test. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const widths=(process.env.PINBOARD_TEST_WIDTHS||'390').split(',').map(Number);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'allow'});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');
    sessionStorage.setItem('__offline_loads',String(Number(sessionStorage.getItem('__offline_loads')||0)+1));
    if(!localStorage.getItem('__offline_seeded')){localStorage.setItem('__offline_seeded','1');
      localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))}});

  // ---- warm-up: one normal visit, exactly like a user's first run ----------
  await page.goto(BASE+'/');
  await page.waitForSelector('.grid [data-id]');
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:20000});
  // The worker claims the page moments after this first visit. That must not
  // reload the UI under the user (an earlier build did, flashing the screen).
  assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('__offline_loads')||0)),1,'the worker taking control does not reload the page');
  // let the precache and a few pictures settle
  await page.waitForFunction(()=>[...document.querySelectorAll('.grid .art img')].filter(i=>i.complete&&i.naturalWidth>0).length>=4,null,{timeout:30000});
  const warm={tiles:await page.locator('.grid [data-id]').count()};
  // The first visit is not controlled by the worker, so give the app a moment
  // to warm the cache once the worker takes over; if a deployment is slow to
  // claim the page, one normal second visit does the same job.
  const cached=async name=>page.evaluate(async name=>{const keys=await caches.keys();const hit=keys.find(k=>k.includes(name));if(!hit)return 0;const c=await caches.open(hit);return (await c.keys()).length},name);
  await page.waitForTimeout(1200);
  if(!(await cached("-api-"))){await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.grid [data-id]');await page.waitForTimeout(1500)}
  assert.ok(await cached("-api-")>0,'the feed data is kept for offline');
  assert.ok(await cached("pinboard-img-")>0,'the pictures that were seen are kept for offline');
  // visit the screens a user visits, so their data is in the API cache too
  await page.evaluate(()=>{S.screen='profile';S.bt='Bookmarks';render()});
  await page.waitForTimeout(400);
  await page.evaluate(()=>{S.screen='search';S.q='';render()});
  await page.waitForTimeout(300);
  await page.evaluate(()=>{S.screen='home';render()});
  await page.waitForTimeout(300);

  // ---- the shell is really complete ---------------------------------------
  const shell=await page.evaluate(async()=>{
    const names=await caches.keys();
    const stat=names.find(n=>/-static$/.test(n));
    const cache=await caches.open(stat);
    const keys=(await cache.keys()).map(r=>r.url.split('/').pop());
    return {names,keys};
  });
  for(const file of ['index.html','styles.css','app.js','sources.js','runtime.js','boot.js','pwa.js','manifest.webmanifest','icon-192.png']){
    assert.ok(shell.keys.some(k=>k.startsWith(file.replace(/\+/g,'\\+'))),`${file} is precached for offline use`);
  }

  // ---- now take the network away -----------------------------------------
  await context.setOffline(true);
  const failed=[];
  page.on('requestfailed',r=>failed.push(r.url()));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#app .grid, #app .empty',{timeout:15000});
  await page.waitForTimeout(600);

  assert.equal(await page.title(),'Pinboard','the app opens offline');
  assert.equal(await page.evaluate(()=>document.getElementById('offlineBar').hidden),false,'the offline notice is shown');
  const offline={tiles:await page.locator('.grid [data-id]').count(),pics:await page.evaluate(()=>[...document.querySelectorAll('.grid .art img')].filter(i=>i.complete&&i.naturalWidth>0).length)};
  assert.ok(offline.tiles>=Math.min(4,warm.tiles),`the feed still has posts offline (${offline.tiles})`);
  assert.ok(offline.pics>0,`pictures come from the cache offline (${offline.pics} of ${offline.tiles})`);
  const css=await page.evaluate(()=>{const s=[...document.styleSheets];return s.length?s[0].cssRules.length:0});
  assert.ok(css>100,'the stylesheet is served offline, not just the HTML');

  // ---- the interface works with no network -------------------------------
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();
  // feed → post → back
  await press('.grid [data-id]');
  await page.waitForSelector('#sheet .post-detail',{timeout:15000});
  assert.ok(await page.locator('#sheet .post-image, #sheet .art').count(),'a post still opens offline');
  await page.evaluate(()=>close());await page.waitForTimeout(300);
  // settings, with the image-quality rows
  await page.evaluate(()=>{S.screen='profile';S.bt='Bookmarks';render()});await page.waitForTimeout(200);
  await press('[data-a="settings"]');
  await page.waitForSelector('#sheet [data-a="iqfeed"]',{timeout:8000});
  assert.ok(await page.locator('#sheet [data-a="iqdetail"]').count()>=1,'Settings opens offline');
  assert.ok(await page.locator('#sheet [data-a="iqfeed"]').count()>=1,'the quality rows are on the offline settings sheet');
  await page.evaluate(()=>close());await page.waitForTimeout(200);
  // tabs + search screen
  await page.evaluate(()=>{S.bt='Explore';render()});await page.waitForTimeout(500);
  assert.ok(await page.locator('.tabpane[data-tab="Explore"]').count(),'the Explore pane is built offline');
  await page.evaluate(()=>{S.screen='search';render()});await page.waitForTimeout(300);
  assert.ok(await page.locator('#app .sbar, #app .search-pill, #app .sres').count(),'the search screen renders offline');
  await page.evaluate(()=>{S.screen='home';render()});await page.waitForTimeout(300);
  assert.ok(await page.locator('.srctabs [data-a="src"]').count(),'the source row still works offline');

  // ---- and a second cold start is just as good ----------------------------
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#app .grid, #app .empty',{timeout:15000});
  assert.ok(await page.locator('.grid [data-id]').count(),'a second offline launch still shows the feed');
  assert.deepEqual(errors,[]);
  await context.setOffline(false);

  console.log(`PASS ${width}px: the whole UI (shell, styles, icons, feed, post, settings, tabs, search) opens and works with the network switched off, and cached pictures render.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
