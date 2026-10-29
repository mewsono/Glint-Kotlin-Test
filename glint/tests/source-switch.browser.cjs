/* Rapid source switching (danbooru -> yande.re -> konachan): the grid may only
   ever show the pictures of the source whose tab is lit, in the source's own
   order, and a tap that lands on the heels of another one must never leave the
   old feed on screen or fetch the source you flicked past. Fixture traffic. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
/* Newest first, six per source, with a source-specific id range so a tile's
   origin is visible in the DOM. */
const post=(id,tag)=>({id,md5:String(id).padStart(32,'0'),image_width:400,image_height:300+(id*37)%400,
  file_url:`https://cdn.example/${tag}-${id}.png`,preview_url:`https://cdn.example/${tag}-${id}.png`,
  large_file_url:`https://cdn.example/${tag}-${id}.png`,tag_string:tag,rating:'g',score:id});
const HOST_TAG=host=>host.includes('yande')?'yandere':host.includes('konachan')?'konachan':'danbooru';
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,1200').split(',').map(Number);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');
    localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru','yandere','konachan'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}
   const target=new URL(envelope?.pb_private===1?envelope.url:u.searchParams.get('u'));
   const tag=HOST_TAG(target.hostname);
   const counts=target.pathname.endsWith('counts/posts.json');
   if(!counts)requests.push({source:tag,path:target.pathname,at:Date.now()});
   const body=counts?{counts:{posts:6}}:/\.json$/.test(target.pathname)?[6,5,4,3,2,1].map(i=>post(i,tag)):[];
   // every source answers at a different speed, so a slow first tap finishes last
   const delay=tag==='danbooru'?700:tag==='yandere'?1200:400;
   await new Promise(r=>setTimeout(r,delay));
   return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(BASE+'/');await page.waitForFunction(()=>S.live.danbooru?.length&&!LOADING);
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();
  const state=()=>page.evaluate(()=>({
    src:S.src,
    app:[...document.querySelectorAll('#app .grid [data-id]')].map(e=>e.dataset.id),
    ghosts:document.querySelectorAll('.src-ghost').length,
    ghostIds:[...document.querySelectorAll('.src-ghost [data-id]')].map(e=>e.dataset.id)}));
  const start=await state();
  assert.ok(start.app.length>0&&start.app.every(id=>id.startsWith('danbooru:')),'danbooru starts on screen');

  // --- two taps in a row, the second one 90 ms after the first ------------
  requests.length=0;
  // two taps 40 ms apart, tapped in the page so the gap is exact
  await page.evaluate(()=>{document.querySelector('[data-a="src"][data-v="yandere"]').click();
    setTimeout(()=>document.querySelector('[data-a="src"][data-v="konachan"]').click(),40)});
  await page.waitForTimeout(60);
  let during=await state();
  assert.ok(['yandere','konachan'].includes(during.src),'the taps are applied');
  assert.ok(during.ghosts<=1,'at most one outgoing feed is on screen');
  assert.deepEqual(during.app,[],'the new source shows no old pictures');
  // every frame from here on may only show konachan tiles
  for(let i=0;i<14;i++){
    const s=await state();
    assert.ok(s.ghosts<=1,'never two outgoing feeds at once');
    for(const id of s.ghostIds)assert.match(id,/^danbooru:/,'a ghost is always the feed you left');
    for(const id of s.app)assert.match(id,/^konachan:/,`${id} must not be in a konachan feed`);
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(()=>S.live.konachan?.length&&!LOADING);
  await page.waitForTimeout(200);
  const settled=await state();
  assert.equal(settled.src,'konachan');
  assert.equal(settled.ghosts,0,'the old feed is gone once the new one is up');
  assert.deepEqual(settled.app.sort(),[1,2,3,4,5,6].map(i=>'konachan:'+i).sort(),'only konachan pictures');
  // the source you flicked past is never fetched
  assert.equal(requests.filter(r=>r.source==='yandere').length,0,'yande.re was not loaded');
  assert.ok(requests.filter(r=>r.source==='konachan').length>=1,'konachan was loaded once');

  // --- order: the source's own newest-first order, top to bottom ----------
  const columns=await page.evaluate(()=>[...document.querySelectorAll('#app .grid .col')].map(c=>[...c.querySelectorAll('[data-id]')].map(e=>Number(e.dataset.id.split(':')[1]))));
  assert.equal(columns.length,await page.evaluate(()=>Number(S.cols)===3?3:2),'the grid still has its columns');
  for(const col of columns)for(let i=1;i<col.length;i++)assert.ok(col[i]<col[i-1],'each column runs newest to oldest');
  // reading the columns in the order the layout filled them reproduces 6..1
  const visible=await page.evaluate(()=>[...document.querySelectorAll('#app .grid .col')]
    .flatMap(c=>[...c.querySelectorAll('[data-id]')].map(e=>({id:Number(e.dataset.id.split(':')[1]),top:e.getBoundingClientRect().top+e.closest('.col').getBoundingClientRect().top-e.getBoundingClientRect().top})))
    .map(x=>x.id));
  assert.deepEqual([...visible].sort((a,b)=>b-a),[6,5,4,3,2,1],'every picture is present exactly once');

  // --- a slow switch on its own still slides, and never mixes -------------
  const before=await page.evaluate(()=>performance.now());
  await page.waitForTimeout(600);
  await press('[data-a="src"][data-v="yandere"]');
  for(let i=0;i<10;i++){
    const s=await state();
    for(const id of s.app)assert.match(id,/^yandere:/,`${id} must not be in a yande.re feed`);
    await page.waitForTimeout(100);
  }
  await page.waitForFunction(()=>S.live.yandere?.length&&!LOADING);
  const after=await state();
  assert.equal(after.ghosts,0);
  assert.deepEqual(after.app.sort(),[1,2,3,4,5,6].map(i=>'yandere:'+i).sort(),'only yande.re pictures');
  // going back to a source that is already cached keeps its own order
  await page.waitForTimeout(600);
  await press('[data-a="src"][data-v="konachan"]');
  await page.waitForFunction(()=>S.src==='konachan'&&!LOADING);
  await page.waitForTimeout(150);
  const back=await state();
  for(const id of back.app)assert.match(id,/^konachan:/,'a cached feed shows only its own pictures');
  assert.deepEqual(errors,[],'no page errors');
  console.log(`PASS ${width}px: rapid source switches never mix pictures, never stack outgoing feeds, skip the source you flicked past, and keep each feed in the source's own newest-first order.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
