/* Moebooru tag categories decide whether a name is an Artist, a Character or a
   Series. They must be known when the post opens — not one request later — and
   once learned they must be remembered. Fixture traffic only. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const moePost=(id,tags)=>({id,md5:String(id).padStart(32,'c'),tags,width:400,height:520,file_ext:'jpg',
  file_url:`https://assets.yande.re/orig/${id}.jpg`,preview_url:`https://assets.yande.re/prev/${id}.jpg`,sample_url:`https://assets.yande.re/sample/${id}.jpg`,
  rating:'s',score:10,created_at:'2026-10-20T10:00:00Z'});
/* The two posts share the artist tag; only the feed's tag map teaches the app
   which category it belongs to. */
const FEED={posts:[moePost(501,'shirona_(canvas+garden) miyasaka_miyu wuthering_waves blue_hair solo')],
  tags:{'shirona_(canvas+garden)':'artist','miyasaka_miyu':'character','wuthering_waves':'copyright','blue_hair':'general'}};
const SHORT_FEED=[moePost(502,'shirona_(canvas+garden) miyasaka_miyu blue_hair')];   // no tag map at all
const widths=(process.env.PINBOARD_TEST_WIDTHS||'390').split(',').map(Number);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],urls=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');
    if(!localStorage.getItem('__tagtypes')){localStorage.setItem('__tagtypes','1');
      localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'yandere',srcs:['yandere'],bookmarks:[],bookmarkVersion:1}))}});
  let shortMode=false;
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}
   const target=new URL(envelope?.pb_private===1?envelope.url:u.searchParams.get('u'));
   urls.push(target.href);
   if(target.pathname.endsWith('counts/posts.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({counts:{posts:2}})});
   if(target.pathname==='/post.json')return route.fulfill({contentType:'application/json',body:JSON.stringify(shortMode?SHORT_FEED:FEED)});
   return route.fulfill({contentType:'application/json',body:'[]'});
  });
  await page.goto(BASE+'/');
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>0);

  // 1. the feed request itself asks for the tag categories
  const list=urls.find(u=>u.includes('/post.json')&&u.includes('limit='));
  assert.match(list,/include_tags=1/,'the feed asks for tag categories in the same request');
  assert.match(list,/api_version=2/,'…and for the version that returns them');

  // 2. the names are already classified before the post is opened
  const meta=await page.evaluate(()=>{const p=[...document.querySelectorAll('.grid [data-id]')].map(e=>pin(e.dataset.id))[0];
    return {artists:p.artists,characters:p.characters,series:p.series,ready:p.detailsReady}});
  assert.deepEqual(meta.artists,['shirona_(canvas+garden)'],'the artist is an artist, not a general tag');
  assert.deepEqual(meta.characters,['miyasaka_miyu']);
  assert.deepEqual(meta.series,['wuthering_waves']);
  assert.equal(meta.ready,true,'categorized details are ready from the feed');

  // 3. opening the post paints all three rows immediately, with no extra request
  const requestsBefore=urls.length;
  await page.evaluate(()=>document.querySelector('.grid [data-a="open"]').click());
  await page.waitForSelector('#sheet .post-info');
  const rows=await page.evaluate(()=>[...document.querySelectorAll('#sheet .post-info .post-info-row')].map(r=>({
    field:r.dataset.field,names:[...r.querySelectorAll('.post-tag-inline')].map(n=>n.textContent.trim())})));
  assert.deepEqual(rows.map(r=>r.field),['character','series','artist'],'Character / Series / Artist are on screen at first paint');
  assert.deepEqual(rows.find(r=>r.field==='artist').names,['Shirona (Canvas+Garden)']);
  assert.deepEqual(rows.find(r=>r.field==='character').names,['Miyasaka Miyu']);
  assert.equal(urls.length,requestsBefore,'no extra request was needed to learn the categories');

  // 4. what was learned is remembered for the next launch
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('pb-tag-types-v1')||'{}'));
  assert.equal(stored['shirona_(canvas+garden)'],'artist','the learned category is stored on the device');
  assert.equal(stored['miyasaka_miyu'],'character');

  // 5. a later response that carries no tag map still classifies correctly
  await page.evaluate(()=>close());
  shortMode=true;
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>0);
  const after=await page.evaluate(()=>{const p=[...document.querySelectorAll('.grid [data-id]')].map(e=>pin(e.dataset.id))[0];
    return {artists:p.artists,characters:p.characters}});
  assert.deepEqual(after.artists,['shirona_(canvas+garden)'],'a response without a tag map still knows the artist');
  assert.deepEqual(after.characters,['miyasaka_miyu']);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: yande.re posts arrive with their Artist/Character/Series categories already known (include_tags in the feed call), the post page paints them at once with no extra request, and the learned categories survive a reload.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
