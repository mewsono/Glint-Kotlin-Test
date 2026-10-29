/* Google Drive sync, end to end, against a fake Drive that lives in the test.
   Two browser contexts act as two devices sharing one Drive: what one saves the
   other must receive, a deletion must not come back, settings travel with the
   newest change, and a background sync must never open a sign-in window.
   No Google account and no network are involved. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const post=id=>({id,md5:String(id).padStart(32,'b'),image_width:900,image_height:1300,file_ext:'jpg',
  file_url:`https://cdn.donmai.us/${id}.jpg`,preview_url:`https://cdn.donmai.us/p/${id}.jpg`,large_file_url:`https://cdn.donmai.us/s/${id}.jpg`,
  tag_string:`landscape artist_${id}`,tag_string_artist:`artist_${id}`,rating:'g',score:1,created_at:'2026-10-20T10:00:00Z'});

/* ---------- a small Drive, on the Node side (survives reloads) ------------ */
const drive={files:new Map(),next:1,calls:[],fail403:false,delay:0};
const stamp=()=>new Date(Date.now()+drive.next).toISOString();
function findFile(){return [...drive.files.values()][0]||null}
const bodyOf=request=>{try{return request.postData()||''}catch(_){return ''}}
async function routeDrive(route){
  if(drive.delay)await new Promise(r=>setTimeout(r,drive.delay));
  const request=route.request(),url=new URL(request.url()),method=request.method(),body=bodyOf(request);
  drive.calls.push(method+' '+url.pathname);
  const json=(status,payload)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  if(drive.fail403&&url.hostname==='www.googleapis.com')return json(403,{error:{code:403,status:'PERMISSION_DENIED',message:'Google Drive API has not been used in project 123 before or it is disabled.',errors:[{reason:'accessNotConfigured'}]}});
  assert.ok(/^Bearer /.test(request.headers()['authorization']||''),'every Drive call carries a bearer token');
  if(url.hostname==='www.googleapis.com'&&url.pathname==='/drive/v3/about')return json(200,{user:{emailAddress:'tester@example.com',displayName:'Tester'}});
  if(url.hostname==='www.googleapis.com'&&url.pathname==='/drive/v3/files'&&method==='GET'){
    const file=findFile();
    return json(200,{files:file?[{id:file.id,modifiedTime:file.modifiedTime}]:[]});
  }
  if(url.hostname==='www.googleapis.com'&&/^\/drive\/v3\/files\/[^/]+$/.test(url.pathname)){
    const id=url.pathname.split('/').pop(),file=drive.files.get(id);
    if(!file)return json(404,{error:{code:404,message:'File not found',status:'NOT_FOUND'}});
    if(url.searchParams.get('alt')==='media')return route.fulfill({status:200,contentType:'application/json',body:file.body});
    return json(200,{id:file.id,modifiedTime:file.modifiedTime});
  }
  if(url.hostname==='www.googleapis.com'&&url.pathname==='/upload/drive/v3/files'&&method==='POST'){
    const marker='Content-Type: application/json\r\n\r\n';
    const at=body.lastIndexOf(marker);
    const payload=body.slice(at+marker.length,body.lastIndexOf('\r\n--'));
    const id='file'+drive.next++;
    drive.files.set(id,{id,modifiedTime:stamp(),body:payload});
    return json(200,{id,modifiedTime:drive.files.get(id).modifiedTime});
  }
  if(url.hostname==='www.googleapis.com'&&/^\/upload\/drive\/v3\/files\/[^/]+$/.test(url.pathname)&&method==='PATCH'){
    const id=url.pathname.split('/').pop(),file=drive.files.get(id);
    if(!file)return json(404,{error:{code:404,message:'File not found'}});
    file.body=body;file.modifiedTime=stamp();
    return json(200,{id,modifiedTime:file.modifiedTime});
  }
  return json(404,{error:{message:'unhandled '+method+' '+url.href}});
}
const stored=()=>{const file=findFile();return file?JSON.parse(file.body):null};

