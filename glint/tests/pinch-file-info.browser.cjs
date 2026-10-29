// Real Chromium multi-touch via CDP, not synthetic DOM pointer events.
// NODE_PATH=/home/user/.tools/browser/node_modules node tests/pinch-file-info.browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const post={id:601,md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:1600,file_size:2500000,file_ext:'png',tag_string:'hatsune_miku vocaloid test_artist blue_sky',tag_string_character:'hatsune_miku',tag_string_artist:'test_artist',tag_string_copyright:'vocaloid',large_file_url:'https://cdn.donmai.us/sample/test.png',file_url:'https://cdn.donmai.us/original/test.png',rating:'s'};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1600"><rect width="600" height="1600" fill="#427b89"/><circle cx="300" cy="800" r="180" fill="#e5cc9c"/></svg>';
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1.5,`${message}: expected ${b}, got ${a}`);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const mode of [{w:390,h:844,deny:false},{w:360,h:804,deny:true},{w:1200,h:900,deny:false}]){
   const mobile=mode.w<600;
   const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mobile,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];let detailRequests=0;
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({deny})=>{localStorage.setItem('pb-swipe-hint-v22','1');if(deny)Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Denied by embed policy','NotAllowedError'))},{deny:mode.deny});
   await page.route('**/*',async route=>{
    if(route.request().resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:svg});
    const u=new URL(route.request().url());
    if(u.pathname==='/api/proxy'){
     const target=new URL(u.searchParams.get('u')),isDetail=target.pathname==='/posts/601.json';
     if(isDetail){detailRequests++;await new Promise(resolve=>setTimeout(resolve,150))}
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(isDetail?post:target.pathname==='/posts.json'?[post]:[])});
    }
    return u.hostname==='127.0.0.1'?route.continue():route.abort();
   });
   const press=selector=>mobile?page.locator(selector).first().tap():page.locator(selector).first().click();
   const waitPost=()=>page.waitForFunction(()=>document.querySelector('.post-detail')&&history.state?.__pinboardPostView?.kind==='post');
   const field=name=>page.locator(`[data-file-field="${name}"] dd`);
   await page.goto('http://127.0.0.1:8000/');await page.waitForSelector('.grid [data-id="danbooru:601"]');
   await press('.grid [data-id="danbooru:601"]');await waitPost();await press('.post-topbar [data-a="menu"]');
   assert.deepEqual(await page.locator('.post-more-sections>.post-more-section').evaluateAll(nodes=>nodes.map(n=>n.dataset.section)),['file','tags']);
   assert.equal(await field('size').innerText(),'2.5 MB');
   assert.equal(await field('resolution').innerText(),'600 × 1,600 px');
   assert.equal(await field('type').innerText(),'PNG');
   assert.equal(await field('rating').innerText(),'S · Sensitive');
   assert.equal(await page.locator('[data-category="character"] .post-tag').innerText(),'Hatsune Miku');
   const labels=await page.evaluate(()=>[
    postRating({src:'danbooru',rating:'g'}).label,
    postRating({src:'danbooru',rating:'s'}).label,
    postRating({src:'e621',rating:'s'}).label,
    postRating({src:'yandere',rating:'q'}).label,
    postRating({src:'yandere',rating:'e'}).label,
    postRating({src:'danbooru',rating:'unknown'}).label,
   ]);
   assert.deepEqual(labels,['G · General','S · Sensitive','S · Safe','Q · Questionable','E · Explicit','Not provided']);
   if(mode.w===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/post-info-mobile.png'})}
   await page.goBack();await waitPost();
   // Old cached pins with already-ready tags must still fetch missing file info.
   const before=detailRequests;
   await page.evaluate(()=>{const p=pin('danbooru:601');delete p.fileSize;delete p.fileType;p.fileInfoReady=false;p.detailsReady=true;detail(p.id)});
   await press('.post-topbar [data-a="menu"]');
   await page.waitForFunction(()=>document.querySelector('[data-file-field="size"] dd')?.textContent==='2.5 MB');
   assert.equal(detailRequests,before+1);assert.equal(await field('type').innerText(),'PNG');
   await page.goBack();await waitPost();await press('.post-media');
   await page.waitForFunction(()=>document.querySelector('.image-viewer')?.dataset.zoom==='1.000'&&document.querySelector('.fullscreen-image')?.naturalWidth===600);
   await page.waitForTimeout(60);
   const cdp=await context.newCDPSession(page);
   const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:i+1,x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}))});
   const state=()=>page.locator('.image-viewer').evaluate(s=>({scale:+s.dataset.zoom,x:+s.dataset.panX,y:+s.dataset.panY,w:s.clientWidth,h:s.clientHeight}));
   const pinch=async(from,to)=>{
    await touch('touchStart',from);await touch('touchMove',to);await page.waitForTimeout(35);await touch('touchEnd',[]);await page.waitForTimeout(35);
   };
   let st=await state();const cx=st.w/2+12,cy=st.h/2+35;
   await pinch([{x:cx-60,y:cy},{x:cx+60,y:cy}],[{x:cx-120,y:cy},{x:cx+120,y:cy}]);
   st=await state();near(st.scale,2,'two-finger zoom');
   const fit=Math.min(st.w/600,st.h/1600),maxX=Math.max(0,(600*fit*2-st.w)/2),maxY=Math.max(0,(1600*fit*2-st.h)/2);
   near(st.x,Math.max(-maxX,-12),'pinch midpoint X anchor');near(st.y,Math.max(-maxY,-35),'pinch midpoint Y anchor');
   assert.equal(await page.evaluate(()=>visualViewport.scale),1,'browser viewport must not zoom');
   const start={x:st.w/2,y:st.h/2},prior={x:st.x,y:st.y};
   await touch('touchStart',[start]);await touch('touchMove',[{x:start.x+40,y:start.y+70}]);await page.waitForTimeout(35);await touch('touchEnd',[]);
   st=await state();near(st.x,Math.min(maxX,prior.x+40),'one-finger pan X');near(st.y,Math.min(maxY,prior.y+70),'one-finger pan Y');
   // Drag to the far edge; blank letterbox space is not counted as image.
   await touch('touchStart',[start]);await touch('touchMove',[{x:st.w-2,y:st.h-2}]);await page.waitForTimeout(35);await touch('touchEnd',[]);
   st=await state();assert.ok(Math.abs(st.x)<=maxX+1&&Math.abs(st.y)<=maxY+1);
   near(st.x,maxX,'horizontal pan clamp');near(st.y,maxY,'vertical pan clamp');
   await pinch([{x:cx-100,y:cy},{x:cx+100,y:cy}],[{x:cx-40,y:cy},{x:cx+40,y:cy}]);
   st=await state();near(st.scale,1,'minimum zoom');near(st.x,0,'reset horizontal center');near(st.y,0,'reset vertical center');
   await page.locator('.image-viewer').dispatchEvent('wheel',{ctrlKey:true,deltaY:-1000,clientX:cx,clientY:cy,bubbles:true,cancelable:true});
   await page.waitForFunction(()=>document.querySelector('.image-viewer')?.dataset.zoom==='8.000');
   assert.equal(await page.locator('#sheet button,#sheet [role="button"]').count(),0);
   // Native Back exits a zoomed image; Forward creates a fresh 1x view.
   await page.goBack();await waitPost();await page.waitForFunction(()=>!document.fullscreenElement);
   assert.equal(await page.locator('#sheet').getAttribute('data-zoom'),null);
   await page.goForward();await page.waitForFunction(()=>document.querySelector('.image-viewer')?.dataset.zoom==='1.000');
   st=await state();near(st.x,0,'reopened image horizontal center');near(st.y,0,'reopened image vertical center');
   await page.goBack();await waitPost();assert.deepEqual(errors,[]);
   console.log(`PASS ${mode.w}px${mode.deny?' fullscreen-denied fallback':''}: real two-finger zoom, midpoint anchoring, one-finger pan, painted-image clamping, 1–8x limits/reset/native Back; file-info-first sections, source-aware ratings and old-cache refresh.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
