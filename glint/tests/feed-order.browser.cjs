/* Home / Explore order: Newest (source default) or Popular (server-side score).
   Fixture traffic only. Likes and Bookmarks must keep their own order controls. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const post=id=>({id,md5:'1234567890abcdef1234567890abcdef',image_width:400,image_height:520,file_url:`https://cdn.donmai.us/${id}.png`,preview_url:`https://cdn.donmai.us/${id}.png`,large_file_url:`https://cdn.donmai.us/${id}.png`,tag_string:'landscape',rating:'g',score:Number(id)});
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,1200').split(',').map(Number);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');if(!sessionStorage.getItem('__order_seed')){sessionStorage.setItem('__order_seed','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru','yandere','animepictures'],bookmarks:[],bookmarkVersion:1}))}});
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}
   const target=new URL(envelope?.pb_private===1?envelope.url:u.searchParams.get('u')),tags=target.searchParams.get('tags')||'';
   if(!envelope)requests.push({host:target.hostname,path:target.pathname,tags,params:[...target.searchParams]});
   let value=[];
   if(target.pathname.endsWith('counts/posts.json'))value={counts:{posts:6}};
   else if(target.pathname==='/post.xml')return route.fulfill({contentType:'application/xml',body:`<posts count="0"></posts>`});
   else if(/order:score|sort:score|sf=score/.test(target.href+tags))value=[post(3),post(9),post(5)];
   else value=[post(9),post(5),post(3)];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto(BASE+'/');await page.waitForFunction(()=>S.live.danbooru?.length&&!LOADING);
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();
  // Home is control-free and always shows the source's own newest uploads.
  assert.equal(await page.locator('.feed-sort').count(),0,'Home shows no order control');
  assert.equal(await page.locator('.feed-tools').count(),0);
  assert.equal(await page.evaluate(()=>S.live.danbooru.map(p=>p.sid).join(',')),'9,5,3');
  assert.doesNotMatch(requests.filter(r=>r.host==='danbooru.donmai.us'&&r.path==='/posts.json').at(-1).tags,/order:|sort:/);
  // A saved per-source order never leaks into Home either.
  await page.evaluate(()=>{S.forder={danbooru:'popularity'};S.live.danbooru=[];S.lpage.danbooru=1;MORE=true;render();loadLive(true)});
  await page.waitForFunction(()=>S.live.danbooru?.length&&!LOADING);
  assert.doesNotMatch(requests.filter(r=>r.host==='danbooru.donmai.us'&&r.path==='/posts.json').at(-1).tags,/order:|sort:/,'Home ignores a stored popularity choice');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.feed-sort').length),0,'still no Home control');
  // Search has its own control: changing Home order must not rewrite a search.
  await page.evaluate(()=>{S.src='danbooru';S.screen='search';S.q='landscape';render();doSearch('landscape',true)});await page.waitForFunction(()=>SEARCH&&!SEARCH.busy&&SEARCH.pins?.length);
  const before=await page.evaluate(()=>SEARCH.order);await page.evaluate(()=>{S.screen='home';render()});
  assert.equal(await page.evaluate(()=>SEARCH.order),before,'Home order must not mutate search order');
  // Explore no longer mixes the row or carries a sort chip: it mirrors the
  // selected source's own explore views instead (see explore.browser.cjs).
  await page.evaluate(()=>{S.forder={};S.screen='profile';S.bt='Explore';render();exploreEnsure()});
  await page.waitForSelector('.ex-sections');
  assert.equal(await page.locator('.exhead-row .feed-sort').count(),0,'Explore has no mixed-feed order chip');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.ex-section').length>0),true,'Explore lists native views');
  assert.deepEqual(errors,[]);await context.close();
  console.log(`PASS ${width}px: control-free Home, Popular on Explore (per source, persisted); per-source persistence, other-source isolation, honest unsupported state, independent search and bookmark sort.`);
 }
 // Sources that cannot sort never receive a popularity request.
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',src:'animepictures',srcs:['animepictures'],forder:{animepictures:'popularity'}}))});
 await page.route('**/api/proxy**',route=>{const u=new URL(route.request().url()),target=new URL(u.searchParams.get('u')||'https://api.anime-pictures.net/api/v3/posts');assert.doesNotMatch(target.href,/(?:order|sort)[:%=]/i,'unsupported source must not get a sort parameter');return route.fulfill({contentType:'application/json',body:'[]'})});
 await page.goto(BASE+'/');await page.waitForFunction(()=>window.PB_APP_READY);await page.waitForTimeout(300);
 // Home has no order control at all, so nothing unsupported can be offered there.
 assert.equal(await page.locator('.feed-sort').count(),0,'Home never shows an order control');
 // The order controls that do exist (related art, tag feed) are disabled with a reason.
 const controls=await page.evaluate(()=>{
  const wrap=document.createElement('div');
  wrap.innerHTML=relatedHeaderHTML({id:'danbooru:1',src:'animepictures',order:'popularity'});
  const chip=wrap.querySelector('.related-sort');
  return {supported:pbPostPopularitySupported('animepictures'),disabled:chip.disabled,title:chip.title,label:chip.textContent.trim(),order:chip.dataset.order};
 });
 assert.equal(controls.supported,false);
 assert.equal(controls.disabled,true,'no fake Popular control for an unsupported source');
 assert.match(controls.title,/not available/);
 assert.equal(controls.label,'Newest','an unsupported source always falls back to Newest');
 assert.deepEqual(errors,[]);
 console.log('PASS unsupported source: no Home control, disabled order controls elsewhere, no popularity request, no page errors.');await context.close();
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
