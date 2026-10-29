/* Nothing searches while you type: the text waits in the box until Enter (or an
   explicit action — dropping a chip, picking a suggestion, the search button, a
   recent search or a shared link). The accent ring shows a query that has not
   been applied yet. Bookmarks and Likes behave the same way: a half-typed token
   is a draft and only applies once it is committed. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';

const chips=page=>page.$$eval('#search-tag-chips [data-a="searchchipremove"]',nodes=>nodes.map(n=>n.dataset.v));
const pending=page=>page.evaluate(()=>document.querySelector('.search-tag-field')?.classList.contains('glint-search-pending'));

async function run(browser,{width,height}){
 const label=`${width}x${height}`;
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 const page=await context.newPage();
 page.setDefaultTimeout(8000);
 const searched=[];
 await page.addInitScript(()=>{
  localStorage.setItem('pb-swipe-hint-v22','1');
  localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'search',src:'danbooru',srcs:['danbooru'],theme:'dark',bookmarks:[],bookmarkVersion:1}));
  localStorage.setItem('pb-auth',JSON.stringify({gelbooru:{login:'12345',apiKey:'fixture-key'}}));
 });
 await page.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#3d5a66"/></svg>'});
  if(u.pathname==='/api/proxy'){const body=req.postData()||'';searched.push(/count/i.test(body)?'count':'posts');return route.fulfill({status:200,contentType:'application/json',body:'[]'})}
  return u.hostname==='127.0.0.1'?route.continue():route.abort();
 });
 await page.goto(`${BASE}/?screen=search`);
 await page.waitForFunction(()=>window.PB_APP_READY===true);
 await page.waitForSelector('#q');

 // typing drafts: no search, no count request, but the chips follow along
 await page.click('#q');
 await page.type('#q','sakura_miko hololive',{delay:25});
 await page.waitForTimeout(900);
 assert.equal(await page.evaluate(()=>SEARCH?.query??null),null,'typing never starts a search by itself');
 assert.notEqual(await page.evaluate(()=>SEARCH_COUNT?.query??''),'sakura_miko hololive','typing never asks for a count of the typed text');
 assert.equal(await page.evaluate(()=>S.q),'','the applied query is still empty');
 assert.deepEqual(await chips(page),['sakura_miko','hololive'],'chips still mirror what is typed');
 assert.equal(await pending(page),true,'the box is marked as holding unapplied text');

 // Enter runs it
 await page.press('#q','Enter');
 await page.waitForFunction(()=>SEARCH?.query==='sakura_miko hololive');
 assert.equal(await page.evaluate(()=>S.q),'sakura_miko hololive','Enter applies the query');
 assert.equal(await pending(page),false,'the pending mark clears once the query is applied');
 assert.ok(searched.includes('posts'),'a real search ran on Enter');

 // typing again leaves the applied results alone
 await page.fill('#q','sakura_miko hololive -dog');
 await page.waitForTimeout(700);
 assert.equal(await page.evaluate(()=>SEARCH.query),'sakura_miko hololive','the applied search is untouched while typing');
 assert.equal(await pending(page),true,'editing re-arms the pending mark');
 await page.press('#q','Enter');
 await page.waitForFunction(()=>SEARCH?.query==='sakura_miko hololive -dog');

 // the search button applies it too
 await page.fill('#q','thomas_8000');
 await page.locator('.search-submit').click();
 await page.waitForFunction(()=>SEARCH?.query==='thomas_8000','the search button applies the text');

 // dropping a chip is an explicit choice and applies at once
 await page.fill('#q','sakura_miko hololive');
 await page.press('#q','Enter');
 await page.waitForFunction(()=>SEARCH?.query==='sakura_miko hololive');
 await page.locator('#search-tag-chips [data-v="hololive"]').click();
 await page.waitForFunction(()=>SEARCH?.query==='sakura_miko','removing a chip re-runs the search without Enter');

 // a shared or restored link still shows its results straight away
 await page.goto(`${BASE}/?screen=search&q=${encodeURIComponent('sakura_miko hololive')}`);
 await page.waitForFunction(()=>window.PB_APP_READY===true&&SEARCH?.query==='sakura_miko hololive');
 assert.equal(await pending(page),false,'a restored query is already applied');
 assert.deepEqual(await chips(page),['sakura_miko','hololive'],'a restored query paints its chips');

 // Bookmarks: a half-typed token waits, Enter (or a committed chip) applies it
 await page.evaluate(()=>{S.screen='profile';S.bt='Bookmarks';render();document.getElementById('app').classList.add('glint-filters-open')});
 await page.waitForSelector('#bookmarkSearch',{state:'visible'});
 await page.fill('#bookmarkSearch','sakura');
 await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>BOOKMARK_VIEW.query),'','typing in Bookmarks does not filter yet');
 assert.equal(await page.evaluate(()=>document.querySelector('.bookmark-search').classList.contains('glint-search-pending')),true,'Bookmarks marks the unapplied text');
 await page.press('#bookmarkSearch','Enter');
 await page.waitForFunction(()=>BOOKMARK_VIEW.query==='sakura','Enter applies the bookmark search');
 assert.equal(await page.evaluate(()=>document.querySelector('.bookmark-search').classList.contains('glint-search-pending')),false,'the bookmark mark clears once applied');
 await page.press('#bookmarkSearch','End');
 await page.type('#bookmarkSearch',' miko ');
 await page.waitForFunction(()=>BOOKMARK_VIEW.query==='sakura miko','committing a chip with space applies it');
 assert.deepEqual(await page.$$eval('.bookmarks-filters [data-selected-search-tag]',nodes=>nodes.map(n=>n.dataset.selectedSearchTag)),['sakura','miko'],'the committed tags are chips');

 // Likes, when the source supports them, follows the same rule
 // A fixture Gelbooru account is enough to show the Likes tab; no real traffic.
 const likes=await page.evaluate(()=>{if(!PB_SOURCES.gelbooru)return null;S.src='gelbooru';if(!hasLikesTab())return null;S.screen='profile';S.bt='Likes';render();GLINT_LIKES_SEARCH.open=true;refreshPane('Likes');return true});
 if(likes){
  await page.waitForSelector('#likesSearch',{state:'visible'});
  await page.fill('#likesSearch','sakura');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>GLINT_LIKES_SEARCH.queries[S.src]||''),'','typing in Likes does not query the account yet');
  await page.press('#likesSearch','Enter');
  await page.waitForFunction(()=>(GLINT_LIKES_SEARCH.queries[S.src]||'')==='sakura','Enter applies the likes search');
 }
 console.log(`PASS ${label}: typing only drafts, Enter searches, chips and explicit actions apply at once${likes?'':' (Likes tab unavailable in fixtures)'}.`);
 await context.close();
}

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  await run(browser,{width:390,height:844});
  await run(browser,{width:1200,height:900});
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
