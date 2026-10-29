/* Image-card status markers: no real source credentials or network. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="414" height="600"><rect width="414" height="600" fill="#627e81"/><path d="M0 420L130 220 414 600H0Z" fill="#d2aa91"/></svg>';
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,1200]){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(9000);
  await page.addInitScript(({theme})=>{
   localStorage.setItem('pb-swipe-hint-v22','1');
   // The old local Likes array is deliberately not source truth.
   localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'e621',srcs:['e621'],theme,bookmarks:[],likes:['e621:101'],bookmarkVersion:1}));
   localStorage.setItem('pb-auth',JSON.stringify({e621:{login:'fixture',apiKey:'fixture-only'}}));
  },{theme:width===390?'light':'dark'});
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname==='/api/proxy')return route.fulfill({contentType:'application/json',body:'{"posts":[]}'});
   return u.hostname==='127.0.0.1'?route.continue():route.abort();
  });
  await page.goto(BASE);await page.waitForFunction(()=>window.PB_APP_READY===true);await page.waitForTimeout(220);await page.waitForFunction(()=>!LOADING);
  await page.evaluate(()=>{
   const rows=[101,102,103,104,105].map(id=>{
    const p=normPin({sid:id,grid:'https://static1.e621.net/fixture.png',sample:'https://static1.e621.net/fixture.png',orig:'https://static1.e621.net/fixture.png',w:414,h:600,tags:[]},'e621');
    Object.assign(p,{characters:[],artists:[],series:[],detailsReady:true,fileInfoReady:true,sourceInfoReady:true,uploadInfoReady:true});return p;
   });
   rows[4].orig='https://static1.e621.net/fixture.webm';rows[4].fileType='webm';
   window.__statusPins=rows;window.pbFavoriteStatus=async()=>false;window.pbSetFavorite=async(src,sid,want)=>want;
   S.live.e621=rows;S.screen='home';S.bookmarks=[{id:'e621:102',savedAt:100},{id:'e621:104',savedAt:101},{id:'e621:105',savedAt:102}];
   forgetBookmarkIds();rows.forEach(rememberPin);seedRemoteLike(rows[2]);seedRemoteLike(rows[3]);render();
  });
  const card=id=>page.locator(`.feedwrap [data-card-label][data-id="e621:${id}"]`).first();
  const count=(id,cls)=>card(id).locator(cls).count();
  await card(104).waitFor({state:'visible'});
  assert.equal(await count(101,'.glint-card-status'),0,'unknown source state and legacy local likes do not create a heart');
  assert.equal(await count(102,'.glint-status-like'),0);assert.equal(await count(102,'.glint-status-bookmark'),1);
  assert.equal(await count(103,'.glint-status-like'),1);assert.equal(await count(103,'.glint-status-bookmark'),0);
  assert.equal(await count(104,'.glint-status-like'),1);assert.equal(await count(104,'.glint-status-bookmark'),1);
  assert.equal(await count(105,'.vidb'),1,'video play indicator remains');assert.equal(await count(105,'.glint-status-bookmark'),1,'video thumbnails also show saved status');
  // A Drive-style merge invalidates the bookmark index without rebuilding the feed.
  await card(103).evaluate(el=>{window.__mergedThumb=el.querySelector('img')});
  await page.evaluate(()=>{S.bookmarks=[{id:'e621:103',savedAt:100},{id:'e621:104',savedAt:101},{id:'e621:105',savedAt:102}];forgetBookmarkIds()});
  await page.waitForFunction(()=>!!document.querySelector('.feedwrap [data-id="e621:103"] .glint-status-bookmark')&&!document.querySelector('.feedwrap [data-id="e621:102"] .glint-status-bookmark'));
  assert.equal(await page.evaluate(()=>window.__mergedThumb===document.querySelector('.feedwrap [data-id="e621:103"] img')),true,'a merged bookmark update preserves image nodes');
  await page.evaluate(()=>{S.bookmarks=[{id:'e621:102',savedAt:100},{id:'e621:104',savedAt:101},{id:'e621:105',savedAt:102}];forgetBookmarkIds()});
  await page.waitForFunction(()=>!!document.querySelector('.feedwrap [data-id="e621:102"] .glint-status-bookmark')&&!document.querySelector('.feedwrap [data-id="e621:103"] .glint-status-bookmark'));
  const labels=await Promise.all([101,102,103,104].map(id=>card(id).getAttribute('aria-label')));
  assert.doesNotMatch(labels[0],/Liked|Bookmarked/);assert.match(labels[1],/Bookmarked/);assert.match(labels[2],/Liked on source/);assert.match(labels[3],/Liked on source, Bookmarked/);
  const geometry=await card(104).evaluate(host=>{
   const image=host.querySelector('.art').getBoundingClientRect(),marks=host.querySelector('.glint-card-status'),box=marks.getBoundingClientRect(),icon=marks.querySelector('.glint-status-icon').getBoundingClientRect(),css=getComputedStyle(marks);
   return {right:image.right-box.right,bottom:image.bottom-box.bottom,w:icon.width,h:icon.height,pointer:css.pointerEvents};
  });
  if(process.env.CARD_STATUS_SCREENSHOT&&width===390)await page.screenshot({path:process.env.CARD_STATUS_SCREENSHOT});
  assert(geometry.right>=4&&geometry.right<=6&&geometry.bottom>=4&&geometry.bottom<=6,'indicators sit in the bottom-right corner');
  assert(geometry.w<=18&&geometry.h<=18,'each indicator is very small');assert.equal(geometry.pointer,'none','the indicators never intercept taps');
  assert.equal(await card(104).locator('.glint-status-like svg').getAttribute('width'),'24','cards use the corner-mark icons');
  // Centring is judged on the painted pixels (stroke and joins included), not
  // only the path box: the heart's lobes used to hang 0.32px below centre.
  const centring=await page.evaluate(async()=>{
   const S=360,measure=async(html,color)=>{
    const svg=html.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"').replace('width="24" height="24"',`width="${S}" height="${S}"`).replace(/currentColor/g,color);
    const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('paint failed'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
    const c=document.createElement('canvas');c.width=S;c.height=S;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,S,S);
    const d=ctx.getImageData(0,0,S,S).data;let x0=S,y0=S,x1=-1,y1=-1;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){if(d[(y*S+x)*4+3]>=128){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
    const u=24/S;return {x:+(((x0+x1+1)/2)*u).toFixed(3),y:+(((y0+y1+1)/2)*u).toFixed(3),w:+((x1-x0+1)*u).toFixed(3),h:+((y1-y0+1)*u).toFixed(3)};
   };
   return {heart:await measure(I.markHeart(),'#ff869b'),bookmark:await measure(I.markBookmark(),'#ffd36b')};
  });
  for(const [name,box] of Object.entries(centring)){
   assert.ok(Math.abs(box.x-12)<=0.25&&Math.abs(box.y-12)<=0.25,`the ${name} glyph is centred in its badge: ${JSON.stringify(box)}`);
   assert.ok(box.w<=19&&box.h<=19,`the ${name} glyph stays very small: ${JSON.stringify(box)}`);
  }
  await card(102).evaluate(el=>{window.__originalThumb=el.querySelector('img')});
  const box=await card(102).boundingBox();
  if(mobile){await page.touchscreen.tap(box.x+box.width-10,box.y+box.height-10)}
  else await page.mouse.click(box.x+box.width-10,box.y+box.height-10);
  await page.waitForFunction(()=>postView()?.kind==='post'&&document.querySelector('#sheet').dataset.postId==='e621:102');
  await page.waitForFunction(()=>document.querySelector('#sheet .source-like')?.getAttribute('aria-pressed')==='false');
  await page.locator('#sheet [data-a="bookmark"]').click();
  await page.waitForFunction(()=>!document.querySelector('.feedwrap [data-id="e621:102"] .glint-status-bookmark'));
  assert.equal(await page.evaluate(()=>window.__originalThumb===document.querySelector('.feedwrap [data-id="e621:102"] img')),true,'changing state never replaces the decoded image');
  await page.locator('#sheet [data-a="bookmark"]').click();
  await page.waitForFunction(()=>!!document.querySelector('.feedwrap [data-id="e621:102"] .glint-status-bookmark'));
  await page.locator('#sheet .source-like').click();
  await page.waitForFunction(()=>document.querySelector('#sheet .source-like')?.getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>!!document.querySelector('.feedwrap [data-id="e621:102"] .glint-status-like'));
  assert.equal(await count(102,'.glint-status-bookmark'),1,'liking does not remove a bookmark');
  assert.match(await card(102).getAttribute('aria-label'),/Liked on source, Bookmarked/);
  await page.locator('#sheet .source-like').click();
  await page.waitForFunction(()=>!document.querySelector('.feedwrap [data-id="e621:102"] .glint-status-like'));
  assert.equal(await count(102,'.glint-status-bookmark'),1,'unliking leaves the bookmark marker intact');
  await page.evaluate(()=>history.back());await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));

  // Related-art cards use their own markup but the same non-interactive marks.
  await page.evaluate(()=>{detail('e621:101');blankPostPage('e621:101');document.querySelector('#sheet .related-grid').innerHTML=window.__statusPins.slice(1,4).map(relatedCardHTML).join('')});
  await page.waitForFunction(()=>postView()?.kind==='blank'&&document.querySelectorAll('#sheet .related-card').length===3);
  assert.equal(await page.locator('#sheet .related-card[data-id="e621:104"] .glint-status-icon').count(),2);
  await page.evaluate(()=>toggleBookmark('e621:104'));
  await page.waitForFunction(()=>!document.querySelector('#sheet .related-card[data-id="e621:104"] .glint-status-bookmark'));
  assert.equal(await page.locator('#sheet .related-card[data-id="e621:104"] .glint-status-like').count(),1,'unbookmarking a Related card keeps its Like marker');
  await page.evaluate(()=>history.back());await page.waitForFunction(()=>postView()?.kind==='post');
  await page.evaluate(()=>history.back());await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));

  await page.evaluate(()=>{S.screen='profile';S.bt='Bookmarks';render()});
  await page.waitForSelector('.bookmark-results [data-id="e621:102"] .glint-status-bookmark');
  await page.evaluate(()=>{
   const f=favState('e621');f.pins=[pin('e621:103'),pin('e621:104')];f.page=1;f.done=true;f.loadedAt=Date.now();f.total=2;
   S.bt='Likes';render();
  });
  await page.waitForSelector('.tabpane[data-tab="Likes"] [data-id="e621:103"] .glint-status-like');
  assert.equal(await page.locator('.tabpane[data-tab="Likes"] [data-id="e621:104"] .glint-status-bookmark').count(),0,'Likes and Bookmarks stay independent in Saved');

  // A supported read-only account can display a source-confirmed Like even if
  // its optional website session is absent and Like writes remain disabled.
  await page.evaluate(async()=>{
   pbSetAuth('gelbooru',{login:'27',apiKey:'fixture-only'});
   const raw={sid:650,grid:'https://gelbooru.com/fixture.png',sample:'https://gelbooru.com/fixture.png',orig:'https://gelbooru.com/fixture.png',w:414,h:600,tags:[]},p=normPin(raw,'gelbooru');
   const probe=document.createElement('div');probe.id='readonly-like-probe';probe.innerHTML=pcN(p);document.body.append(probe);
   window.pbLoadFavorites=async()=>Object.assign([raw],{hasMore:false});window.pbLoadFavoriteCount=async()=>1;
   S.src='gelbooru';S.screen='profile';S.bt='Likes';delete FAV.gelbooru;await loadFavorites(true);render();
  });
  await page.waitForSelector('#readonly-like-probe .glint-status-like');
  await page.waitForSelector('.tabpane[data-tab="Likes"] [data-id="gelbooru:650"] .glint-status-like');
  assert.equal(await page.evaluate(()=>({read:pbLikesOk('gelbooru')&&pbHasAuth('gelbooru'),write:pbCanLike('gelbooru')})).then(v=>v.read&&!v.write),true);
  await page.evaluate(()=>pbSetAuth('gelbooru',null));
  await page.waitForFunction(()=>!document.querySelector('#readonly-like-probe .glint-status-like'));
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: tiny corner marks, real Like/bookmark independence, in-place updates, tap-through, related/likes/bookmark surfaces, video mark and read-only account state.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
