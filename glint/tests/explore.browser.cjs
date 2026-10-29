/* Explore mirrors each site's own explore views for the source selected on
   Home (Danbooru Popular/Hot/Most viewed, Moebooru Popular periods, e621
   Popular). A source with one view is the feed itself: two per row, no See
   more, growing as you scroll. Fixture traffic only. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,1200').split(',').map(Number);
const danPost=(id,ext='png')=>({id,md5:'1234567890abcdef1234567890abcdef',image_width:400,image_height:520,file_ext:ext,file_url:`https://cdn.donmai.us/${id}.${ext}`,preview_url:`https://cdn.donmai.us/${id}.png`,large_file_url:`https://cdn.donmai.us/${id}.png`,tag_string:'landscape',tag_string_character:'hatsune_miku',tag_string_artist:'wlop',tag_string_copyright:'vocaloid',rating:'g',score:Number(id)});
const moePost=id=>({id,jpeg_url:`https://files.yande.re/${id}.jpg`,preview_url:`https://files.yande.re/${id}.jpg`,sample_url:`https://files.yande.re/${id}.jpg`,width:400,height:520,tags:'landscape',rating:'s',score:Number(id)});
const e6Post=id=>({id,file:{url:`https://static1.e621.net/${id}.png`,width:400,height:520},preview:{url:`https://static1.e621.net/${id}.png`},sample:{url:`https://static1.e621.net/${id}.png`},tags:{general:['landscape'],character:[],artist:[],copyright:[],species:[]},rating:'s',score:{total:Number(id)}});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],requests=[];
  let failViewed=false;
  page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.stack));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'profile',bt:'Explore',src:'danbooru',srcs:['danbooru','yandere','e621','animepictures'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}
   const target=new URL(envelope?.pb_private===1?envelope.url:u.searchParams.get('u')),host=target.hostname,path=target.pathname,params=target.searchParams;
   requests.push({host,path,params:[...params]});
   let value=[];
   if(failViewed&&path==='/explore/posts/viewed.json')return route.fulfill({status:500,contentType:'application/json',body:'{"message":"viewed is down"}'});
   if(path.endsWith('counts/posts.json'))value={counts:{posts:6}};
   else if(host==='danbooru.donmai.us'&&path==='/explore/posts/popular.json')value=[danPost(101),danPost(102,'mp4'),danPost(103)];
   else if(host==='danbooru.donmai.us'&&path==='/explore/posts/viewed.json')value=[danPost(201),danPost(202)];
   else if(host==='danbooru.donmai.us'&&path==='/explore/posts/searches.json')value=[['zenless_zone_zero',8404.0],['blue_archive',5826.0]];
   else if(host==='danbooru.donmai.us'&&path==='/posts.json')value=params.get('tags')==='order:rank'?[danPost(301),danPost(302)]:[danPost(9)];
   else if(host==='yande.re')value=[moePost(401),moePost(402)];
   else if(host==='e621.net'&&path==='/popular.json')value={posts:[e6Post(501),e6Post(502)]};
   else if(host==='e621.net'&&path==='/posts.json')value={posts:[]};
   else value=[];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto(BASE+'/');await page.waitForFunction(()=>window.PB_APP_READY===true);
  await page.evaluate(()=>{S.screen='profile';S.bt='Explore';render();exploreEnsure()});
  await page.waitForFunction(()=>document.querySelectorAll('.ex-section').length>0);
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();
  const sectionKeys=()=>page.evaluate(()=>[...document.querySelectorAll('.ex-section')].map(s=>s.dataset.ex));
  const cells=k=>page.evaluate(key=>document.querySelectorAll(`.ex-section[data-ex="${key}"] .ex-cell`).length,k);

  // ---- Danbooru: the three views it really has (no Popular searches) -----
  assert.deepEqual(await sectionKeys(),['popular','hot','viewed'],'Danbooru has Popular, Hot and Most viewed');
  assert.equal(await page.locator('.ex-tag, .ex-section[data-ex="searches"]').count(),0,'Popular searches is gone');
  assert.equal(requests.some(r=>r.path==='/explore/posts/searches.json'),false,'no searches request is made');
  await page.waitForFunction(()=>document.querySelectorAll('.ex-section[data-ex="popular"] .ex-cell').length>0);
  assert.equal(await cells('popular'),3);
  assert.equal(await cells('hot'),2);
  assert.equal(await cells('viewed'),2);
  const thumb=await page.evaluate(()=>{const r=document.querySelector('.ex-section[data-ex="popular"] .ex-cell .art').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}});
  assert.ok(Math.abs(thumb.h/thumb.w-5/4)<.03,'Explore thumbnails use the same portrait ratio as Related art cards');
  assert.equal(thumb.w>150,true,'Explore thumbnails are large, not a 132px rail');
  assert.equal(await page.locator('.ex-section[data-ex="popular"] .ex-cell .vidb').count(),1,'only the video post carries a play mark');
  const mark=await page.evaluate(()=>{const cell=document.querySelector('.ex-section .ex-cell .vidb').closest('.ex-cell'),m=document.querySelector('.ex-section .ex-cell .vidb').getBoundingClientRect(),c=cell.querySelector('.art').getBoundingClientRect();return {cx:Math.round(m.left+m.width/2-(c.left+c.width/2)),cy:Math.round(m.top+m.height/2-(c.top+c.height/2))}});
  assert.ok(Math.abs(mark.cx)<=1&&Math.abs(mark.cy)<=1,'the play mark sits on the thumbnail centre');
  const popularRequest=requests.filter(r=>r.path==='/explore/posts/popular.json').at(-1);
  assert.equal(popularRequest.params.find(([k])=>k==='scale')[1],'day','default period is day');
  assert.match(popularRequest.params.find(([k])=>k==='date')[1],/^\d{4}-\d{1,2}-\d{1,2}$/,'the request carries a date like the native explore');
  assert.ok(requests.some(r=>r.path==='/posts.json'&&r.params.some(([k,v])=>k==='tags'&&v==='order:rank')),'Hot is order:rank');
  assert.ok(requests.some(r=>r.path==='/explore/posts/viewed.json'),'Most viewed uses the viewed endpoint');

  // ---- Period switch reloads that view only ------------------------------
  const beforeHot=await page.evaluate(()=>document.querySelectorAll('.ex-section[data-ex="hot"] .ex-cell').length);
  await page.evaluate(()=>{const b=[...document.querySelectorAll('.ex-section[data-ex="popular"] .ex-scale')].find(n=>n.dataset.id==='week');b.click()});
  await page.waitForFunction(()=>document.querySelector('.ex-section[data-ex="popular"]')?.dataset.exScale==='week');
  await page.waitForFunction(()=>document.querySelectorAll('.ex-section[data-ex="popular"] .ex-cell').length>0);
  assert.equal(requests.filter(r=>r.path==='/explore/posts/popular.json').at(-1).params.find(([k])=>k==='scale')[1],'week');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.ex-section[data-ex="hot"] .ex-cell').length),beforeHot,'other views are untouched');

  // ---- See more opens the whole view -------------------------------------
  await press('.ex-section[data-ex="popular"] .ex-more');
  await page.waitForSelector('.ex-feed-sheet #exfeed .grid');
  assert.match(await page.locator('.ex-feed-head h1').innerText(),/Popular/);
  assert.match(await page.locator('.ex-feed-head span').innerText(),/Danbooru.*Week/);
  assert.equal(await page.locator('.ex-feed-sheet .grid .art').count()>0,true);
  const sheetStyle=await page.evaluate(()=>{const s=document.querySelector('.ex-feed-sheet'),r=s.getBoundingClientRect();return {width:Math.round(r.width),height:Math.round(r.height),bg:getComputedStyle(s).backgroundColor,header:getComputedStyle(s.querySelector('.ex-feed-head')).backgroundColor}});
  assert.equal(sheetStyle.width,width,'See more is full-width like Related art');
  assert.ok(Math.abs(sheetStyle.height-844)<=2,'See more is full-height like Related art');
  assert.match(sheetStyle.bg,/0\.54\)/,'See more uses the translucent Related art surface');
  assert.match(sheetStyle.header,/0\.38\)/,'the sticky heading is translucent too');
  await page.locator('.ex-feed-head [data-a="close"]').click();
  await page.waitForTimeout(120);
  const exitY=await page.locator('.ex-feed-sheet').evaluate(node=>node.getBoundingClientRect().top);
  assert.ok(exitY>0,'close animates the page down');
  await page.waitForFunction(()=>!document.querySelector('#ov').classList.contains('show'));

  // A downward pull from the top of the scroller dismisses it in the same direction.
  await press('.ex-section[data-ex="popular"] .ex-more');
  await page.waitForSelector('.ex-feed-sheet #exfeed .grid');
  await page.waitForTimeout(550);
  await page.evaluate(()=>{const panel=document.querySelector('.ex-feed-sheet'),target=panel.querySelector('.grid .art'),r=target.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/3;const touch=(clientY)=>new Touch({identifier:1,target,clientX:x,clientY});const start=touch(y);panel.dispatchEvent(new TouchEvent('touchstart',{touches:[start],targetTouches:[start],changedTouches:[start],bubbles:true,cancelable:true}));for(const dy of [25,55,90,130]){const t=touch(y+dy);panel.dispatchEvent(new TouchEvent('touchmove',{touches:[t],targetTouches:[t],changedTouches:[t],bubbles:true,cancelable:true}))}const end=touch(y+130);panel.dispatchEvent(new TouchEvent('touchend',{touches:[],targetTouches:[],changedTouches:[end],bubbles:true,cancelable:true}))});
  await page.waitForFunction(()=>!document.querySelector('#ov').classList.contains('show'));

  // ---- Tapping a post opens it (it is a real pin, not "no longer available")
  await press('.ex-section[data-ex="popular"] .ex-cell [data-a="open"]');
  await page.waitForFunction(()=>postView()?.kind==='post');
  assert.equal(await page.locator('.toast', {hasText:/no longer available/i}).count(),0,'opening an Explore post shows no "no longer available" toast');
  await page.evaluate(()=>close());
  await page.waitForTimeout(150);

  // ---- Another source gets its own views ---------------------------------
  await page.evaluate(()=>{S.screen='profile';S.bt='Explore';S.src='yandere';render();exploreReset('yandere');exploreEnsure()});
  await page.waitForFunction(()=>document.querySelectorAll('.ex-section[data-ex="popular"] .ex-grid .col > div').length>0);
  assert.deepEqual(await sectionKeys(),['popular'],'Moebooru offers one Popular view');
  assert.equal(await page.locator('[data-a="exopen"]').count(),0,'a single view is the feed: no See more');
  assert.equal(await page.locator('.ex-grid .col > div').count()>0,true,'a single view uses the same masonry feed as Home');
  const feedSizing=await page.evaluate(()=>{const grid=document.querySelector('.ex-grid'),col=grid.querySelector('.col'),card=col.querySelector('.art');return {columns:grid.querySelectorAll(':scope > .col').length,setting:S.cols,gridWidth:grid.clientWidth,colWidth:col.getBoundingClientRect().width,cardWidth:card.getBoundingClientRect().width,gap:parseFloat(getComputedStyle(grid).gap)}});
  assert.equal(feedSizing.columns,feedSizing.setting,'source feed respects the same column setting as Home');
  assert.ok(Math.abs(feedSizing.cardWidth-(feedSizing.gridWidth-feedSizing.gap*(feedSizing.columns-1))/feedSizing.columns)<2,'art tiles fill each Home-sized masonry column');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.ex-section[data-ex="popular"] .ex-scale')].map(n=>n.dataset.id)),['recent','day','week','month'],'yande.re popular periods');
  assert.ok(requests.some(r=>r.host==='yande.re'&&r.path==='/post/popular_recent.json'&&r.params.some(([k,v])=>k==='period'&&v==='1d')),'Recent is popular_recent 1d');
  await page.evaluate(()=>{const b=[...document.querySelectorAll('.ex-scale')].find(n=>n.dataset.id==='week');b.click()});
  await page.waitForFunction(()=>document.querySelector('.ex-section')?.dataset.exScale==='week');
  assert.ok(requests.some(r=>r.host==='yande.re'&&r.path==='/post/popular_by_week.json'),'Week is popular_by_week');

  await page.evaluate(()=>{S.src='e621';render();exploreReset('e621');exploreEnsure()});
  await page.waitForFunction(()=>document.querySelectorAll('.ex-grid .col > div').length>0);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.ex-scale')].map(n=>n.dataset.id)),['day','week','month']);
  assert.equal(await page.locator('[data-a="exopen"]').count(),0,'e621 shows its one view as a feed too');
  assert.ok(requests.some(r=>r.host==='e621.net'&&r.path==='/popular.json'&&r.params.some(([k,v])=>k==='scale'&&v==='day')),'e621 uses popular.json with a scale');

  // ---- A source with no explore page says so, and offers no fake view -----
  await page.evaluate(()=>{S.src='animepictures';render();exploreReset('animepictures');exploreEnsure()});
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.ex-section').count(),0,'no fabricated explore view');
  assert.match(await page.locator('.glint-ex-empty').innerText(),/doesn.t offer an Explore feed/i);
  assert.equal(requests.some(r=>r.host==='api.anime-pictures.net'&&/popular|explore/.test(r.path)),false,'no popularity request is invented for it');

  // ---- A failing view reports itself without blanking the others ---------
  await page.evaluate(()=>{S.src='danbooru';render();exploreReset('danbooru')});
  failViewed=true;
  await page.evaluate(()=>{exploreEnsure(true)});
  await page.waitForFunction(()=>document.querySelector('.ex-section[data-ex="viewed"] .ex-error'));
  assert.equal(await page.locator('.ex-section[data-ex="popular"] .ex-cell').count()>0,true,'a broken view does not blank the others');
  assert.match(await page.locator('.ex-section[data-ex="viewed"] .ex-error').innerText(),/viewed is down/);
  assert.equal(await page.locator('.ex-section[data-ex="viewed"] [data-a="exretry"]').count(),1,'the broken view offers Retry');

  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: Danbooru Popular/Hot/Most viewed shelves with period switch and See more; single-view sources match Home masonry sizing and columns; posts open instead of reading as missing; yande.re and e621 native periods; no fabricated view; isolated failures.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
