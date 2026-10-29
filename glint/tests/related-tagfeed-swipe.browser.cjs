/* A related Character / Artist / Series full feed should swipe down to its
   Related art parent, preserving the normal history and page state. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const post={sid:2000,md5:'000000000000000000000000000007d0',image_width:600,image_height:900,file_ext:'png',tag_string:'sakura_miko thomas_8000 hololive',tag_string_character:'sakura_miko',tag_string_artist:'thomas_8000',tag_string_copyright:'hololive',large_file_url:'https://cdn.donmai.us/sample/2000.png',file_url:'https://cdn.donmai.us/original/2000.png',rating:'g'};
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:414,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
  page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#477b89"/></svg>'});
   if(u.pathname==='/api/proxy')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
   return u.hostname==='127.0.0.1'?route.continue():route.abort();
  });
  await page.goto(BASE);await page.waitForFunction(()=>window.PB_APP_READY===true);
  await page.evaluate(raw=>{const p=normPin(raw,'danbooru');p.characters=['sakura_miko'];p.artists=['thomas_8000'];p.series=['hololive'];p.tags=['sakura_miko','thomas_8000','hololive'];p.detailsReady=true;rememberPin(p);detail(p.id);blankPostPage(p.id)},post);
  await page.waitForFunction(()=>postView()?.kind==='blank'&&document.querySelector('#sheet.post-blank-page .related-page'));
  const entrance=await page.locator('#sheet.post-blank-page').evaluate(el=>el.getAnimations().flatMap(a=>a.effect.getKeyframes()));
  assert(entrance.some(frame=>Number(frame.opacity)===0)&&entrance.some(frame=>Number(frame.opacity)===1),'post-to-Related art uses a crossfade');
  assert(entrance.every(frame=>!frame.transform&&!frame.clipPath),'the post-to-Related art transition has no sliding or iris movement');
  const cdp=await context.newCDPSession(page);
  const touch=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[{id:1,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]:[]});
  await page.waitForFunction(()=>{const state=RELATED_PAGES.get('danbooru:2000');return state&&state.groups.filter(g=>g.tag).every(g=>!g.busy)});
  const sliderStyle=await page.locator('.related-grid').first().evaluate(el=>{const s=getComputedStyle(el);return {flow:s.gridAutoFlow,overflow:s.overflowX,snap:s.scrollSnapType,focusable:el.tabIndex===0}});
  assert.equal(sliderStyle.flow,'column','Related art previews flow horizontally as a slider');
  assert.equal(sliderStyle.overflow,'auto','the image row can be swiped sideways');
  assert.match(sliderStyle.snap,/x.*mandatory/,'carousel cards snap into place');
  assert.equal(sliderStyle.focusable,true,'the carousel can receive keyboard focus');
  for(const kind of ['character','artist','series']){
   await page.evaluate(kind=>{const state=RELATED_PAGES.get('danbooru:2000'),group=state?.groups.find(g=>g.kind===kind);if(!group||!group.tag)throw new Error('missing related group '+kind);moreRelated(state.id,group.key)},kind);
   await page.waitForFunction(()=>postView()?.kind==='tagfeed'&&document.querySelector('#sheet.tag-feed-sheet'));
   const glass=await page.locator('#sheet.tag-feed-sheet').evaluate(el=>({background:getComputedStyle(el).backgroundColor,backdrop:getComputedStyle(document.querySelector('#ov > .glint-related-backdrop')).visibility}));
   assert.match(glass.background,/rgba\(11, 10, 14, 0\.54\)/,'tag feeds use translucent Related art glass');
   assert.equal(glass.backdrop,'visible','tag feeds retain the parent artwork backdrop');
   await page.waitForFunction(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f&&!f.busy});
   await page.locator('#sheet .tag-feed-page').evaluate(el=>{const spacer=document.createElement('div');spacer.style.height='1100px';spacer.setAttribute('aria-hidden','true');el.append(spacer);el.parentElement.scrollTop=280});
   await page.waitForFunction(()=>document.querySelector('#sheet').scrollTop>200);
   const before=await page.evaluate(()=>({key:postView().id,scroll:document.querySelector('#sheet').scrollTop}));
   assert(before.scroll>200,'the swipe starts while the tag feed is scrolled down');
   await touch('touchStart',{x:207,y:330});
   for(let i=1;i<=6;i++){await touch('touchMove',{x:207,y:330+160*i/6});await page.waitForTimeout(12)}
   await touch('touchEnd',null);
   await page.waitForFunction(()=>postView()?.kind==='blank'&&document.querySelector('#sheet.post-blank-page .related-page'));
   assert.equal(await page.evaluate(()=>postView().id),'danbooru:2000');
   assert.equal(await page.locator('.related-header h1').innerText(),'Related art');
   assert.notEqual(await page.evaluate(()=>postView()?.id),before.key,'the feed was popped from history');
  }
  await page.locator('#sheet .related-page').evaluate(el=>{const spacer=document.createElement('div');spacer.style.height='1100px';spacer.setAttribute('aria-hidden','true');el.append(spacer);el.parentElement.scrollTop=280});
  await page.waitForFunction(()=>document.querySelector('#sheet').scrollTop>200);
  await touch('touchStart',{x:207,y:330});
  for(let i=1;i<=6;i++){await touch('touchMove',{x:207,y:330+160*i/6});await page.waitForTimeout(12)}
  const dragState=await page.locator('#sheet.post-blank-page').evaluate(el=>({transform:el.style.transform,opacity:Number(el.style.opacity)}));
  assert.equal(dragState.transform,'','Related art stays in place during the downward gesture');
  assert(dragState.opacity<1&&dragState.opacity>0,'the downward gesture previews a crossfade instead of moving the sheet');
  await touch('touchEnd',null);
  await page.waitForFunction(()=>postView()?.kind==='post'&&document.querySelector('#sheet.post-sheet .post-detail'));
  const exitFrames=await page.locator('.glint-related-exit').evaluate(el=>el.getAnimations().flatMap(a=>a.effect.getKeyframes()));
  assert(exitFrames.length&&exitFrames.every(frame=>!frame.transform&&frame.opacity!==undefined)&&Number(exitFrames.at(-1).opacity)===0,'returning to post details crossfades Related art away without a slide');
  console.log('PASS 414px: horizontal Related art slider layout, glass-backed tag feeds, mid-scroll tag-feed swipes, and stationary crossfade back to post details.');
  await context.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
