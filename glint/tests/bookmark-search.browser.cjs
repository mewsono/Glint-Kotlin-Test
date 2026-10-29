const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const now=Date.now(),picture=(i)=>'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="hsl(${i*49},36%,30%)"/><circle cx="390" cy="200" r="140" fill="hsl(${i*49+55},45%,70%)"/><path d="M0 780V600L220 350 600 780" fill="hsl(${i*49},40%,18%)"/></svg>`).toString('base64');
const make=(source,id,title,tags,characters=[],artists=[],series=[])=>({id:source+':'+id,sid:String(id),src:source,t:title,tags,characters,artists,series,grid:picture(id),r:1.3,width:600,height:780,detailsReady:true,fileInfoReady:true,sourceInfoReady:true,uploadInfoReady:true,rating:'g'});
const pins=[make('danbooru',101,'Beach Morning',['blue_archive','1girl'],['aris_(blue_archive)'],['c_star'],['blue_archive']),make('danbooru',102,'Blue Sky',['blue_archive'],['hoshino_(blue_archive)'],['summer_artist'],['blue_archive']),make('danbooru',103,'Neon City',['original'],[],['night_artist']),make('yandere',201,'Hatsune Miku',['vocaloid','hatsune_miku'],['hatsune_miku'],['hikari'],['vocaloid']),make('yandere',202,'Vocaloid Stage',['vocaloid'],['kagamine_rin'],['stage_artist'],['vocaloid']),make('animepictures',301,'Forest',['landscape'],[],['forest_artist']),make('danbooru',999,'Only unsaved needle',['only_unsaved_needle'])];
const initial={bookmarkVersion:1,bookmarks:pins.slice(0,6).map((p,i)=>({id:p.id,savedAt:now-i*1000})),pinCache:Object.fromEntries(pins.map(p=>[p.id,p])),srcs:['danbooru','yandere','animepictures','gelbooru'],src:'yandere',hidden:[],screen:'profile',bt:'Bookmarks',cols:2};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,435,1200]){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[];let api=0;
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(initial=>{localStorage.setItem('pb2',JSON.stringify(initial));localStorage.setItem('pb-swipe-hint-v22','1')},initial);
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/api/proxy'){api++;return route.fulfill({contentType:'application/json',body:'[]'})}return u.hostname==='127.0.0.1'?route.continue():route.abort()});
  const press=selector=>page.locator(selector).first()[mobile?'tap':'click'](),input=()=>page.locator('#bookmarkSearch'),ids=()=>page.locator('.bookmark-results [data-a="bookmarkopen"]').evaluateAll(ns=>ns.map(n=>n.dataset.id).sort());
  const select=async id=>{await press('.bookmark-source-toggle');await press(`.bookmark-source-menu [data-v="${id}"]`)};
  await page.goto('http://127.0.0.1:8000/?screen=profile&tab=bookmarks');await page.waitForSelector('#bookmarkSearch');
  assert.equal(await page.locator('.bookmarks-count b').innerText(),'6 bookmarks');
  assert.equal((await page.locator('.bookmark-source-toggle').innerText()).trim(),'All');
  assert.equal(await page.locator('.bookmark-source-menu [data-v="all"] .bookmark-option-count').count(),0);
  assert.deepEqual(await page.locator('.bookmark-source-menu [data-v]:not([data-v="all"])').evaluateAll(ns=>ns.map(n=>[n.dataset.v,n.querySelector('.bookmark-option-count').textContent])),[['danbooru','3'],['yandere','2'],['animepictures','1']]);
  const layout=await page.locator('.bookmarks-head').evaluate(head=>{const b=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}};return {count:b(head.querySelector('.bookmarks-count')),sort:b(head.querySelector('.bookmark-sort')),summary:b(head.querySelector('.bookmarks-summary')),search:b(head.querySelector('.bookmark-search')),source:b(head.querySelector('.bookmarks-source'))}});
  assert.ok(layout.count.right<=layout.sort.left&&layout.sort.top<layout.count.bottom,'count and sort share the first row');
  assert.ok(layout.search.top>=layout.summary.bottom&&Math.abs(layout.search.top-layout.source.top)<1,'search and source share the next row');
  assert.ok(layout.search.right<=layout.source.left&&layout.search.width>layout.source.width&&layout.source.width<100,'All stays compact beside the search bar');
  assert.equal(await page.locator('.bookmark-results .col').evaluateAll(ns=>ns.every(n=>n.children.length===3)),true);
  if(width===435){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/bookmarks-header-v49.png'})}
  // Typing and mid-string edits must not replace or blur the input.
  await input().fill('blue_archive');assert.deepEqual(await ids(),['danbooru:101','danbooru:102']);
  await page.evaluate(()=>{window.__searchNode=document.getElementById('bookmarkSearch');window.__searchNode.setSelectionRange(0,0)});
  await page.keyboard.type('ARIS ');assert.equal(await input().inputValue(),'ARIS blue_archive');
  assert.equal(await page.evaluate(()=>document.activeElement===window.__searchNode&&document.getElementById('bookmarkSearch')===window.__searchNode&&window.__searchNode.selectionStart===5),true);
  assert.deepEqual(await ids(),['danbooru:101']);assert.equal(await page.locator('.bookmarks-count b').innerText(),'1 bookmark');
  await press('.bookmark-search-clear');assert.equal(await input().inputValue(),'');assert.equal(await input().evaluate(e=>document.activeElement===e),true);assert.equal(await page.locator('.bookmark-search-clear').isVisible(),false);
  // Source totals remain saved totals even while the main count is searched.
  await input().fill('BLUE archive');await select('danbooru');assert.equal(await input().inputValue(),'BLUE archive');
  assert.equal(await page.locator('.bookmark-selected-count').innerText(),'(3)');assert.equal(await page.locator('.bookmarks-count b').innerText(),'2 bookmarks');
  assert.deepEqual(await page.evaluate(()=>visibleBookmarkRows().map(r=>r.id)),['danbooru:101','danbooru:102']);
  await press('.bookmark-sort');assert.deepEqual(await page.evaluate(()=>visibleBookmarkRows().map(r=>r.id)),['danbooru:102','danbooru:101']);assert.equal(await input().inputValue(),'BLUE archive');
  await input().fill('vocaloid');assert.equal(await page.locator('.bookmarks-count b').innerText(),'0 bookmarks');assert.match(await page.locator('.bookmarks-empty').innerText(),/No bookmarks match/);
  await select('yandere');assert.equal(await page.locator('.bookmarks-count b').innerText(),'2 bookmarks');
  assert.deepEqual(await page.evaluate(()=>visibleBookmarkRows().map(r=>r.id)),['yandere:202','yandere:201']);
  await input().fill('hikari');assert.deepEqual(await ids(),['yandere:201']);
  await input().press('Escape');assert.equal(await input().inputValue(),'');assert.equal(await page.evaluate(()=>BOOKMARK_VIEW.source),'yandere');
  // Long source labels/counts and the right-aligned menu stay within phones.
  await select('animepictures');await press('.bookmark-source-toggle');
  const menu=await page.locator('.bookmark-source-menu').boundingBox();assert.ok(menu.x>=0&&menu.x+menu.width<=width+1);
  assert.ok(await input().evaluate(e=>e.getBoundingClientRect().width>70));
  await page.keyboard.press('Escape');await select('all');
  for(const [q,wanted] of [['c_star',['danbooru:101']],['Beach Morning',['danbooru:101']],['danbooru:102',['danbooru:102']],['yande.re',['yandere:201','yandere:202']],['only_unsaved_needle',[]]]){await input().fill(q);assert.deepEqual(await ids(),wanted)}
  await input().fill('<img src=x onerror="window.__searchXSS=1">');assert.equal(await page.locator('.bookmarks-empty img').count(),0);assert.equal(await page.evaluate(()=>window.__searchXSS),undefined);
  assert.match(await page.locator('.bookmarks-empty').innerText(),/<img src=x/);
  // A source/sort rerender escapes the query and preserves its literal value.
  await press('.bookmark-sort');assert.equal(await input().inputValue(),'<img src=x onerror="window.__searchXSS=1">');assert.equal(await page.locator('.bookmarks-head img').count(),0);
  await press('.bookmark-search-clear');assert.equal(await page.locator('.bookmarks-count b').innerText(),'6 bookmarks');assert.equal((await page.locator('.bookmark-source-toggle').innerText()).trim(),'All');
  await page.evaluate(()=>document.documentElement.dataset.theme='light');assert.ok(await page.locator('.bookmarks-library').evaluate(e=>e.scrollWidth<=e.clientWidth));
  assert.equal(await page.evaluate(()=>S.bookmarks.length),6);assert.equal(api,0,'local bookmark searching never requests remote search');assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: count/sort then search/compact source, unnumbered All, source totals, normalized saved-only search, filter/sort combination, focus/caret, clear/empty/XSS and no remote requests.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
