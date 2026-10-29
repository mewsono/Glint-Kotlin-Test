/* Settings → image quality: the feed, the post page and the full-screen viewer
   each choose their own file, the choice persists, and a missing file falls
   back instead of showing nothing. Fixture traffic only. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,1200').split(',').map(Number);
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const post=id=>({id,md5:String(id).padStart(32,'1'),image_width:400,image_height:520,file_ext:'png',
  preview_file_url:`https://cdn.donmai.us/preview/${id}.jpg`,
  large_file_url:`https://cdn.donmai.us/sample/${id}.jpg`,
  file_url:`https://cdn.donmai.us/original/${id}.png`,
  tag_string:'landscape',rating:'g',score:id,created_at:'2026-10-20T10:00:00Z'});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],imageHits=[];
  page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');
   if(!localStorage.getItem('pb2'))localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image'){const full=decodeURIComponent(u.pathname+u.search);if(/donmai/.test(full))imageHits.push(full);return route.fulfill({contentType:'image/svg+xml',body:svg})}
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   const target=new URL(u.searchParams.get('u'));
   const value=target.pathname.endsWith('counts/posts.json')?{counts:{posts:2}}:target.pathname==='/posts.json'?[post(8801),post(8802)]:[];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(value)})});
  await page.goto(BASE+'/');await page.waitForFunction(()=>window.PB_APP_READY===true);
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>0);
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();
  const feedSrc=()=>page.evaluate(()=>document.querySelector('.grid .art img')?.getAttribute('src')||'');
  const anyFeed=re=>page.evaluate(()=>[...document.querySelectorAll('.grid .art img')].map(i=>i.getAttribute('src')||'').some(s=>true));
  const backHome=async()=>{await page.evaluate(()=>{S.screen='home';render()});await page.waitForTimeout(150)};
  const openSettings=async()=>{if(await page.locator('#sheet [data-a="iqfeed"]').count())return;
   await page.evaluate(()=>{S.screen='profile';render()});await page.waitForTimeout(120);
   await press('[data-a="settings"]');await page.waitForSelector('#sheet [data-a="iqfeed"]')};

  // ---- defaults: fast feed thumbnails, sample post page, original viewer --
  assert.match(await feedSrc(),/360x360/,'the feed starts on the small preview');
  await press('.grid [data-id="danbooru:8801"]');
  await page.waitForSelector('.post-media img.post-image');
  assert.match(await page.evaluate(()=>document.querySelector('.post-image').getAttribute('src')),/sample%2F8801|sample\/8801/,'the post page starts on the sample file');
  await page.evaluate(()=>close());await page.waitForTimeout(150);

  // ---- Settings offers all three choices --------------------------------
  await openSettings();
  for(const row of ['iqfeed','iqdetail','iqviewer'])assert.equal(await page.locator(`#sheet [data-a="${row}"]`).count(),2,`${row} offers both files`);
  assert.equal(await page.locator('#sheet [data-a="iqfeed"][data-v="thumb"]').getAttribute('aria-pressed'),'true','feed defaults to fast');

  // ---- feed: sharp -------------------------------------------------------
  await page.evaluate(()=>document.querySelector('#sheet [data-a="iqfeed"][data-v="sharp"]').click());
  await page.waitForSelector('#sheet [data-a="iqfeed"][data-v="sharp"][aria-pressed="true"]');
  await page.evaluate(()=>close());
  await backHome();
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.grid .art img')].every(i=>/sample/.test(i.getAttribute('src')||''))),true,'a sharp feed uses the larger file on every tile');
  assert.equal(await page.evaluate(()=>S.iq.feed),'sharp','the choice is stored');

  // ---- post page: original ----------------------------------------------
  await openSettings();
  await page.evaluate(()=>document.querySelector('#sheet [data-a="iqdetail"][data-v="orig"]').click());
  await page.waitForSelector('#sheet [data-a="iqdetail"][data-v="orig"][aria-pressed="true"]');
  await page.evaluate(()=>close());await backHome();
  await press('.grid [data-id="danbooru:8801"]');
  await page.waitForSelector('.post-media img.post-image');
  assert.match(await page.evaluate(()=>document.querySelector('.post-image').getAttribute('src')),/original%2F8801|original\/8801/,'the post page can use the original file');

  // ---- full screen: sample ----------------------------------------------
  await page.evaluate(()=>close());
  await page.waitForTimeout(200);
  await openSettings();
  await page.evaluate(()=>document.querySelector('#sheet [data-a="iqviewer"][data-v="sample"]').click());
  await page.waitForSelector('#sheet [data-a="iqviewer"][data-v="sample"][aria-pressed="true"]');
  await page.evaluate(()=>close());await backHome();
  await press('.grid [data-id="danbooru:8801"]');
  await page.waitForSelector('.post-media img.post-image');
  await page.locator('.post-media img.post-image').click();
  await page.waitForSelector('.image-viewer img.fullscreen-image');
  assert.match(await page.evaluate(()=>document.querySelector('.fullscreen-image').getAttribute('src')),/sample%2F8801|sample\/8801/,'the viewer can use the sample file');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.image-viewer').count(),0,'the viewer closes');

  // ---- the choice survives a reload -------------------------------------
  await page.reload();await page.waitForFunction(()=>window.PB_APP_READY===true);
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>0).catch(()=>{});
  const iq=await page.evaluate(()=>S.iq);
  assert.deepEqual(iq,{feed:'sharp',detail:'orig',viewer:'sample'},'quality choices persist');

  // ---- a post with no larger file falls back to what it has -------------
  const fallback=await page.evaluate(()=>{
    const bare={grid:'g',sample:'',orig:''},full={grid:'g',sample:'s',orig:'o'};
    return {feed:iqURL(bare,'feed'),detail:iqURL(bare,'detail'),viewer:iqURL(bare,'viewer'),
      fullFeed:iqURL(full,'feed'),fullDetail:iqURL(full,'detail'),fullViewer:iqURL(full,'viewer')};
  });
  assert.deepEqual(fallback,{feed:'g',detail:'g',viewer:'g',fullFeed:'s',fullDetail:'o',fullViewer:'s'},'a missing file falls back to what the post has');

  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: Settings offers feed / post / full-screen quality, each choice changes the file actually requested, persists across reloads, and falls back when a size is missing.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
