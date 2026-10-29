/* Smoothness budget for the feed, measured rather than described:
   • loading the next page must not rebuild the cards that are already there
     (same DOM nodes, same decoded pictures, same scroll position)
   • a burst of state changes is one localStorage write, not one per render
   • scrolling never forces a synchronous layout read per event
   • offscreen cards are skipped by the renderer (content-visibility)
   • a fast flick of the feed produces no long frames
   Fixture traffic only, so the numbers do not depend on the site. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const post=id=>({id,md5:String(id).padStart(32,'0'),image_width:400,image_height:300+(id*37)%400,file_ext:'jpg',
  file_url:`https://cdn.donmai.us/${id}.jpg`,preview_url:`https://cdn.donmai.us/p/${id}.jpg`,large_file_url:`https://cdn.donmai.us/s/${id}.jpg`,
  tag_string:'landscape',rating:'g',score:1,created_at:'2026-10-20T10:00:00Z'});
const widths=(process.env.PINBOARD_TEST_WIDTHS||'390').split(',').map(Number);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');
    if(!localStorage.getItem('__smooth')){localStorage.setItem('__smooth','1');
      localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))}
    // count state writes and long frames
    window.__writes=0;const setItem=localStorage.setItem.bind(localStorage);
    localStorage.setItem=(k,v)=>{if(k==='pb2')window.__writes++;return setItem(k,v)};
    window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration))}).observe({entryTypes:['longtask']})}catch(e){}
    window.__frames=[];let last=0;const tick=t=>{if(last)window.__frames.push(Math.round(t-last));last=t;requestAnimationFrame(tick)};requestAnimationFrame(tick);
  });
  let page_no=0;
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}
   const target=new URL(envelope?.pb_private===1?envelope.url:u.searchParams.get('u'));
   if(target.pathname.endsWith('counts/posts.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({counts:{posts:120}})});
   if(!/\.json$/.test(target.pathname))return route.fulfill({contentType:'application/json',body:'[]'});
   page_no++;
   const base=1000-page_no*40;
   return route.fulfill({contentType:'application/json',body:JSON.stringify(Array.from({length:40},(_,i)=>post(base-i)))});
  });
  await page.goto(BASE+'/');
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>=40);
  await page.waitForTimeout(300);

  /* ---------- 1. offscreen cards are skipped by the renderer ---------- */
  const cv=await page.evaluate(()=>getComputedStyle(document.querySelector('.feedwrap .grid .col>div')).contentVisibility);
  assert.equal(cv,'auto','offscreen cards use content-visibility');

  /* ---------- 2. the first screenful is high priority, the rest lazy ---------- */
  const prio=await page.evaluate(()=>[...document.querySelectorAll('.grid .art img')].slice(0,10).map(i=>({l:i.loading,p:i.getAttribute('fetchpriority')})));
  assert.ok(prio.slice(0,4).every(x=>x.l==='eager'&&x.p==='high'),'the first pictures load eagerly at high priority');
  assert.ok(prio.slice(6).every(x=>x.l==='lazy'&&x.p==='low'),'the rest stay lazy and low priority');

  /* ---------- 3. the next page is appended, not re-rendered ---------- */
  const before=await page.evaluate(()=>{window.__first=document.querySelector('.grid .art img');window.__dom=document.querySelector('.grid .col');window.__count=document.querySelectorAll('.grid [data-id]').length;window.__writes=0;window.__long=[];window.__frames=[];return window.__count});
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForFunction(n=>document.querySelectorAll('.grid [data-id]').length>n,before,{timeout:20000});
  await page.waitForTimeout(400);
  const grown=await page.evaluate(()=>({
    count:document.querySelectorAll('.grid [data-id]').length,
    sameFirstImage:window.__first===document.querySelector('.grid .art img'),
    sameColumn:window.__dom===document.querySelector('.grid .col'),
    firstId:document.querySelector('.grid [data-id]').dataset.id,
    scrollY:Math.round(scrollY),
    long:window.__long.slice()}));
  assert.ok(grown.count>before,'the next page arrived');
  assert.equal(grown.sameFirstImage,true,'the picture that was already on screen is the same node — no re-decode, no flash');
  assert.equal(grown.sameColumn,true,'the grid columns were extended, not rebuilt');
  assert.equal(grown.firstId,'danbooru:960','the feed still starts at the newest post (order untouched)');
  assert.equal(grown.scrollY>0,true,'the page did not jump back to the top');
  assert.deepEqual(grown.long,[],'appending a page produced no long task');

  /* ---------- 4. scroll handling is one rAF per frame ---------- */
  // scrollHeight lives on Element.prototype; every read is a forced layout.
  const reads=await page.evaluate(async()=>{
    let forced=0;const desc=Object.getOwnPropertyDescriptor(Element.prototype,'scrollHeight');
    Object.defineProperty(Element.prototype,'scrollHeight',{configurable:true,get(){forced++;return desc.get.call(this)}});
    for(let i=0;i<30;i++){scrollBy(0,180);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}
    Object.defineProperty(Element.prototype,'scrollHeight',desc);
    return forced;
  });
  assert.ok(reads<=34,`a 30-step flick reads the document height at most once per frame (${reads})`);

  /* ---------- 5. bursts of state changes coalesce into one write ---------- */
  await page.evaluate(()=>{window.__writes=0;for(let i=0;i<12;i++){S.tab='All';render()}});
  await page.waitForTimeout(700);
  const writes=await page.evaluate(()=>window.__writes);
  assert.ok(writes<=2,`12 renders write storage ${writes} time(s), not 12`);
  await page.evaluate(()=>{window.__writes=0;toggleBookmark('danbooru:960')});
  assert.ok(await page.evaluate(()=>window.__writes)>=1,'a bookmark is written immediately, not deferred');

  /* ---------- 6. no long frames while flicking through a long feed ---------- */
  await page.evaluate(()=>{window.__frames=[];window.__long=[]});
  for(let i=0;i<24;i++){await page.evaluate(()=>scrollBy(0,300));await page.waitForTimeout(16)}
  const scroll=await page.evaluate(()=>({slow:window.__frames.filter(x=>x>50).length,long:window.__long.length}));
  assert.equal(scroll.slow,0,`no dropped-frame spikes while scrolling (${scroll.slow})`);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: the next page is appended in place (same nodes, no flash, no long task), scrolling costs at most one layout read per frame and no dropped frames, offscreen cards are skipped, and a burst of renders is one storage write.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
