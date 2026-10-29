/* Production regression: fixture traffic only; NEVER writes a real source. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,435,1200').split(',').map(Number);
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="820"><rect width="600" height="820" fill="#406c76"/><circle cx="400" cy="220" r="120" fill="#dbbc83"/></svg>';
const image='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
const pin=(id=101,src='danbooru')=>({id:src+':'+id,sid:String(id),src,t:'Landscape',c:'Art',grid:image,sample:image,orig:image,r:820/600,width:600,height:820,tags:['landscape'],characters:[],artists:[],series:[],rating:'g',detailsReady:true,fileInfoReady:true,sourceInfoReady:true,uploadInfoReady:true});
const seed={mode:'demo',screen:'home',src:'danbooru',srcs:['danbooru','yandere'],bookmarkVersion:1,bookmarks:[],custom:[pin()],likes:[]};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const make=async(width=390,raw=seed,extra={})=>{
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block',...extra});
  await context.addInitScript(raw=>{if(!sessionStorage.getItem('__prod_seed')){localStorage.setItem('pb2',typeof raw==='string'?raw:JSON.stringify(raw));sessionStorage.setItem('__prod_seed','1')}localStorage.setItem('pb-swipe-hint-v22','1')},raw);
  await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});if(u.pathname==='/api/proxy'){let b;try{b=JSON.parse(req.postData())}catch(_){}const target=new URL(b?.url||u.searchParams.get('u'));let value=target.pathname.includes('/counts/')?{counts:{posts:0}}:[];return route.fulfill({contentType:'application/json',body:JSON.stringify(b?.pb_private?{pb_private_response:1,status:200,body:JSON.stringify(value)}:value)})}return u.hostname==='127.0.0.1'||u.protocol==='data:'||u.protocol==='blob:'?route.continue():route.abort()});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'/');await page.waitForSelector('.grid');
  return {context,page,errors};
 };
 // Invalid settings must not crash, erase good saves, or automatically overwrite a broken record.
 for(const raw of [{...seed,likes:'bad',hidden:null,boards:null,custom:null,srcs:['unknown']},'{broken JSON',JSON.stringify(null),{...seed,live:[],pinCache:'bad',stags:4}]){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await page.addInitScript(raw=>{localStorage.setItem('pb2',typeof raw==='string'?raw:JSON.stringify(raw));localStorage.setItem('pb-swipe-hint-v22','1')},raw);
  await page.route('**/api/proxy?*',r=>r.fulfill({contentType:'application/json',body:'[]'}));page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'/');await page.waitForFunction(()=>window.PB_APP_READY===true);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>Array.isArray(S.bookmarks)&&S.srcs.length>0),true);
  if(typeof raw==='string')assert.equal(await page.evaluate(()=>localStorage.getItem('pb2')),raw,'bad raw data retained until explicit repair');
  await context.close();
 }
 console.log('PASS malformed storage recovery without a blank screen or silent reset.');
 for(const width of widths){
  const {context,page,errors}=await make(width);const cdp=await context.newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:i+1,x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}))});
  const swipe=async(a,b)=>{if(width<600){await touch('touchStart',[a]);for(let i=1;i<=6;i++)await touch('touchMove',[{x:a.x+(b.x-a.x)*i/6,y:a.y+(b.y-a.y)*i/6}]);await touch('touchEnd',[])}else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up()}};
  // Both the URL and the HTML attribute boundary are treated as data.
  await page.evaluate(p=>{p.grid='https://fixture.invalid/image.svg" onload="window.__auditXSS=1" data-x="';p.id='demo:1" data-injected="yes';S.custom=[p];render()},pin());await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.__auditXSS||0),0);assert.equal(await page.locator('.art img[onload],.art img[onerror],[data-injected]').count(),0);
  assert.equal(await page.evaluate(()=>PB_RUNTIME.mediaURL('javascript:alert(1)')),'');
  await page.evaluate(p=>{S.custom=[p];render()},pin());
  const card=page.locator('[data-a="open"]').first();await card.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>postView()?.kind==='post');
  assert.equal(await page.evaluate(()=>document.getElementById('app').inert&&document.body.classList.contains('dialog-open')),true);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.getElementById('sheet').contains(document.activeElement)),true);
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.getElementById('sheet').contains(document.activeElement)),true);
  // Deliberately NO animation-settling sleeps: every new gesture interrupts a running transition.
  const before=await page.evaluate(()=>history.length),x=width/2;
  for(let cycle=0;cycle<7;cycle++){
   await swipe({x,y:350},{x,y:185});await page.waitForFunction(()=>postView()?.kind==='blank');
   await swipe({x,y:270},{x,y:440});await page.waitForFunction(()=>postView()?.kind==='post');
  }
  assert.equal(await page.evaluate(()=>history.length),before+1);assert.equal(await page.evaluate(()=>postView().id),'danbooru:101');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));
  assert.equal(await page.evaluate(()=>document.getElementById('app').inert||document.body.classList.contains('dialog-open')),false);
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.a),'open');
  if(width<600){
   await page.evaluate(p=>{S.mode='live';S.live={danbooru:[p],yandere:[{...p,id:'yandere:101',src:'yandere'}]};MORE=false;render()},pin());
   const drag=async()=>{await touch('touchStart',[{x:width-50,y:260}]);for(let i=1;i<=5;i++)await touch('touchMove',[{x:width-50-60*i/5,y:260}])};
   const state=()=>page.evaluate(()=>({src:S.src,feed:feedEl().style.transform,indicator:document.querySelector('.srctabs .tind').style.transform}));
   const before=await state();await drag();await touch('touchCancel',[]);await page.waitForTimeout(260);assert.deepEqual(await state(),before);
   await drag();await touch('touchStart',[{x:width-110,y:260},{x:width-60,y:300}]);await touch('touchEnd',[]);await page.waitForTimeout(260);assert.deepEqual(await state(),before);
  }
  // Compact controls stay inside the sheet; source row keeps its add control reachable.
  const layout=await page.evaluate(()=>{settings();const s=document.getElementById('sheet').getBoundingClientRect();const clipped=[...document.querySelectorAll('#sheet button,#sheet .sw,#sheet input')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.right>s.right+1||r.left<s.left-1)}).map(n=>n.textContent.trim().slice(0,24));document.getElementById('sheet').scrollTop=document.getElementById('sheet').scrollHeight;const more=[...document.querySelectorAll('#sheet button,#sheet .sw,#sheet input')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&(r.right>s.right+1||r.left<s.left-1)}).map(n=>n.textContent.trim().slice(0,24));return {clipped:[...clipped,...more]}});assert.deepEqual(layout.clipped,[]);
  await page.evaluate(()=>{close();S.mode='demo';S.screen='home';render()});const add=await page.locator('.srctabs [data-a="addsrc"]').evaluate(n=>{const r=n.getBoundingClientRect();return {w:r.width,visible:r.right<=innerWidth+1&&r.left>=0}});assert.ok(add.w>=44&&add.visible,'add-source control must stay tappable and visible');
  // Quota failure is visible and does not pretend the bookmark was saved.
  await page.evaluate(()=>{S.bookmarks=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='pb2')throw new DOMException('Quota','QuotaExceededError');return set.call(this,k,v)};toggleBookmark('danbooru:101')});
  assert.equal(await page.evaluate(()=>S.bookmarks.length),0);assert.equal(await page.locator('#storageNotice').isVisible(),true);assert.match(await page.locator('#toast').innerText(),/not saved/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: safe rendering; keyboard/modal focus; 7 immediate touch/mouse post round-trips; source cancellation/multitouch; quota rollback, no overflow or page errors.`);await context.close();
 }
 // Backup export is allow-listed (never credentials/legacy hearts) and import merges local saves only.
 {
  const {context,page,errors}=await make();
  // Some sandboxes cannot hand a file to the browser's download manager at all,
  // so capture the anchor downloadJSON() clicks and the exact Blob it would
  // have saved (reading the Blob, not fetching it, keeps CSP untouched).
  // The allow-list assertions below are unchanged.
  await page.evaluate(()=>{
    window.__save={name:null,blob:null,count:0};
    const make=URL.createObjectURL;
    URL.createObjectURL=function(b){window.__save.blob=b;return make.call(this,b)};
    const click=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      if(this.download){window.__save.name=this.download;window.__save.count++;return}
      return click.call(this);
    };
  });
  await page.evaluate(()=>{S.bookmarks=[{id:'danbooru:101',savedAt:Date.now()}];S.pinCache={'danbooru:101':{...pin(),apiKey:'SHOULD_NOT_EXPORT'}};PB_RUNTIME.exportBackup(S)});
  await page.waitForTimeout(300);
  const saved=await page.evaluate(async()=>({count:window.__save.count,name:window.__save.name,text:window.__save.blob?await window.__save.blob.text():''}));
  assert.equal(saved.count,1,'exactly one backup file is produced');
  assert.match(saved.name,/^pinboard-bookmarks-\d{4}-\d{2}-\d{2}\.json$/);
  const backup=JSON.parse(saved.text),backupText=saved.text;
  assert.equal(backup.format,'pinboard-bookmarks');assert.equal(backup.bookmarks.length,1);assert.ok(!backupText.includes('SHOULD_NOT_EXPORT'));assert.ok(!backupText.includes('DUMMY'));
  const fs=require('node:fs'),file='/tmp/pinboard-import-v65.json';fs.writeFileSync(file,JSON.stringify({format:'pinboard-bookmarks',version:1,bookmarks:[{id:'danbooru:202',savedAt:1},{id:'danbooru:101',savedAt:2}],pinCache:{'danbooru:202':{...pin(202),grid:image}}}));
  await page.evaluate(()=>{settings()});const chooser=page.waitForEvent('filechooser');await page.locator('[data-a="importbackup"]').click();await (await chooser).setFiles(file);
  await page.waitForFunction(()=>S.bookmarks.length===2);assert.deepEqual(await page.evaluate(()=>S.bookmarks.map(b=>b.id).sort()),['danbooru:101','danbooru:202']);assert.equal(await page.evaluate(()=>!!S.pinCache['danbooru:202']),true);
  fs.writeFileSync(file,'{not json');const again=page.waitForEvent('filechooser');await page.locator('[data-a="importbackup"]').click();await (await again).setFiles(file);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>S.bookmarks.length),2,'invalid import changes nothing');fs.rmSync(file,{force:true});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS bookmark backup export/import: local saves only, allow-listed metadata, merge without duplicates, invalid file leaves data unchanged.');
 // Network image failure is reported in place, and Retry uses a fresh request.
 {
  const {context,page,errors}=await make();let allow=false;
  await page.unroute('**/*');await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.resourceType()==='image')return !allow&&u.href.includes('broken-media')?route.fulfill({status:503,body:''}):route.fulfill({contentType:'image/svg+xml',body:svg});if(u.pathname==='/api/proxy')return route.fulfill({contentType:'application/json',body:'[]'});return u.hostname==='127.0.0.1'?route.continue():route.abort()});
  const broken={...pin(),grid:'https://cdn.donmai.us/broken-media.png',sample:'https://cdn.donmai.us/broken-media.png',orig:'https://cdn.donmai.us/broken-media.png'};
  await page.evaluate(p=>{S.custom=[p];S.screen='home';render()},broken);await page.waitForFunction(()=>document.querySelector('.art.image-unavailable'));
  await page.evaluate(()=>detail('danbooru:101'));await page.waitForSelector('.media-failure [data-a="retryimage"]',{timeout:5000});
  assert.equal(await page.evaluate(()=>document.querySelector('.post-media').dataset.a),undefined,'a broken image must not keep a dead full-screen action');
  allow=true;await page.locator('[data-a="retryimage"]').click();await page.waitForFunction(()=>!document.querySelector('.media-failure'));
  assert.equal(await page.evaluate(()=>document.querySelector('.post-media').dataset.a),'viewimage');assert.equal(await page.evaluate(()=>new Promise(r=>{const i=document.querySelector('.post-media img');const done=()=>r(i.complete&&i.naturalWidth>0);i.complete?done():i.addEventListener('load',done,{once:true})})),true);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS failed media stays readable, shows a retry, and a retry reloads the image without a broken control.');
 // A pending source response may not overwrite a newer source/query request.
 {
  const {context,page,errors}=await make();
  await page.evaluate(async()=>{S.mode='live';S.live={};S.src='danbooru';S.stags={};S.lpage={};MORE=true;window.__resolveOld=null;pbLoadPosts=(source,opts)=>source==='danbooru'?new Promise(r=>window.__resolveOld=r):Promise.resolve(Object.assign([{sid:'999',title:'New source',grid:'',ar:1.2,tags:[]}],{hasMore:false}));loadLive(true);S.src='yandere';await loadLive(true);window.__resolveOld([{sid:'111',title:'Old source',grid:'',ar:1.2,tags:[]}])});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>S.live.yandere[0].sid),'999');assert.equal(await page.evaluate(()=>S.live.danbooru.length),0);assert.equal(await page.evaluate(()=>LOADING),false);assert.deepEqual(errors,[]);await context.close();
 }
 // Removed DOM observers and old settle timers must not retain/rewrite another screen.
 {
  const {context,page,errors}=await make(390,seed,{reducedMotion:'reduce'});
  await page.evaluate(()=>{window.__observers=new Set();const Native=ResizeObserver;window.ResizeObserver=class extends Native{observe(...a){window.__observers.add(this);return super.observe(...a)}disconnect(){window.__observers.delete(this);return super.disconnect()}};S.screen='profile';S.bt='Bookmarks';for(let i=0;i<12;i++)render()});
  assert.equal(await page.evaluate(()=>window.__observers.size),1);
  await page.evaluate(()=>{S.sw='right';render();slideTo('Explore')});await page.waitForFunction(()=>S.bt==='Explore');
  assert.equal(await page.evaluate(()=>document.querySelector('.tabwrap').scrollLeft),0,'reverse direction uses reversed visual pane order');
  await page.evaluate(()=>{S.screen='home';render()});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__observers.size),0);
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect.getTiming().duration>1).length),0);assert.deepEqual(errors,[]);await context.close();
 }
 // Cross-tab account removal invalidates an old account and its queued write, without replay.
 {
  const {context,page,errors}=await make();const other=await context.newPage();await other.goto(BASE+'/');await other.waitForFunction(()=>window.PB_APP_READY);
  await page.evaluate(()=>pbSetAuth('danbooru',{login:'dummy',apiKey:'DUMMY_ACCOUNT_KEY'}));await other.waitForFunction(()=>pbHasAuth('danbooru'));
  await other.evaluate(()=>{PB_LAST_WRITE.danbooru=Date.now()+700;window.__queuedOutcome='pending';pbSetFavorite('danbooru',101,true).then(()=>window.__queuedOutcome='unexpected-success',()=>window.__queuedOutcome='cancelled')});
  await page.evaluate(()=>pbSetAuth('danbooru',null));await other.waitForFunction(()=>!pbHasAuth('danbooru'));await other.waitForFunction(()=>window.__queuedOutcome==='cancelled');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS source response generations, reduced motion, reverse pager direction, observer cleanup and cross-tab credential/queued-write cancellation. All fixture-only.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