async function device(browser,{bookmarks,cols}){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('__drive_seeded')){
      localStorage.setItem('__drive_seeded','1');
      localStorage.setItem('pb-swipe-hint-v22','1');
      localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}));
    }
    // Google Identity Services, stubbed: a token is handed back, and every
    // request for one is counted so a background sync can be proven not to ask.
    window.__tokenRequests=0;
    window.google={accounts:{oauth2:{
      hasGrantedAllScopes:()=>true,
      initTokenClient:config=>({requestAccessToken:()=>{window.__tokenRequests++;setTimeout(()=>config.callback({access_token:'fake-token',expires_in:3600}),5)}})
    }}};
  });
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
    if(u.hostname==='www.googleapis.com')return routeDrive(route);
    if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
    if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
    let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}
    const target=new URL(envelope?.pb_private===1?envelope.url:u.searchParams.get('u'));
    if(target.pathname.endsWith('counts/posts.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({counts:{posts:10}})});
    if(!/\.json$/.test(target.pathname))return route.fulfill({contentType:'application/json',body:'[]'});
    const single=target.pathname.match(/(\d+)\.json$/);
    if(single)return route.fulfill({contentType:'application/json',body:JSON.stringify(post(Number(single[1])))});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(Array.from({length:20},(_,i)=>post(1000-i)))});
  });
  await page.goto(BASE+'/');
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>0);
  await page.evaluate(({ids,cols})=>{
    S.bookmarks=[];S.pinCache={};
    for(const id of ids){rememberPin({...pin(document.querySelector('.grid [data-id]').dataset.id),id,sid:String(id.split(':')[1]),grid:'https://cdn.donmai.us/p/'+id+'.jpg',tags:['landscape'],artists:['artist_'+id],detailsReady:true});S.bookmarks.push({id,savedAt:Date.now()});forgetBookmarkIds()}
    if(cols)S.cols=cols;
    save(true);
  },{ids:bookmarks,cols});
  return {context,page,errors};
}
async function openDrive(page){
  await page.evaluate(()=>{advancedSettings()});
  await page.waitForSelector('[data-a="drivesync"]');
}
async function setClientId(page,id='test-client.apps.googleusercontent.com'){
  await page.evaluate(id=>{const input=document.getElementById('driveClientId');input.value=id;document.querySelector('[data-a="driveclient"]').click()},id);
}
async function connect(page){
  await page.evaluate(()=>document.querySelector('[data-a="drivesync"]').click());
}
const waitFor=async(fn,label,timeout=15000)=>{const started=Date.now();for(;;){if(await fn())return;if(Date.now()-started>timeout)throw new Error('timeout: '+label);await new Promise(r=>setTimeout(r,100))}};

