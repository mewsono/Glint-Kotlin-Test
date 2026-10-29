const {chromium}=require('playwright');
const BASE='http://127.0.0.1:8000/';
const palette=[['#5f4785','#d6a87c'],['#3f6979','#d7c4a1'],['#8c5063','#e4ad80'],['#556a45','#d3c489'],['#4b527e','#bd9cc9'],['#8a6040','#e0c39d'],['#456f72','#efb9a6'],['#704c78','#e5bc8b']];
function mockPost(i,scope){
 const id=1000+scope*100+i;
 return {id,md5:'abcdef0123456789abcdef0123456789',image_width:400,image_height:520,file_ext:'jpg',file_size:1024,
 file_url:`https://cdn.donmai.us/original/${id}.jpg`,large_file_url:`https://cdn.donmai.us/sample/${id}.jpg`,
 preview_url:`https://cdn.donmai.us/preview/${id}.jpg?palette=${i}`,tag_string:'landscape character original',rating:'s',score:100-i,created_at:'2026-10-20T10:00:00Z'};
}
async function run(width,height,shot,full){
 const browser=await chromium.launch({args:['--no-sandbox']});
 const mobile=width<760;const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce',isMobile:mobile,hasTouch:mobile});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(req.resourceType()==='image'){
   const text=u.pathname+u.search,num=[...text].reduce((a,c)=>a+c.charCodeAt(0),0),pair=palette[num%palette.length];
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${pair[0]}"/><stop offset="1" stop-color="${pair[1]}"/></linearGradient></defs><rect width="400" height="520" fill="url(#g)"/><circle cx="${90+num%220}" cy="160" r="88" fill="#ffffff22"/><path d="M0 420 Q110 320 210 400 T400 350 V520 H0Z" fill="#00000022"/></svg>`;
   return route.fulfill({contentType:'image/svg+xml',body:svg});
  }
  if(u.hostname==='127.0.0.1'&&u.pathname!=='/api/proxy')return route.continue();
  if(u.pathname==='/api/proxy'){
   const target=new URL(u.searchParams.get('u')),path=target.pathname;
   let scope=1;if(path.includes('hot'))scope=2;else if(path.includes('viewed'))scope=3;else if(path.includes('popular'))scope=4;
   if(path.includes('counts/posts.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify({counts:{posts:12}})});
   if(/\/explore\/posts\/(?:popular|viewed)\.json|\/posts\.json/.test(path))return route.fulfill({contentType:'application/json',body:JSON.stringify(Array.from({length:12},(_,i)=>mockPost(i,scope)))});
   return route.fulfill({contentType:'application/json',body:'[]'});
  }
  return route.abort();
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.PB_APP_READY===true);
 await page.evaluate(()=>{cancelExplore();EX_DATA.clear();EX_FEEDS.clear();EX_SRC='';S.screen='profile';S.bt='Explore';S.src='danbooru';render()});
 await page.waitForFunction(()=>document.querySelectorAll('.glint-explore .ex-section').length===3&&document.querySelectorAll('.glint-explore .ex-strip .ex-cell').length>=12,{},{timeout:15000});
 await page.waitForTimeout(500);
 const result=await page.evaluate(()=>{
  const strip=document.querySelector('.ex-strip'),cell=document.querySelector('.ex-cell'),intro=document.querySelector('.glint-top .glint-brand'),more=document.querySelector('.ex-more');
  const cellRect=cell.getBoundingClientRect(),art=cell.querySelector('.art').getBoundingClientRect();
  return {intro:intro?.textContent,sections:document.querySelectorAll('.glint-explore .ex-section').length,cells:document.querySelectorAll('.ex-cell').length,
   headerActions:document.querySelectorAll('.glint-header-actions button').length,topBarVisible:getComputedStyle(document.querySelector('.glint-top')).display!=='none',headline:intro?.textContent,hero:!!document.querySelector('.glint-ex-intro'),footer:!!document.querySelector('.glint-ex-footer'),eyebrow:!!document.querySelector('.ex-head .glint-ex-eyebrow'),sourceButton:!!document.querySelector('.glint-ex-source'),
   cell:[Math.round(cellRect.width),Math.round(art.height)],scales:document.querySelectorAll('.ex-scale').length,
   moreStyle:{minHeight:getComputedStyle(more).minHeight,padding:getComputedStyle(more).padding,border:getComputedStyle(more).borderRadius},
   stripOverflow:strip.scrollWidth>strip.clientWidth,titleSize:getComputedStyle(document.querySelector('.ex-head h2')).fontSize,motionSections:document.querySelectorAll('.glint-explore .ex-section.ex-motion-in').length,
   navActive:document.getElementById('nav')?.dataset.active,homeCurrent:document.querySelector('#nav [data-v="home"]')?.getAttribute('aria-current'),savedCurrent:document.querySelector('#nav [data-v="profile"]')?.getAttribute('aria-current'),feedSource:document.querySelector('.glint-feed-source')?.textContent||null,sectionTop:Math.round(document.querySelector('.ex-section').getBoundingClientRect().top),headingTop:Math.round(document.querySelector('.ex-head h2').getBoundingClientRect().top),wrapMinHeight:getComputedStyle(document.querySelector('.tabwrap')).minHeight,appBottomPadding:getComputedStyle(document.querySelector('#app')).paddingBottom,docOverflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 if(result.headerActions!==0||!result.topBarVisible||result.headline!=='Explore')throw Error('Explore headline or header is wrong');
 if(result.sections!==3||result.cells<12||result.hero||result.footer||result.eyebrow||result.sourceButton||result.titleSize!=='16px'||result.motionSections<1||result.navActive!=='home'||result.homeCurrent!=='page'||result.savedCurrent!==null||result.feedSource!==null||result.wrapMinHeight!=='0px'||parseFloat(result.appBottomPadding)>0||!result.stripOverflow||result.docOverflow||result.sectionTop>100||result.headingTop<40||result.headingTop>110)throw Error(JSON.stringify(result));
 const preserved=await page.evaluate(async()=>{const strip=document.querySelector('.ex-strip');strip.scrollLeft=220;window.__old=strip;const before=strip.scrollLeft;refreshExplore();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const fresh=document.querySelector('.ex-strip');return {same:fresh===window.__old,before,after:fresh.scrollLeft}});
 if(!preserved.same||Math.abs(preserved.before-preserved.after)>2)throw Error('Carousel state lost '+JSON.stringify(preserved));
 await page.screenshot({path:shot});if(full)await page.screenshot({path:full,fullPage:true});
 const pinned=await page.evaluate(async()=>{window.scrollTo(0,250);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const h=document.querySelector('.glint-top');return {top:Math.round(h.getBoundingClientRect().top),brand:h.querySelector('.glint-brand')?.textContent.trim(),gradient:getComputedStyle(h).backgroundImage.includes('linear-gradient')}});
 if(pinned.top!==0||pinned.brand!=='Explore'||!pinned.gradient)throw Error('Explore title not pinned with gradient '+JSON.stringify(pinned));
 await page.evaluate(()=>window.scrollTo(0,0));
 let interactions=null;
 if(width===390){
  await page.locator('.ex-scale[data-id="week"]').first().click();
  await page.waitForFunction(()=>document.querySelector('.ex-section[data-ex="popular"]')?.dataset.exScale==='week');
  const weekPressed=await page.locator('.ex-section[data-ex="popular"] .ex-scale[data-id="week"]').getAttribute('aria-pressed');
  if(weekPressed!=='true')throw Error('Week scale did not become selected');
  await page.locator('.ex-more').first().click();
  await page.waitForSelector('.ex-feed-page #exfeed .grid [data-id]',{timeout:10000});
  interactions={heroRemoved:true,week:true,viewAll:true};
  await page.locator('#exfeed').evaluate(el=>{const spacer=document.createElement('div');spacer.style.height='1200px';spacer.setAttribute('aria-hidden','true');el.append(spacer);el.closest('#sheet').scrollTop=320});
  await page.waitForFunction(()=>document.querySelector('#sheet').scrollTop>200);
  const cdp=await ctx.newCDPSession(page),touch=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[{id:1,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]:[]});
  await touch('touchStart',{x:20,y:350});for(let i=1;i<=6;i++){await touch('touchMove',{x:20,y:350+160*i/6});await page.waitForTimeout(12)}await touch('touchEnd',null);
  await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));
 }
 await page.locator('#nav [data-v="profile"]').click();
 await page.waitForFunction(()=>S.screen==='profile'&&S.bt==='Bookmarks'&&document.querySelector('.tabpane[data-tab="Bookmarks"]'));
 if(await page.locator('#nav [data-v="profile"][aria-current="page"]').count()!==1)throw Error('Saved navigation is not selected after opening Bookmarks');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(`PASS ${width}px ${JSON.stringify(result)} carousel=${JSON.stringify(preserved)} interactions=${JSON.stringify(interactions)}`);
 await browser.close();
}
(async()=>{await run(360,780,'/home/user/work/explore-360.png');await run(390,844,'/home/user/work/explore-mobile.png','/home/user/work/explore-mobile-full.png');await run(1280,900,'/home/user/work/explore-desktop.png','/home/user/work/explore-desktop-full.png')})().catch(e=>{console.error(e);process.exit(1)});
