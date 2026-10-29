/* Downward post swipes fade the moving sheet over a continuously visible feed tile. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const post={id:801,md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:900,file_ext:'png',tag_string:'sakura character',tag_string_character:'sakura',large_file_url:'https://cdn.donmai.us/sample/test.png',file_url:'https://cdn.donmai.us/original/test.png',rating:'g'};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#427b89"/></svg>';
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
  page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:svg});
   if(u.pathname==='/api/proxy'){const target=new URL(u.searchParams.get('u'));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(target.pathname==='/posts/801.json'?post:target.pathname==='/posts.json'?[post]:[])})}
   return u.hostname==='127.0.0.1'?route.continue():route.abort();
  });
  await page.goto(BASE);await page.waitForFunction(()=>window.PB_APP_READY===true);await page.waitForSelector('.grid [data-id="danbooru:801"]');
  await page.locator('.grid [data-a="open"][data-id="danbooru:801"]').evaluate(node=>node.click());await page.waitForSelector('.post-detail');await page.waitForTimeout(350);
  assert.equal(await page.locator('#ov > .glint-related-backdrop').count(),0,'a post does not show a blurred duplicate of its own image behind it');
  const thumb=page.locator('[data-a="open"][data-id="danbooru:801"] .art').first(),cdp=await context.newCDPSession(page);
  const touch=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[{id:1,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]:[]});
  const swipe=async distance=>{const box=await page.locator('.post-media').boundingBox(),from={x:box.x+box.width/2,y:box.y+box.height*.55};await touch('touchStart',from);for(let i=1;i<=6;i++)await touch('touchMove',{x:from.x+4*i/6,y:from.y+distance*i/6});const state=await page.evaluate(()=>({thumbVisibility:getComputedStyle(document.querySelector('.grid [data-a="open"][data-id="danbooru:801"] .art')).visibility,sheetOpacity:getComputedStyle(document.querySelector('#sheet')).opacity}));await touch('touchEnd',null);return state};
  const cancelled=await swipe(60);assert.equal(cancelled.thumbVisibility,'visible','the feed thumbnail stays visible during a downward pull');assert(Number(cancelled.sheetOpacity)<1,'the post sheet fades as it moves down');
  await page.waitForTimeout(350);assert.equal(await page.locator('#sheet').evaluate(e=>getComputedStyle(e).opacity),'1','a cancelled pull restores the post sheet');
  const committed=await swipe(160);assert.equal(committed.thumbVisibility,'visible','the feed thumbnail remains visible during a committed close');assert(Number(committed.sheetOpacity)<1,'the committed post sheet is partially faded');
  await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));
  assert.equal(await thumb.evaluate(e=>getComputedStyle(e).visibility),'visible','the source thumbnail stays visible after the slide-down');
  await page.waitForTimeout(450);assert.equal(await thumb.evaluate(e=>getComputedStyle(e).visibility),'visible','the source thumbnail remains visible after the close animation');
  await thumb.evaluate(e=>e.closest('[data-a="open"]').click());await page.waitForSelector('.post-detail');await page.waitForTimeout(350);
  await swipe(-160);await page.waitForFunction(()=>postView()?.kind==='blank'&&document.querySelector('#sheet.post-blank-page'));
  const backdrop=await page.locator('#ov > .glint-related-backdrop').evaluate(e=>({visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity}));
  assert.equal(backdrop.visibility,'visible','the blurred backdrop is reserved for the Related art page');
  console.log('PASS 390px: no duplicate artwork during slide-down; canceled pulls restore the thumbnail; backdrop remains on Related art only.');
  await context.close();
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
