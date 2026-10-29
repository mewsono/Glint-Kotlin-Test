// Run: NODE_PATH=/home/user/.tools/browser/node_modules node tests/tags-viewer.browser.cjs
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const special={characters:['hatsune_miku','kagamine_rin'],artists:['test_artist'],series:['vocaloid']};
const general=['blue_sky','flower','tag_with_<svg_onload=window.__tagXss=true>',...Array.from({length:65},(_,i)=>'other_tag_'+i)];
const all=[...special.characters,...special.artists,...special.series,...general];
const post={id:501,md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:1600,tag_string:all.join(' '),tag_string_character:special.characters.join(' '),tag_string_artist:special.artists.join(' '),tag_string_copyright:special.series.join(' '),large_file_url:'https://cdn.donmai.us/sample/test.png',file_url:'https://cdn.donmai.us/original/test.png',rating:'g'};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1600"><rect width="600" height="1600" fill="#427b89"/><circle cx="400" cy="600" r="180" fill="#e5cc9c"/></svg>';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const mode of [{w:390,h:844,deny:false},{w:1200,h:900,deny:false},{w:360,h:804,deny:true}]){
   const mobile=mode.w<600;
   const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({deny})=>{localStorage.setItem('pb-swipe-hint-v22','1');if(deny)Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Denied by embed policy','NotAllowedError'))},{deny:mode.deny});
   await page.route('**/*',async route=>{
    if(route.request().resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:svg});
    const u=new URL(route.request().url());
    if(u.pathname==='/api/proxy'){
     const target=new URL(u.searchParams.get('u'));
     const isDetail=target.pathname==='/posts/501.json';
     if(isDetail)await new Promise(resolve=>setTimeout(resolve,100));
     const body=isDetail?post:target.pathname==='/posts.json'?[post]:[];
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    }
    return u.hostname==='127.0.0.1'?route.continue():route.abort();
   });
   const press=selector=>mobile?page.locator(selector).first().tap():page.locator(selector).first().click();
   const waitPost=()=>page.waitForFunction(()=>document.querySelector('.post-detail')&&history.state?.__pinboardPostView?.kind==='post');
   await page.goto('http://127.0.0.1:8000/');await page.waitForSelector('.grid [data-id="danbooru:501"]');
   await press('.grid [data-id="danbooru:501"]');await waitPost();
   await press('.post-topbar [data-a="menu"]');await page.waitForSelector('.post-tags-sheet');
   assert.equal(await page.locator('.post-tags-count').innerText(),all.length+' tags');
   assert.equal(await page.locator('[data-category="character"] .post-tag').count(),2);
   assert.equal(await page.locator('[data-category="artist"] .post-tag').count(),1);
   assert.equal(await page.locator('[data-category="series"] .post-tag').count(),1);
   assert.equal(await page.locator('[data-category="general"] .post-tag').count(),general.length);
   const colors=await page.locator('.post-tag-group:not([data-category="general"]) .post-tag').evaluateAll(tags=>tags.map(t=>getComputedStyle(t).color));
   assert.equal(new Set(colors).size,3);
   assert.equal(await page.locator('.post-tags-content svg').count(),0);assert.equal(await page.evaluate(()=>window.__tagXss),undefined);
   // Native Back returns tags -> details; the sheet's back icon does the same.
   await page.goBack();await waitPost();
   await press('.post-topbar [data-a="menu"]');await press('.post-tags-heading [data-a="postback"]');await waitPost();
   // Tap into the separate image page: no buttons, labels, navigation or toast.
   await press('.post-media');await page.waitForSelector('.image-viewer');
   await page.waitForFunction(()=>document.querySelector('.fullscreen-image')?.complete);
   assert.equal(await page.locator('#sheet button,#sheet [role="button"]').count(),0);
   assert.equal(await page.locator('#sheet .post-topbar,#sheet .post-bottom').count(),0);
   assert.equal(await page.evaluate(()=>document.getElementById('app').inert),true);
   assert.equal(await page.locator('#nav').isVisible(),false);
   const geometry=await page.evaluate(()=>{const s=document.querySelector('.image-viewer').getBoundingClientRect(),i=document.querySelector('.fullscreen-image'),r=i.getBoundingClientRect();return {x:s.x,y:s.y,w:s.width,h:s.height,vw:innerWidth,vh:innerHeight,fit:getComputedStyle(i).objectFit,cx:r.x+r.width/2,cy:r.y+r.height/2}});
   assert.ok(Math.abs(geometry.w-geometry.vw)<1&&Math.abs(geometry.h-geometry.vh)<1);
   assert.equal(geometry.fit,'contain');assert.ok(Math.abs(geometry.cx-geometry.vw/2)<1&&Math.abs(geometry.cy-geometry.vh/2)<1);
   await press('.fullscreen-image');assert.equal(await page.evaluate(()=>postView().kind),'image');
   await page.goBack();await waitPost();
   await page.waitForFunction(()=>!document.fullscreenElement);
   assert.equal(await page.evaluate(()=>document.getElementById('app').inert),true,'the document behind the open image dialog stays inert');
   assert.equal(await page.locator('#nav').isVisible(),true);
   // Browser Forward recreates the same control-free image view, not a trap.
   await page.goForward();await page.waitForSelector('.image-viewer');await page.goBack();await waitPost();
   // On Android, Back may first exit native browser fullscreen. That event
   // must return to details too, without accidentally popping all the way out.
   await press('.post-media');await page.waitForSelector('.image-viewer');
   const nativeFullscreen=await page.evaluate(()=>!!document.fullscreenElement);
   if(nativeFullscreen){await page.evaluate(()=>document.exitFullscreen());await waitPost()}
   else{await page.goBack();await waitPost()}
   assert.equal(await page.evaluate(()=>postView().kind),'post');
   // Cached old tags become specially highlighted when their fresh categories arrive.
   await page.evaluate(()=>{const p=pin('danbooru:501');p.characters=[];p.series=[];p.artists=[];p.detailsReady=false;detail(p.id)});
   await press('.post-topbar [data-a="menu"]');
   await page.waitForFunction(()=>document.querySelectorAll('[data-category="character"] .post-tag').length===2);
   await page.goBack();await waitPost();
   // One more native Back closes details and leaves the original feed in place.
   await page.goBack();await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));
   assert.equal(new URL(page.url()).pathname,'/');
   assert.equal(await page.locator('.grid [data-id="danbooru:501"]').count(),1);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${mode.w}px${mode.deny?' embedded/fullscreen-denied fallback':''}: complete colored tag groups; button-free centered viewer; native Back/Forward and fullscreen-exit restore details correctly.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