(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
  /* ---------------- device A: the first backup ---------------- */
  const a=await device(browser,{bookmarks:['danbooru:9001','danbooru:9002'],cols:2});
  /* The Home and Bookmarks headers share the Drive sync dot. */
  const ringOf=async page=>{await page.waitForTimeout(320);
    return page.evaluate(()=>{const dot=document.querySelector('.glint-live[data-drive-ring]'),css=getComputedStyle(dot);return {mode:dot.dataset.driveRing,color:css.backgroundColor,animation:css.animationName,label:dot.getAttribute('aria-label'),profileLabel:document.querySelector('#nav [data-v="profile"]').getAttribute('aria-label')}})};
  const ringAttr=page=>page.evaluate(()=>document.querySelector('.glint-live[data-drive-ring]').dataset.driveRing);
  const dotOf=page=>page.evaluate(()=>{const dot=document.querySelector('.glint-live[data-drive-ring]'),css=getComputedStyle(dot);return {mode:dot.dataset.driveRing,color:css.backgroundColor,animation:css.animationName,label:dot.getAttribute('aria-label')}});
  const off=await ringOf(a.page);
  assert.equal(off.mode,'off','with Drive off the dot is red');
  assert.equal(off.color,'rgb(229, 72, 77)','the disconnected dot is static red');
  assert.equal(off.animation,'none');
  assert.match(off.profileLabel,/sync is off/,'the profile button says so for screen readers');
  const offDot=await dotOf(a.page);
  assert.equal(offDot.mode,'off');assert.equal(offDot.color,'rgb(229, 72, 77)','the Home dot is static red when Drive is disconnected');assert.equal(offDot.animation,'none');
  assert.match(offDot.label,/sync is off/,'the Home dot announces the Drive state');
  await a.page.evaluate(()=>{S.screen='profile';S.bt='Bookmarks';render()});
  const bookmarkDot=await dotOf(a.page);
  assert.equal(bookmarkDot.mode,'off','the bookmark tab carries the same Drive status');
  assert.equal(bookmarkDot.color,'rgb(229, 72, 77)');
  await a.page.evaluate(()=>{S.screen='home';render()});
  await openDrive(a.page);
  assert.equal(await a.page.locator('[data-a="drivebackup"]').count(),1,'Settings has Drive sync rows');
  await setClientId(a.page);
  await connect(a.page);
  await waitFor(()=>drive.files.size>0,'first upload');
  const first=stored();
  assert.equal(first.app,'pinboard','the file is ours, identified by app name');
  assert.deepEqual(first.data.bookmarks.map(b=>b.id).sort(),['danbooru:9001','danbooru:9002'],'both bookmarks uploaded');
  assert.equal(first.settings.cols,2,'settings travel with the file');
  assert.ok(first.data.pins['danbooru:9001'].grid,'each bookmark carries its picture address');
  assert.ok(!JSON.stringify(first).includes('api_key'),'no credentials are uploaded by default');
  await waitFor(async()=>/Synced|Connected/.test(await a.page.locator('[data-drive-status]').innerText()),'status line');
  const synced=await ringOf(a.page);
  assert.equal(synced.mode,'ok','after a successful sync the dot is steady green');
  assert.equal(synced.color,'rgb(47, 191, 113)');
  assert.equal(synced.animation,'none','a finished sync does not leave anything blinking');
  const okDot=await dotOf(a.page);
  assert.equal(okDot.mode,'ok');assert.equal(okDot.color,'rgb(47, 191, 113)','the synced dot is steady green');assert.equal(okDot.animation,'none');
  await a.page.evaluate(()=>{S.screen='profile';S.bt='Bookmarks';render()});
  const savedOkDot=await dotOf(a.page);
  assert.equal(savedOkDot.mode,'ok');assert.equal(savedOkDot.color,'rgb(47, 191, 113)','the Bookmarks header also shows steady green after sync');
  await a.page.evaluate(()=>{S.screen='home';render()});

  /* A sync in flight makes the shared status dot pulse green. */
  drive.delay=700;
  await a.page.evaluate(()=>document.querySelector('[data-a="drivebackup"]').click());
  await waitFor(async()=>(await ringAttr(a.page))==='busy','busy ring');
  const spinning=await dotOf(a.page);
  assert.equal(spinning.mode,'busy');assert.equal(spinning.color,'rgb(47, 191, 113)');
  assert.equal(spinning.animation,'glint-sync-pulse','the green dot flickers while syncing');
  const busyDot=await dotOf(a.page);
  assert.equal(busyDot.mode,'busy');assert.equal(busyDot.color,'rgb(47, 191, 113)');assert.equal(busyDot.animation,'glint-sync-pulse','the syncing dot flickers green');
  drive.delay=0;
  await waitFor(async()=>(await ringAttr(a.page))==='ok','back to steady green');

  /* ---------------- a change uploads itself ---------------- */
  const before=drive.calls.filter(c=>c.startsWith('PATCH')).length;
  await a.page.evaluate(()=>{toggleBookmark('danbooru:9002')});
  await waitFor(()=>drive.calls.filter(c=>c.startsWith('PATCH')).length>before,'auto-sync after a change',12000);
  const afterDelete=stored();
  assert.deepEqual(afterDelete.data.bookmarks.map(b=>b.id),['danbooru:9001'],'the removal reached Drive');
  assert.ok(afterDelete.data.deleted['danbooru:9002'],'and it left a tombstone so no device resurrects it');

  /* ---------------- device B: restore + merge ---------------- */
  await a.page.evaluate(()=>{S.cols=3;S.setAt=Date.now();save(true)});
  await a.page.evaluate(()=>document.querySelector('[data-a="drivebackup"]').click());
  await waitFor(()=>stored().settings.cols===3,'settings update uploaded');

  const b=await device(browser,{bookmarks:['danbooru:9003']});
  await openDrive(b.page);
  await setClientId(b.page);
  await connect(b.page);
  await waitFor(()=>drive.files.size>0&&stored().data.bookmarks.length>1,'merge upload');
  await waitFor(async()=>{const ids=await b.page.evaluate(()=>S.bookmarks.map(r=>r.id));return ids.includes('danbooru:9001')},'remote bookmark arrived on device B');
  const merged=await b.page.evaluate(()=>({ids:S.bookmarks.map(r=>r.id).sort(),cols:S.cols,deleted:S.bmDeleted}));
  assert.deepEqual(merged.ids,['danbooru:9001','danbooru:9003'],'device B has both devices’ bookmarks and not the deleted one');
  assert.equal(merged.cols,3,'the newer settings from device A arrived');
  assert.ok(merged.deleted['danbooru:9002'],'the tombstone came along');

  /* ---------------- deletion propagates back ---------------- */
  await b.page.evaluate(()=>{toggleBookmark('danbooru:9001')});
  await waitFor(()=>{const s=stored();return s&&!s.data.bookmarks.some(x=>x.id==='danbooru:9001')},'deletion uploaded from B');
  await a.page.evaluate(()=>document.querySelector('[data-a="drivesync"]').click());
  await waitFor(async()=>{const ids=await a.page.evaluate(()=>S.bookmarks.map(r=>r.id));return !ids.includes('danbooru:9001')},'deletion pulled to A');
  assert.deepEqual(await a.page.evaluate(()=>S.bookmarks.map(r=>r.id)),['danbooru:9003'],'device A now holds exactly what the other device left: the shared post, and neither deleted one');

  /* ---------------- a background sync never asks for a new token ---------- */
  const asked=await b.page.evaluate(()=>window.__tokenRequests);
  await b.page.evaluate(()=>{localStorage.removeItem('pb-drive-token');PB_DRIVE.reset()});
  await b.page.evaluate(()=>PB_DRIVE.toggleAuto());
  await b.page.evaluate(()=>PB_DRIVE.toggleAuto());
  await b.page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'))});
  await b.page.waitForTimeout(800);
  assert.equal(await b.page.evaluate(()=>window.__tokenRequests),asked,'a background sync did not open a sign-in window');

  /* ---------------- a switched-off Drive API is explained ---------------- */
  drive.fail403=true;
  await b.page.evaluate(()=>document.querySelector('[data-a="drivebackup"]').click());
  await waitFor(async()=>/Drive API is switched off/.test(await b.page.locator('[data-drive-status]').innerText()),'helpful 403 message');
  drive.fail403=false;

  const broken=await ringOf(b.page);
  assert.equal(broken.mode,'error','a Drive problem shows the static red dot again');
  assert.equal(broken.color,'rgb(229, 72, 77)');
  assert.equal(broken.animation,'none');
  assert.match(broken.profileLabel,/problem/,'and the profile button explains it');
  const errorDot=await dotOf(b.page);
  assert.equal(errorDot.mode,'error');assert.equal(errorDot.color,'rgb(229, 72, 77)','a Drive problem turns the dot static red');assert.equal(errorDot.animation,'none');
  assert.match(errorDot.label,/problem/);
  assert.deepEqual(a.errors,[],'no page errors on device A');
  assert.deepEqual(b.errors,[],'no page errors on device B');
  console.log('PASS 390px: the Home and bookmark status dots are static red when Drive is off or broken, flicker green while syncing, and stay green after sync; Drive sync backs up bookmarks, pins and settings to one hidden file, merges two devices by newest change, propagates deletions with tombstones, keeps credentials out by default, never opens a popup in the background, and explains a disabled Drive API.');
  await a.context.close();await b.context.close();
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
