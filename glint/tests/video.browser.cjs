/* Video posts: the play mark on the card, a player that really plays the
   source file in the post view, a player in the full-screen viewer, and an
   honest Retry when the file will not load. The playing fixture is a 1 KB
   VP8 WebM; nothing but the local server is contacted. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,1200').split(',').map(Number);
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const tiny=fs.readFileSync(path.join(__dirname,'fixtures','tiny.webm'));
const webm=(id,ext='webm')=>({id,md5:'abcdef0123456789abcdef0123456789',image_width:160,image_height:208,file_ext:ext,file_size:tiny.length,
  file_url:`https://cdn.donmai.us/original/${id}.${ext}`,large_file_url:`https://cdn.donmai.us/original/${id}.${ext}`,
  preview_url:`https://cdn.donmai.us/preview/${id}.jpg`,tag_string:'animated landscape',rating:'g',score:Number(id),created_at:'2026-10-20T10:00:00Z'});
const picture=id=>({id,md5:'11111111111111111111111111111111',image_width:400,image_height:520,file_ext:'png',
  file_url:`https://cdn.donmai.us/original/${id}.png`,large_file_url:`https://cdn.donmai.us/sample/${id}.jpg`,
  preview_url:`https://cdn.donmai.us/preview/${id}.jpg`,tag_string:'landscape',rating:'g',score:Number(id),created_at:'2026-10-20T10:00:00Z'});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],videoRequests=[];
  let failVideo=false,exploreMode=false;
  page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image'){if(u.pathname.includes('bad-poster'))return route.abort('failed');return route.fulfill({contentType:'image/svg+xml',body:svg});}
   const full=decodeURIComponent(u.pathname+u.search);
   if(/\.(?:mp4|webm)/i.test(full)&&req.resourceType()!=='document'){
     videoRequests.push(full);
     if(failVideo)return route.abort('failed');
     return route.fulfill({status:200,contentType:/\.webm/i.test(full)?'video/webm':'video/mp4',body:tiny,headers:{'Accept-Ranges':'bytes'}});
   }
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   const target=new URL(u.searchParams.get('u')),p=target.pathname;
   let value=[];
   if(p.endsWith('counts/posts.json'))value={counts:{posts:3}};
   else if(p==='/posts.json')value=exploreMode?[picture(9003)]:[webm(9001),picture(9002),webm(9004)];
   else if(p==='/explore/posts/popular.json')value=[webm(9001)];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(value)})});
  await page.goto(BASE+'/');await page.waitForFunction(()=>window.PB_APP_READY===true);
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>0);
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();
  const cdp=await context.newCDPSession(page),swipe=async(from,to)=>{if(mobile){const send=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[{id:1,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]:[]});await send('touchStart',from);for(let i=1;i<=6;i++)await send('touchMove',{x:from.x+(to.x-from.x)*i/6,y:from.y+(to.y-from.y)*i/6});await send('touchEnd',null)}else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:6});await page.mouse.up()}await page.waitForTimeout(80)};
  const posterProbe=await page.evaluate(()=>{const video=new URL('./api/proxy',location.href).href+'?u='+encodeURIComponent('https://cdn.donmai.us/original/poster-probe.webm'),p={id:'poster-probe',grid:'https://cdn.donmai.us/preview/bad-poster.jpg',sample:'https://cdn.donmai.us/sample/good-poster.jpg',orig:video,r:1.2},host=document.createElement('div');host.id='video-poster-fallback';host.innerHTML=art(p,PLAY_BADGE);document.body.append(host);return {video:isVideoPin(p),poster:videoPoster(p),source:host.querySelector('img')?.getAttribute('src')}});
  assert.equal(posterProbe.video,true,'a proxied video URL is still recognized as a video');
  assert.match(posterProbe.poster,/bad-poster\.jpg/,'video thumbnail starts with the first actual still, not the video file');
  await page.waitForFunction(()=>document.querySelector('#video-poster-fallback img')?.src.includes('good-poster.jpg'));
  assert.equal(await page.locator('#video-poster-fallback .image-unavailable').count(),0,'failed video posters fall back to the next still instead of showing Image unavailable');
  await page.locator('#video-poster-fallback').evaluate(e=>e.remove());
  const player=()=>page.evaluate(()=>{const v=document.querySelector('.post-media video.post-video');if(!v)return null;const box=v.closest('.post-media'),r=v.getBoundingClientRect();
    return {src:v.getAttribute('src'),poster:v.getAttribute('poster'),controls:v.controls,plays:v.hasAttribute('playsinline'),preload:v.getAttribute('preload'),
      zoomable:box.hasAttribute('data-a'),role:box.getAttribute('role'),fallback:v.getAttribute('data-fallback-src'),
      centred:(()=>{const b=box.getBoundingClientRect();return Math.abs((r.left+r.width/2)-(b.left+b.width/2))<=1&&Math.abs((r.top+r.height/2)-(b.top+b.height/2))<=1})(),
      fills:Math.round(r.width)===Math.round(box.getBoundingClientRect().width),width:Math.round(r.width),height:Math.round(r.height),
      readyState:v.readyState,duration:v.duration,currentTime:v.currentTime,paused:v.paused,error:v.error&&v.error.code}});

  // ---- the card shows a play mark, the picture does not -------------------
  assert.equal(await page.locator('[data-id="danbooru:9001"] .vidb').count(),1,'the video card carries a play mark');
  assert.equal(await page.locator('[data-id="danbooru:9002"] .vidb').count(),0,'a picture card does not');

  // ---- the post view really plays it -------------------------------------
  await press('[data-id="danbooru:9001"]');
  await page.waitForSelector('.post-media video.post-video',{state:'attached'});
  await page.waitForFunction(()=>{const v=document.querySelector('.post-media video.post-video');return v&&v.readyState>=2},{},{timeout:8000});
  let state=await player();
  assert.match(state.src,/(?:9001\.webm|%2F9001\.webm)/,'the player points at the source video file');
  assert.equal(/\/api\/proxy/.test(state.src),false,'the video streams from the CDN, not through the size-capped proxy');
  assert.match(state.fallback||'',/\/api\/proxy/,'the proxied copy is kept as the declared fallback');
  assert.ok(state.poster,'the still preview is the poster');
  assert.equal(state.controls,true,'native controls are offered');
  assert.equal(state.plays,true,'it plays inline on mobile');
  assert.equal(state.preload,'metadata');
  assert.equal(state.zoomable,false,'a video is not a zoomable picture');
  assert.equal(state.role,'group');
  assert.equal(state.width>200&&state.height>200,true,'the player is laid out at a usable size');
  assert.equal(state.centred,true,'the video is centred in the post, like a picture');
  assert.equal(Number(state.duration.toFixed(1)),2,'the file is decoded, not just fetched');
  assert.equal(videoRequests.some(x=>/9001\.webm/.test(x)),true,'the video file is actually requested');
  await page.locator('.post-media video').evaluate(v=>v.play());
  await page.waitForTimeout(900);
  state=await player();
  assert.equal(state.paused,false,'it is playing');
  assert.equal(state.currentTime>0.2,true,'playback time advances');
  assert.equal(await page.locator('.post-media .media-failure').count(),0,'a playable video shows no failure');
  const videoBox=await page.locator('.post-media video').boundingBox(),videoPoint={x:videoBox.x+videoBox.width/2,y:videoBox.y+videoBox.height*.55};
  await page.evaluate(()=>{window.__videoBeforeRelated=document.querySelector('#sheet .post-video')});
  await swipe(videoPoint,{x:videoPoint.x+6,y:videoPoint.y-150});
  await page.waitForFunction(()=>postView()?.kind==='blank'&&document.querySelector('#sheet .related-page'));
  const handoffFrames=await page.locator('#sheet.post-blank-page').evaluate(el=>el.getAnimations().flatMap(a=>a.effect.getKeyframes()));
  assert(handoffFrames.every(frame=>!frame.transform&&!frame.clipPath),'the post-to-Related art handoff crossfades without sliding');
  assert.ok(await page.locator('#sheet .related-header h1').innerText().then(t=>t==='Related art'),'a vertical swipe on video opens the Related art page');
  assert.equal(await page.evaluate(()=>window.__videoBeforeRelated.isConnected&&window.__videoBeforeRelated.paused&&!!window.__videoBeforeRelated.closest('.glint-related-post-underlay')),true,'Related art retains the painted video frame, paused in an inert underlay');
  await page.goBack();await page.waitForFunction(()=>postView()?.kind==='post'&&document.querySelector('#sheet .post-media video'));
  assert.equal(await page.evaluate(()=>window.__videoBeforeRelated===document.querySelector('#sheet .post-video')),true,'return reuses the same video instead of flashing a new player');
  await page.waitForTimeout(150);
  await page.evaluate(()=>close());
  await page.waitForTimeout(150);

  // ---- a picture still opens the zoomable viewer --------------------------
  await press('[data-id="danbooru:9002"]');
  await page.waitForSelector('.post-media img.post-image');
  assert.equal(await page.evaluate(()=>document.querySelector('.post-media').hasAttribute('data-a')),true,'pictures keep the full-screen gesture');
  await page.evaluate(()=>close());
  await page.waitForTimeout(150);

  // ---- a video that will not load says so and retries ---------------------
  failVideo=true;
  await press('[data-id="danbooru:9004"]');
  await page.waitForSelector('.post-media .media-failure',{state:'attached'});
  assert.match(await page.locator('.post-media .media-failure').innerText(),/video could not play/i);
  const attempts=videoRequests.filter(x=>/9004/.test(x)).length;
  await page.locator('.post-media [data-a="retryvideo"]').first().click();
  await page.waitForTimeout(600);
  assert.equal(videoRequests.filter(x=>/9004/.test(x)).length>attempts,true,'Retry requests the video again');
  await page.evaluate(()=>close());
  await page.waitForTimeout(150);

  // ---- Explore marks its videos too --------------------------------------
  exploreMode=true;
  await page.evaluate(()=>{S.screen='profile';S.bt='Explore';S.src='danbooru';render();exploreReset('danbooru');exploreEnsure()});
  await page.waitForFunction(()=>document.querySelectorAll('.ex-section .ex-cell').length>0);
  assert.equal(await page.locator('.ex-section .ex-cell .vidb').count(),1,'Explore cards mark their video too');
  // The mark must be PAINTED above the picture, not hidden behind it. Feed
  // images are animated (pbFade) and get promoted to their own layer, which
  // painted them over the badge: on the Explore feed page the mark vanished.
  // elementFromPoint cannot see it (the badge is pointer-events:none), so the
  // check is a screenshot diff with the badge hidden.
  const painted=async(scope,label)=>{
    const box=await page.evaluate(scope=>{const b=document.querySelector(scope+' .vidb');if(!b)return null;b.scrollIntoView({block:'center',inline:'center'});const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}},scope);
    assert.ok(box,label+': the video card carries a play mark');
    await page.waitForTimeout(150);
    const clip={x:box.x-2,y:box.y-2,width:box.width+4,height:box.height+4};
    const shown=await page.screenshot({clip});
    await page.evaluate(scope=>{document.querySelector(scope+' .vidb').style.visibility='hidden'},scope);
    const hidden=await page.screenshot({clip});
    await page.evaluate(scope=>{document.querySelector(scope+' .vidb').style.visibility=''},scope);
    assert.notEqual(shown.toString('base64'),hidden.toString('base64'),label+': the play mark is painted on top of the picture');
  };
  await painted('.ex-section .ex-cell','Explore strip');
  // …and in the full Explore feed page opened from "See more".
  await page.evaluate(()=>{const sec=EX_SEC.find(s=>s.key==='popular');exploreLoad(sec,{scale:sec.def,reset:true})});
  await page.waitForFunction(()=>document.querySelector('.ex-section .ex-more'));
  await page.evaluate(()=>document.querySelector('.ex-section .ex-more').click());
  await page.waitForFunction(()=>document.querySelectorAll('#sheet .grid [data-id]').length>0);
  await page.waitForTimeout(550); // let the sheet's slide-up finish before taking a clipped screenshot
  await painted('#sheet .grid','Explore feed page');
  await page.evaluate(()=>close());
  await page.waitForTimeout(150);

  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: video cards carry a play mark, the post view decodes and plays the real file with controls/playsinline and its still poster, pictures keep the zoom gesture, a failed video reports itself and retries, Explore marks its videos.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
