const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const now=Date.now(),pin=(src,sid)=>({id:`${src}:${sid}`,src,sid:String(sid),srcName:src==='yandere'?'yande.re':src,c:src,t:'Saved artwork',grid:`https://preview.invalid/${src}-${sid}.png`,sample:`https://preview.invalid/${src}-${sid}.png`,orig:`https://preview.invalid/${src}-${sid}.png`,r:1.3,width:600,height:780,tags:['blue_archive'],characters:['aris_(blue_archive)'],series:['blue_archive'],artists:['test_artist'],detailsReady:true,fileInfoReady:true,sourceInfoReady:true,uploadInfoReady:true,uploadedAt:now-3600000,fileSize:150000,fileType:'PNG',sourceLinks:[],rating:'g'});
const pins=[pin('danbooru',101),pin('danbooru',102),pin('danbooru',103),pin('danbooru',104),pin('yandere',201),pin('yandere',202),pin('e621',301),pin('sankaku',901)];
const initial={src:'yandere',srcs:['danbooru','yandere','gelbooru','sankaku'],hidden:['danbooru:104'],pinCache:Object.fromEntries(pins.map(p=>[p.id,p])),boards:[{id:1,n:'Old collection',d:now-10000,pins:['danbooru:101','yandere:201','danbooru:102'],seed:['0']},{id:2,n:'Other collection',d:now-5000,pins:['yandere:202','danbooru:101'],seed:['danbooru:999']},{id:3,n:'Most recent',d:now-1000,pins:['danbooru:103','danbooru:104','e621:301','sankaku:901'],seed:[]}],open:2};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const mode of [{w:390,h:844,mobile:true},{w:360,h:804,mobile:true,legacy:true},{w:1200,h:900,mobile:false}]){
  const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mode.mobile,hasTouch:mode.mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[];let api=0;
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({initial,legacy})=>{if(!localStorage.getItem('bookmarks-test-seeded')){localStorage.setItem('pb2',JSON.stringify(initial));localStorage.setItem('bookmarks-test-seeded','1')}localStorage.setItem('pb-swipe-hint-v22','1');if(legacy)window.PointerEvent=undefined},{initial,legacy:mode.legacy});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(route.request().resourceType()==='image'){
    const n=+(u.pathname.match(/(\d+)\.png$/)||[])[1]||101,h=n*43%360;
    return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="hsl(${h},35%,30%)"/><circle cx="390" cy="250" r="160" fill="hsl(${(h+60)%360},40%,70%)"/><path d="M0 780V570L230 360 600 780" fill="hsl(${h},40%,18%)"/></svg>`});
   }
   if(u.pathname==='/api/proxy'){api++;return route.fulfill({contentType:'application/json',body:'[]'})}
   return u.hostname==='127.0.0.1'?route.continue():route.abort();
  });
  const press=selector=>page.locator(selector).first()[mode.mobile?'tap':'click']();
  const rows=()=>page.evaluate(()=>visibleBookmarkRows().map(r=>r.id));
  const options=()=>page.locator('.bookmark-source-menu [role="option"]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.v,count:n.querySelector('.bookmark-option-count')?.textContent||''})));
  const select=async source=>{await press('.bookmark-source-toggle');await press(`.bookmark-source-menu [data-v="${source}"]`)};
  await page.goto('http://127.0.0.1:8000/?screen=profile&tab=bookmarks');await page.waitForSelector('.bookmarks-library');
  assert.equal(await page.evaluate(()=>S.open),null);assert.equal(await page.evaluate(()=>S.bookmarks.length),8);assert.equal(await page.evaluate(()=>S.bookmarkVersion),1);
  assert.deepEqual(await rows(),['danbooru:103','yandere:202','danbooru:101','yandere:201','danbooru:102']);
  assert.equal(await page.locator('.bookmarks-library [data-a="bookmarkopen"]').count(),5);
  assert.ok(await page.locator('.bookmarks-library .col').evaluateAll(columns=>columns.every(column=>column.children.length>0)),'saved rows must retain their image ratios so both masonry columns are populated');
  assert.equal(await page.locator('.bookmarks-library .boards,.bookmarks-library [data-a="create"],.bookmarks-library [data-a="pf"],.bookmarks-library #bq,.bookmarks-library [data-a="lv"]').count(),0);
  assert.equal(await page.locator('.bookmarks-head').evaluate(e=>[...e.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).length),2);
  assert.equal(await page.locator('.bookmarks-library .cap').count(),0);assert.match(await page.locator('.bookmarks-count').innerText(),/5 bookmarks/);
  const length=await page.evaluate(()=>history.length);await press('.bookmark-source-toggle');assert.equal(await page.locator('.bookmark-source-toggle').getAttribute('aria-expanded'),'true');
  assert.deepEqual(await options(),[{id:'all',count:''},{id:'danbooru',count:'3'},{id:'yandere',count:'2'}]);assert.equal(await page.evaluate(()=>history.length),length);
  const bounds=await page.locator('.bookmark-source-menu').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=mode.w+1);
  if(mode.w===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/bookmarks-dropdown-v47.png'})}
  await press('.bookmark-source-menu [data-v="danbooru"]');assert.deepEqual(await rows(),['danbooru:103','danbooru:101','danbooru:102']);assert.equal(await page.evaluate(()=>S.src),'yandere');assert.equal(await page.locator('.bookmark-source-menu').isVisible(),false);
  await press('.bookmark-sort');assert.deepEqual(await rows(),['danbooru:102','danbooru:101','danbooru:103']);assert.match(await page.locator('.bookmark-sort').innerText(),/Oldest/);
  // Save/unsave happens in place, not in a collection sheet; re-saving is newest.
  await press('.bookmarks-library [data-id="danbooru:102"]');await page.waitForSelector('.post-detail');await page.evaluate(()=>window.__bookmarkImage=document.querySelector('.post-image'));const history=await page.evaluate(()=>history.length);
  await press('.post-actions [data-a="bookmark"]');assert.equal(await page.locator('.post-detail').count(),1);assert.equal(await page.locator('.post-actions [data-a="bookmark"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>window.__bookmarkImage===document.querySelector('.post-image')),true);assert.equal(await page.evaluate(()=>history.length),history);assert.equal(await page.locator('#sheet [data-a="addto"]').count(),0);
  await page.goBack();await page.waitForSelector('.bookmarks-library');assert.equal(await page.evaluate(()=>bookmarked('danbooru:102')),false);await page.reload();await page.waitForSelector('.bookmarks-library');
  assert.equal(await page.evaluate(()=>bookmarked('danbooru:102')),false,'one-time migration must not resurrect a removed save');assert.equal(await page.locator('.bookmark-sort').innerText(),'↕ Newest'.replace('↕ ',''));
  // Re-save an existing cached post. It immediately leads the saved-time ordering.
  await page.evaluate(()=>detail('danbooru:102'));await press('.post-actions [data-a="bookmark"]');assert.equal(await page.locator('.post-actions [data-a="bookmark"]').getAttribute('aria-pressed'),'true');await page.goBack();
  assert.equal((await rows())[0],'danbooru:102');assert.equal(await page.evaluate(()=>S.bookmarks.filter(r=>r.id==='danbooru:102').length),1);
  // Keyboard navigation and dismissal work without changing source or history.
  await page.locator('.bookmark-source-toggle').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('.bookmark-source-menu').isVisible(),true);await page.keyboard.press('End');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>BOOKMARK_VIEW.source),'yandere');await press('.bookmark-source-toggle');await page.keyboard.press('Escape');assert.equal(await page.locator('.bookmark-source-menu').isVisible(),false);
  // Removing the last bookmark from a source removes that option and falls back to All.
  for(const id of ['yandere:201','yandere:202']){await press(`.bookmarks-library [data-id="${id}"]`);await press('.post-actions [data-a="bookmark"]');await page.goBack();await page.waitForSelector('.bookmarks-library')}
  assert.equal(await page.evaluate(()=>BOOKMARK_VIEW.source),'all');assert.deepEqual(await options(),[{id:'all',count:''},{id:'danbooru',count:'3'}]);
  // Only enabled sources are offered. Existing saves remain when a source is disabled.
  await page.evaluate(()=>{S.srcs.push('e621');save();refreshBookmarks()});assert.deepEqual(await options(),[{id:'all',count:''},{id:'danbooru',count:'3'},{id:'e621',count:'1'}]);
  await select('danbooru');await page.evaluate(()=>{S.srcs=S.srcs.filter(id=>id!=='danbooru');save();refreshBookmarks()});assert.equal(await page.evaluate(()=>BOOKMARK_VIEW.source),'all');assert.equal(await page.locator('.bookmarks-library [data-a="bookmarkopen"]').count(),1);
  assert.equal(await page.evaluate(()=>S.bookmarks.filter(r=>r.id.startsWith('danbooru:')).length),4,'hidden/disabled bookmarks are retained, not deleted');
  await page.evaluate(()=>{S.srcs=S.srcs.filter(id=>id!=='e621');save();refreshBookmarks()});assert.deepEqual(await options(),[{id:'all',count:''}]);assert.match(await page.locator('.bookmarks-empty').innerText(),/No bookmarks yet/);
  await page.evaluate(()=>{S.srcs.push('danbooru');save();refreshBookmarks()});await page.reload();await page.waitForSelector('.bookmarks-library');assert.equal(await page.locator('.bookmarks-library [data-a="bookmarkopen"]').count(),3);
  assert.equal(await page.evaluate(()=>BOOKMARK_VIEW.source),'all');assert.equal(await page.evaluate(()=>BOOKMARK_VIEW.order),'newest');assert.equal(api,0,'sorting and source filters are local, including logged-out sources');
  // Theme and layout do not overflow the phone or alter the shared image-only cards.
  await page.evaluate(()=>{document.documentElement.dataset.theme='light'});assert.equal(await page.locator('.bookmarks-library').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  assert.deepEqual(errors,[]);console.log(`PASS ${mode.w}px${mode.legacy?' legacy touch':''}: flat bookmarks, exact enabled/nonempty dropdown counts, real saved-time sorting, direct save/remove, migration/persistence, source enable/disable, keyboard control and responsive layout.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
