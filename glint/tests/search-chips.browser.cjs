/* The Search tab shows the current query as removable tag chips: they mirror the
   input, dropping one rewrites the query and re-runs the search, and clearing
   them returns to the recent-searches screen. Tags, exclusions and filter
   tokens all survive as chips. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';

const chips=page=>page.$$eval('#search-tag-chips [data-a="searchchipremove"]',nodes=>nodes.map(n=>({tag:n.dataset.v,text:n.textContent.trim(),label:n.getAttribute('aria-label')})));
const state=page=>page.evaluate(()=>({query:S.q,input:document.getElementById('q').value,search:SEARCH?.query??null,shown:!document.getElementById('search-tag-chips').hidden&&document.getElementById('search-tag-chips').style.display!=='none'}));

async function run(browser,{width,height}){
 const label=`${width}x${height}`;
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 const page=await context.newPage();
 page.setDefaultTimeout(8000);
 await page.addInitScript(()=>{
  localStorage.setItem('pb-swipe-hint-v22','1');
  localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'search',src:'danbooru',srcs:['danbooru'],theme:'dark',bookmarks:[],bookmarkVersion:1}));
 });
 await page.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#3d5a66"/></svg>'});
  if(u.pathname==='/api/proxy')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  return u.hostname==='127.0.0.1'?route.continue():route.abort();
 });
 await page.goto(`${BASE}/?screen=search`);
 await page.waitForFunction(()=>window.PB_APP_READY===true);
 await page.waitForSelector('#q');

 // no query, no chips
 assert.deepEqual(await chips(page),[],'an empty search shows no chips');
 assert.equal((await state(page)).shown,false,'the chip row is hidden with no query');

 // typing mirrors every token, including exclusions and filter tokens
 await page.fill('#q','sakura_miko hololive -dog rating:safe');
 await page.waitForFunction(()=>document.querySelectorAll('#search-tag-chips [data-a="searchchipremove"]').length===4);
 let list=await chips(page);
 assert.deepEqual(list.map(c=>c.tag),['sakura_miko','hololive','-dog','rating:safe'],'chips mirror the query tokens in order');
 assert.deepEqual(list.map(c=>c.text.replace(/×$/,'').trim()),['sakura miko','hololive','-dog','rating:safe'],'chips read as friendly tag names');
 assert.equal(list[0].label,'Remove sakura miko from the search','each chip says what it removes');
 assert.equal((await state(page)).shown,true,'the chip row is visible with a query');
 assert.equal(await page.locator('#search-tag-chips .search-chip-clear').count(),1,'a multi-token query offers Clear all');

 // dropping a chip rewrites the query, the input and the running search
 await page.locator('#search-tag-chips [data-v="hololive"]').click();
 await page.waitForFunction(()=>S.q==='sakura_miko -dog rating:safe');
 let now=await state(page);
 assert.equal(now.input,'sakura_miko -dog rating:safe','removing a chip rewrites the input too');
 assert.equal(now.search,'sakura_miko -dog rating:safe','removing a chip re-runs the search');
 assert.deepEqual((await chips(page)).map(c=>c.tag),['sakura_miko','-dog','rating:safe'],'only the dropped chip disappears');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.a),'searchchipremove','focus stays on the chip row for the next removal');

 // the row keeps working down to the last chip
 for(const tag of ['-dog','rating:safe'])await page.locator(`#search-tag-chips [data-v="${tag}"]`).click();
 await page.waitForFunction(()=>S.q==='sakura_miko');
 assert.deepEqual((await chips(page)).map(c=>c.tag),['sakura_miko'],'the last chip stays');
 assert.equal(await page.locator('#search-tag-chips .search-chip-clear').count(),0,'a single chip needs no Clear all');

 // clearing returns to the recent searches screen
 await page.fill('#q','sakura_miko hololive');
 await page.waitForFunction(()=>document.querySelectorAll('#search-tag-chips [data-a="searchchipremove"]').length===2);
 await page.locator('#search-tag-chips .search-chip-clear').click();
 await page.waitForFunction(()=>!S.q);
 assert.deepEqual(await chips(page),[],'Clear all empties the chips');
 assert.equal((await state(page)).input,'','Clear all empties the input');
 assert.equal((await state(page)).shown,false,'Clear all hides the chip row');
 await page.waitForSelector('.search-recents','the clear search returns to recent searches');

 // a restored query paints its chips on load
 await page.goto(`${BASE}/?screen=search&q=${encodeURIComponent('sakura_miko hololive')}`);
 await page.waitForFunction(()=>window.PB_APP_READY===true&&document.querySelectorAll('#search-tag-chips [data-a="searchchipremove"]').length===2);
 assert.deepEqual((await chips(page)).map(c=>c.tag),['sakura_miko','hololive'],'a shared or restored query arrives with its chips');
 assert.equal(await page.locator('#search-tag-chips').getAttribute('role'),'group','the chip row is a labelled group');
 assert.equal(await page.locator('#search-tag-chips').getAttribute('aria-label'),'Search tags','the chip row is labelled');

 // leaving the tab and coming back does not leave stale chips
 await page.evaluate(()=>{document.querySelector('#nav [data-v="home"]').click()});
 await page.waitForFunction(()=>S.screen==='home');
 assert.equal(await page.locator('#search-tag-chips').count(),0,'chips live only on the Search tab');
 await page.waitForFunction(()=>!document.getElementById('sres'));
 console.log(`PASS ${label}: the Search tab mirrors the query as removable tag chips, drops re-run the search, and Clear all resets it.`);
 await context.close();
}

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  await run(browser,{width:390,height:844});
  await run(browser,{width:1200,height:900});
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
