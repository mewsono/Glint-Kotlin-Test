// NODE_PATH=/home/user/.tools/browser/node_modules node tests/post-swipe.browser.cjs
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const post={id:801,md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:1600,file_size:2500000,file_ext:'png',tag_string:'sakura_miko hololive thomas_8000',tag_string_character:'sakura_miko',tag_string_artist:'thomas_8000',tag_string_copyright:'hololive',large_file_url:'https://cdn.donmai.us/sample/test.png',file_url:'https://cdn.donmai.us/original/test.png',source:'https://www.pixiv.net/artworks/123456789',rating:'g'};
const image='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1600"><rect width="600" height="1600" fill="#427b89"/></svg>';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const mode of [{w:390,h:844,mobile:true},{w:360,h:804,mobile:true,legacy:true},{w:1200,h:900,mobile:false}]){
   const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mode.mobile,hasTouch:mode.mobile,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({legacy})=>{
    localStorage.setItem('pb-swipe-hint-v22','1');if(legacy)window.PointerEvent=undefined;
    Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Embedded preview','NotAllowedError'));
   },mode);
   await page.route('**/*',route=>{
    if(route.request().resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    const u=new URL(route.request().url());
    if(u.pathname==='/api/proxy'){
     const target=new URL(u.searchParams.get('u'));
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(target.pathname==='/posts/801.json'?post:target.pathname==='/posts.json'?[post]:[])});
    }
    return u.hostname==='127.0.0.1'?route.continue():route.abort();
   });
   const press=async selector=>{
    const node=page.locator(selector).first();
    if(!mode.mobile)return node.click();
    await node.waitFor({state:'visible'});const b=await node.boundingBox();
    await touch('touchStart',[{x:b.x+b.width/2,y:b.y+b.height/2}]);await touch('touchEnd',[]);await page.waitForTimeout(50);
   };
   // A history entry/DOM node exists at the START of the existing 300ms
   // transition. Wait until it is actually under the gesture coordinates;
   // otherwise this test swipes the overlay behind a moving page, not a post.
   const settled=()=>page.waitForFunction(()=>document.getElementById('sheet').getAnimations().every(a=>a.playState!=='running'));
   const waitPost=async()=>{await page.waitForFunction(()=>document.querySelector('.post-detail')&&postView()?.kind==='post');await settled()};
   const waitBlank=async()=>{await page.waitForFunction(()=>document.querySelector('.post-blank-page')&&postView()?.kind==='blank');await settled()};
   const cdp=await context.newCDPSession(page);
   const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:i+1,x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}))});
   const swipe=async(from,to)=>{
    if(mode.mobile){
     await touch('touchStart',[from]);
     for(let i=1;i<=6;i++)await touch('touchMove',[{x:from.x+(to.x-from.x)*i/6,y:from.y+(to.y-from.y)*i/6}]);
     await touch('touchEnd',[]);
    }else{
     await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:6});await page.mouse.up();
    }
    await page.waitForTimeout(60);
   };
   await page.goto('http://127.0.0.1:8000/');await page.waitForSelector('.grid [data-id="danbooru:801"]');
   await press('.grid [data-id="danbooru:801"]');await waitPost();
   const box=await page.locator('.post-media').boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height*.65};
   // Not every drag is a navigation: require a clear, deliberate upward swipe.
   for(const delta of [{x:0,y:-40},{x:0,y:60},{x:150,y:-75}]){
    await swipe(point,{x:point.x+delta.x,y:point.y+delta.y});assert.equal(await page.evaluate(()=>postView().kind),'post');
   }
   const action=await page.locator('.post-actions [data-a="bookmark"]').boundingBox(),control={x:action.x+action.width/2,y:action.y+action.height/2};
   await swipe(control,{x:control.x,y:control.y-160});assert.equal(await page.evaluate(()=>postView().kind),'post','swiping from a control must not navigate');
   if(mode.mobile){
    await touch('touchStart',[{x:point.x-35,y:point.y},{x:point.x+35,y:point.y}]);
    await touch('touchMove',[{x:point.x-35,y:point.y-150},{x:point.x+35,y:point.y-150}]);await touch('touchEnd',[]);
    assert.equal(await page.evaluate(()=>postView().kind),'post','two fingers must not open the blank page');
   }
   const before=await page.evaluate(()=>history.length);
   await swipe(point,{x:point.x+8,y:point.y-160});await waitBlank();
   assert.equal(await page.evaluate(()=>history.length),before+1);
   const blank=await page.locator('#sheet').evaluate(s=>{const r=s.getBoundingClientRect();return {html:s.innerHTML,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,blank:document.body.classList.contains('viewing-blank'),app:document.getElementById('app').inert,nav:document.getElementById('nav').inert,id:s.dataset.blankPostId}});
   assert.equal(await page.locator('#sheet .related-section').count(),3);assert.equal(blank.id,'danbooru:801');assert.ok(blank.blank&&blank.app&&blank.nav);
   assert.ok(Math.abs(blank.w-blank.vw)<1&&Math.abs(blank.h-blank.vh)<1);assert.equal(await page.locator('#nav').isVisible(),false);
   // The related page owns only a deliberate downward swipe, not a tap,
   // short drag, upward/horizontal drag, or a two-finger gesture.
   const down={x:mode.w/2,y:mode.h*.32};
   for(const delta of [{x:0,y:40},{x:0,y:-110},{x:150,y:75}]){
    await swipe(down,{x:down.x+delta.x,y:down.y+delta.y});assert.equal(await page.evaluate(()=>postView().kind),'blank');
   }
   if(mode.mobile){
    await touch('touchStart',[{x:down.x-35,y:down.y},{x:down.x+35,y:down.y}]);
    await touch('touchMove',[{x:down.x-35,y:down.y+150},{x:down.x+35,y:down.y+150}]);await touch('touchEnd',[]);
    assert.equal(await page.evaluate(()=>postView().kind),'blank','two fingers must not return to details');
    await touch('touchStart',[down]);await touch('touchMove',[{x:down.x,y:down.y+120}]);await touch('touchCancel',[]);
    assert.equal(await page.evaluate(()=>postView().kind),'blank','a cancelled drag must not navigate');await page.waitForTimeout(350);   // let the spring-back finish
   }
   await swipe(down,{x:down.x+8,y:down.y+160});await waitPost();
   assert.equal(await page.evaluate(()=>history.length),before+1,'return must reuse history, not push another post');
   assert.equal(await page.evaluate(()=>postView().id),'danbooru:801');
   assert.equal(await page.evaluate(()=>document.body.classList.contains('viewing-blank')),false);assert.equal(await page.evaluate(()=>document.getElementById('app').inert),true,'background stays inert for every dialog');
   assert.equal(await page.locator('#nav').isVisible(),true);assert.equal(await page.locator('.post-source-link[data-platform="pixiv"]').count(),1);
   await page.goForward();await waitBlank();assert.equal(await page.locator('#sheet .related-section').count(),3);
   await page.goBack();await waitPost();
   await page.goForward();await waitBlank();
   await page.reload();await waitBlank();assert.equal(await page.locator('#sheet .related-section').count(),3);
   await swipe(down,{x:down.x,y:down.y+160});await waitPost();
   assert.equal(await page.evaluate(()=>postView().id),'danbooru:801');
   // The metadata area can initiate the same gesture; listeners reattach on Back.
   const info=await page.locator('.post-info').boundingBox(),infoPoint={x:info.x+25,y:info.y+info.height/2};
   await swipe(infoPoint,{x:infoPoint.x,y:infoPoint.y-140});await waitBlank();
   await swipe(down,{x:down.x,y:down.y+160});await waitPost();
   for(let cycle=0;cycle<2;cycle++){
    await swipe(point,{x:point.x,y:point.y-160});await waitBlank();
    await swipe(down,{x:down.x,y:down.y+160});await waitPost();
    assert.equal(await page.evaluate(()=>history.length),before+1);
    assert.equal(await page.evaluate(()=>postView().id),'danbooru:801');
   }
   // A normal tap still opens the image, and swiping that view never opens blank.
   await page.waitForTimeout(400);await press('.post-media');await page.waitForSelector('.image-viewer');
   await swipe(point,{x:point.x,y:point.y-160});assert.equal(await page.evaluate(()=>postView().kind),'image');
   await page.goBack();await waitPost();
   // Normal scrolling in the … panel also stays in that panel.
   await press('.post-topbar [data-a="menu"]');
   await swipe({x:mode.w/2,y:mode.h*.8},{x:mode.w/2,y:mode.h*.55});
   assert.equal(await page.evaluate(()=>postView().kind),'tags');
   await page.goBack();await waitPost();await page.goBack();await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));
   assert.deepEqual(errors,[]);
   console.log(`PASS ${mode.w}px ${mode.mobile?(mode.legacy?'legacy touch fallback':'real touch'):'mouse drag'}: swipe up opens related art, swipe down returns to the same post without duplicate history; repeated cycles, Back/Forward/reload, metadata swipes and fullscreen preserved; short/wrong-direction/horizontal/control/multitouch/cancelled gestures ignored.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
