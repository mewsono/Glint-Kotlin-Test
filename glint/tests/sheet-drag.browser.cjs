/* Every sheet that paints the grabber must also slide down to close.
   Short pulls spring back, sideways swipes and inner scrolling keep their own
   behaviour, taps and form fields are untouched, and the pages that already own
   a gesture (post, Related art, tag feeds, Explore feeds, viewer) are unaffected. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';

const openSettings=async page=>{
 await page.evaluate(()=>settings());
 await page.waitForSelector('#sheet .glint-source-choice');
};
const shown=page=>page.evaluate(()=>document.querySelector('#ov').classList.contains('show'));

async function run(browser,{width,height,touch,reduced}){
 const label=`${touch?'touch':'mouse'} @ ${width}x${height}`;
 const context=await browser.newContext({
  viewport:{width,height},
  isMobile:touch,hasTouch:touch,
  reducedMotion:reduced?'reduce':null,
  serviceWorkers:'block',
  deviceScaleFactor:touch?2:1
 });
 const page=await context.newPage();
 page.setDefaultTimeout(8000);
 await page.addInitScript(()=>{
  localStorage.setItem('pb-swipe-hint-v22','1');
  localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru','e621'],theme:'dark',bookmarks:[],bookmarkVersion:1}));
 });
 await page.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#3d5a66"/></svg>'});
  if(u.pathname==='/api/proxy')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  return u.hostname==='127.0.0.1'?route.continue():route.abort();
 });
 await page.goto(BASE);
 await page.waitForFunction(()=>window.PB_APP_READY===true);
 const cdp=await context.newCDPSession(page);
 const touchPoint=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[{id:1,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]:[]});
 const drag=async(from,dx,dy,steps=8,end=true)=>{
  if(touch){
   await touchPoint('touchStart',from);
   for(let i=1;i<=steps;i++){await touchPoint('touchMove',{x:from.x+dx*i/steps,y:from.y+dy*i/steps});await page.waitForTimeout(10)}
   if(end)await touchPoint('touchEnd',null);
  }else{
   await page.mouse.move(from.x,from.y);
   await page.mouse.down();
   for(let i=1;i<=steps;i++){await page.mouse.move(from.x+dx*i/steps,from.y+dy*i/steps);await page.waitForTimeout(10)}
   if(end)await page.mouse.up();
  }
 };
 const release=async()=>{if(touch)await touchPoint('touchEnd',null);else await page.mouse.up()};
 const sheetBox=async()=>page.locator('#sheet').boundingBox();

 // the grabber is painted, so it has to be draggable
 await openSettings(page);
 const grip=await page.locator('#sheet').evaluate(el=>{
  const g=getComputedStyle(el,'::before');
  return {width:g.width,height:g.height,display:g.display};
 });
 assert.equal(grip.width,'38px','the sheet paints the 38px grabber');
 assert.equal(grip.height,'4px','the grabber is a 4px bar');
 assert.notEqual(grip.display,'none','the grabber is visible');

 // the sheet tracks the finger while it is pulled, then dismisses on release
 let box=await sheetBox();
 const start={x:Math.round(width/2),y:Math.round(box.y+box.height*0.4)};
 await drag(start,0,150,8,false);
 const live=await page.locator('#sheet').evaluate(el=>({transform:el.style.transform,opacity:Number(el.style.opacity)}));
 assert.match(live.transform,/^translateY\(1[0-9][0-9](\.\d+)?px\)$/,'the sheet follows the finger downwards');
 assert.ok(live.opacity<.98&&live.opacity>=.5,'the sheet fades a little as it is pulled');
 await drag({x:start.x,y:start.y+150},0,90,4,false);
 await release();

 // a deliberate pull downwards dismisses the sheet
 await openSettings(page);
 box=await sheetBox();
 await drag({x:Math.round(width/2),y:Math.round(box.y+box.height*0.4)},0,240);
 await page.waitForFunction(()=>!document.querySelector('#ov').classList.contains('show'),null,{timeout:4000});
 assert.equal(await shown(page),false,'pulling a sheet down closes it');

 // a short pull springs back without closing or moving on afterwards
 await openSettings(page);
 const before=await page.locator('#sheet').innerHTML();
 box=await sheetBox();
 await drag({x:Math.round(width/2),y:Math.round(box.y+box.height*0.4)},0,40);
 await page.waitForTimeout(400);
 assert.equal(await shown(page),true,'a short pull keeps the sheet open');
 const settled=await page.locator('#sheet').evaluate(el=>({transform:el.style.transform,opacity:el.style.opacity,matrix:getComputedStyle(el).transform}));
 assert.equal(settled.transform,'','a short pull springs back to place');
 assert.equal(settled.opacity,'','a short pull restores the sheet opacity');
 assert.ok(!/matrix\(1, 0, 0, 1, 0, [1-9]/.test(settled.matrix),'the sheet is not left translated downwards');
 assert.equal(await page.locator('#sheet').innerHTML(),before,'a short pull does not disturb the sheet contents');

 // a sideways swipe does not dismiss
 await drag({x:Math.round(width/2),y:Math.round(box.y+box.height*0.4)},180,30);
 await page.waitForTimeout(250);
 assert.equal(await shown(page),true,'a sideways swipe keeps the sheet open');

 // a drag inside a scrolled sheet scrolls it instead of dismissing it
 await page.locator('#sheet').evaluate(el=>{
  const spacer=document.createElement('div');
  spacer.style.height='1400px';spacer.setAttribute('aria-hidden','true');
  el.append(spacer);el.scrollTop=260;
 });
 await page.waitForFunction(()=>document.querySelector('#sheet').scrollTop>200);
 box=await sheetBox();
 await drag({x:Math.round(width/2),y:Math.round(box.y+box.height*0.4)},0,150);
 await page.waitForTimeout(250);
 assert.equal(await shown(page),true,'dragging a scrolled sheet keeps it open');
 const settledDrag=await page.locator('#sheet').evaluate(el=>el.style.transform);
 if(touch){
  const scrolled=await page.evaluate(()=>document.querySelector('#sheet').scrollTop);
  assert.ok(scrolled<260,'an inner drag still scrolls the sheet');
 }else assert.equal(settledDrag,'','a mouse drag never moves a scrolled sheet');
 await page.evaluate(()=>{document.querySelector('#sheet').scrollTop=0});

 // the drag never steals a tap
 await openSettings(page);
 await page.locator('#sheet [data-a="srcsheet"]').click();
 await page.waitForSelector('#sheet .source-card');
 assert.equal(await shown(page),true,'tapping a row still opens the next sheet');

 // a pull that starts on a row must not fire the row afterwards
 await openSettings(page);
 const rowBox=await page.locator('#sheet [data-a="srcsheet"]').boundingBox();
 await drag({x:Math.round(rowBox.x+rowBox.width/2),y:Math.round(rowBox.y+rowBox.height/2)},0,70);
 await page.waitForTimeout(350);
 assert.equal(await shown(page),true,'a medium pull keeps the sheet open');
 assert.equal(await page.locator('#sheet .source-card').count(),0,'a pull starting on a row never activates it');

 // form fields keep their own drag behaviour
 await page.evaluate(()=>customSourceSheet('Add a source'));
 await page.waitForSelector('#csBase');
 const fieldBox=await page.locator('#csBase').boundingBox();
 await drag({x:Math.round(fieldBox.x+fieldBox.width/2),y:Math.round(fieldBox.y+fieldBox.height/2)},0,200);
 await page.waitForTimeout(300);
 assert.equal(await shown(page),true,'dragging a form field never dismisses the sheet');
 assert.equal(await page.locator('#csBase').isVisible(),true,'the source form stays open');

 // a sheet that already owns a gesture is left alone
 await page.evaluate(()=>{close();settings()});
 await page.waitForSelector('#sheet .glint-source-choice');
 await page.evaluate(()=>{
  const sheet=document.querySelector('#sheet');
  sheet.classList.add('full','tag-feed-sheet');
  sheet.dataset.tagFeedKey='danbooru:custom-sheet';
 });
 box=await sheetBox();
 await drag({x:Math.round(width/2),y:Math.round(box.y+box.height*0.4)},0,240);
 await page.waitForTimeout(350);
 assert.equal(await shown(page),true,'a sheet with its own gesture keeps that gesture');
 await page.evaluate(()=>close());

 // reopening after a dismissal leaves no drag residue
 await openSettings(page);
 assert.equal(await page.locator('#sheet').evaluate(el=>el.style.transform+el.style.opacity),'','a reopened sheet has no drag residue');
 console.log(`PASS ${label}${reduced?' (reduced motion)':''}: sheets with a grabber slide down to close, short pulls spring back, scrolling taps and forms are untouched.`);
 await context.close();
}

(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  await run(browser,{width:390,height:844,touch:true,reduced:false});
  await run(browser,{width:360,height:740,touch:true,reduced:true});
  await run(browser,{width:1200,height:900,touch:false,reduced:false});
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
