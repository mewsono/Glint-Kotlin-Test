// Run with NODE_PATH=/home/user/.tools/browser/node_modules node tests/post-details.browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const hero='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1600"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#99c8db"/><stop offset="1" stop-color="#d0b48d"/></linearGradient></defs><rect width="600" height="1600" fill="url(#sky)"/><circle cx="405" cy="560" r="122" fill="#f3d69b"/><path d="M0 1400V1020L180 790 480 1180 600 1000V1600H0" fill="#34697a"/><path d="M0 1600V1280L170 1070 400 1400 600 1190V1600" fill="#173d4c"/></svg>';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=','base64');
const post={id:101,md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:1600,tag_string:'hatsune_miku vocaloid sakimichan blue_sky',tag_string_character:'hatsune_miku',tag_string_copyright:'vocaloid',tag_string_artist:'sakimichan',large_file_url:'https://cdn.donmai.us/sample/test.png',file_url:'https://cdn.donmai.us/original/test.png',rating:'g'};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const viewport of [{width:360,height:804},{width:390,height:844},{width:1200,height:900}]){
   const mobile=viewport.width<600;
   const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block',acceptDownloads:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shared=data}});});
   await page.route('**/*',async route=>{
    if(route.request().resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:hero});
    const u=new URL(route.request().url());
    if(u.pathname==='/api/proxy'){
     const target=new URL(u.searchParams.get('u'));
     if(target.hostname==='cdn.donmai.us')return route.fulfill({status:200,contentType:'image/png',body:png});
     const body=target.pathname==='/posts/101.json'?post:target.pathname==='/posts.json'?[post]:[];
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    }
    return u.hostname==='127.0.0.1'?route.continue():route.abort();
   });
   await page.goto('http://127.0.0.1:8000/');
   await page.waitForSelector('.grid [data-id="danbooru:101"]');
   const press=selector=>mobile?page.locator(selector).first().tap():page.locator(selector).first().click();
   await press('.grid [data-id="danbooru:101"]');
   await page.waitForFunction(()=>document.querySelector('.post-image')?.complete);
   assert.equal(await page.locator('.post-bottom>section').count(),2);
   assert.equal(await page.locator('.post-info-row').count(),3);
   assert.deepEqual(await page.locator('.post-info-row dt').allTextContents(),['Character','Series','Artist']);
   assert.deepEqual(await page.locator('.post-info-row dd').allTextContents(),['Hatsune Miku','Vocaloid','Sakimichan']);
   assert.deepEqual(await page.locator('.post-actions button').evaluateAll(buttons=>buttons.map(b=>b.dataset.a)),['bookmark','download','share']);
   assert.equal(await page.locator('.post-detail .sv').count(),0);
   const geometry=await page.evaluate(()=>{const s=document.querySelector('#sheet').getBoundingClientRect(),v=document.querySelector('.post-visual').getBoundingClientRect(),b=document.querySelector('.post-bottom').getBoundingClientRect(),el=document.querySelector('.post-image'),i=el.getBoundingClientRect(),style=getComputedStyle(el);return {sheetX:s.x,sheetWidth:s.width,imageX:i.x,imageWidth:i.width,imageHeight:i.height,maxHeight:v.height,fit:style.objectFit,radius:style.borderRadius,dockBottom:b.bottom,sheetBottom:s.bottom,visualBottom:v.bottom,dockTop:b.top,imageCenter:i.y+i.height/2,visualCenter:v.y+v.height/2}});
   assert.ok(Math.abs(geometry.sheetX-geometry.imageX)<1);
   assert.ok(Math.abs(geometry.sheetWidth-geometry.imageWidth)<1);
   assert.ok(geometry.imageHeight<=geometry.maxHeight+1);
   assert.equal(geometry.fit,'cover');assert.equal(geometry.radius,'0px');
   assert.ok(Math.abs(geometry.dockBottom-geometry.sheetBottom)<1,'Both sections must stay at the bottom');
   assert.ok(Math.abs(geometry.visualBottom-geometry.dockTop)<1,'Image area must end above the dock');
   assert.ok(Math.abs(geometry.imageCenter-geometry.visualCenter)<1,'Image must be vertically centered');
   const compact=await page.evaluate(()=>{
    const info=document.querySelector('.post-info').getBoundingClientRect(),actions=document.querySelector('.post-actions').getBoundingClientRect();
    return {height:info.height+actions.height,rows:[...document.querySelectorAll('.post-info-row')].map(el=>el.getBoundingClientRect().height),labels:[...document.querySelectorAll('.post-info-row dt')].map(el=>({width:el.getBoundingClientRect().width,clip:getComputedStyle(el).clipPath})),buttonWidth:document.querySelector('.post-action').getBoundingClientRect().width};
   });
   assert.ok(compact.height<=132,`Metadata and icons should be compact, got ${compact.height}px`);
   assert.ok(compact.rows.every(height=>height<=25));
   assert.ok(compact.labels.every(label=>label.width<=1&&label.clip==='inset(50%)'));
   assert.equal(compact.buttonWidth,44);

   // Without source credentials there is NO local-only heart. Bookmarks
   // remain universal and are tested independently below.
   assert.equal(await page.locator('.post-actions [data-a="like"]').count(),0);
   assert.deepEqual(await page.evaluate(()=>S.likes),[]);
   // Bookmark is a one-tap save, without a collection picker or navigation.
   const bookmarkHistory=await page.evaluate(()=>history.length);
   await press('.post-actions [data-a="bookmark"]');
   assert.equal(await page.locator('.post-detail').count(),1);assert.equal(await page.locator('#sheet [data-a="addto"]').count(),0);
   assert.equal(await page.evaluate(()=>history.length),bookmarkHistory);
   assert.equal(await page.evaluate(()=>S.bookmarks.filter(r=>r.id==='danbooru:101').length),1);
   assert.equal(await page.locator('.post-actions [data-a="bookmark"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>!!S.pinCache['danbooru:101']),true);
   // Download produces a real original-image file, not a navigation to the image.
   const downloadPromise=page.waitForEvent('download');await press('.post-actions [data-a="download"]');
   const download=await downloadPromise;assert.equal(download.suggestedFilename(),'pinboard-danbooru-101.png');
   const filepath=await download.path();assert.equal(fs.readFileSync(filepath).length,png.length);
   // Native share receives the canonical post URL. Fallback really copies it.
   await press('.post-actions [data-a="share"]');
   assert.equal(await page.evaluate(()=>window.__shared.url),'https://danbooru.donmai.us/posts/101');
   await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}})});
   await press('.post-actions [data-a="share"]');
   assert.equal(await page.evaluate(()=>window.__copied),'https://danbooru.donmai.us/posts/101');
   // Only available metadata gets a row. No false 'Artist' from an uploader.
   await page.evaluate(()=>{const p=pin('danbooru:101');p.characters=[];p.series=[];p.artists=['artist_only'];p.detailsReady=true;detail(p.id)});
   assert.equal(await page.locator('.post-info-row').count(),1);
   assert.equal(await page.locator('.post-info-row dt').innerText(),'Artist');
   await page.evaluate(()=>{const p=pin('danbooru:101');p.artists=[];p.detailsReady=true;detail(p.id)});
   assert.equal(await page.locator('.post-info-row').count(),0);
   assert.equal(await page.locator('.post-info').isVisible(),false);
   // Cached old pins get missing categorized metadata on opening the details.
   await page.evaluate(()=>{const p=pin('danbooru:101');delete p.characters;delete p.series;delete p.artists;p.detailsReady=false;detail(p.id)});
   await page.waitForFunction(()=>document.querySelectorAll('.post-info-row').length===3);
   if(viewport.width===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/post-details-mobile.png'});}
   // Landscape and portrait posts must center in the remaining area without
   // pushing the fixed information/actions off screen, even after scrolling.
   for(const size of [{w:1200,h:500},{w:600,h:1800},{w:800,h:800}]){
    await page.evaluate(async({w,h})=>{const img=document.querySelector('.post-image');img.width=w;img.height=h;img.src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#427b89"/></svg>`);await img.decode();document.querySelector('#sheet').scrollTop=100},size);
    const layout=await page.evaluate(()=>{const s=document.querySelector('#sheet').getBoundingClientRect(),v=document.querySelector('.post-visual').getBoundingClientRect(),b=document.querySelector('.post-bottom').getBoundingClientRect(),i=document.querySelector('.post-image').getBoundingClientRect();return {bottom:Math.abs(s.bottom-b.bottom),centerY:Math.abs((v.y+v.height/2)-(i.y+i.height/2)),centerX:Math.abs((v.x+v.width/2)-(i.x+i.width/2)),overlap:i.bottom>b.top+.5,scroll:document.querySelector('#sheet').scrollTop}});
    assert.ok(layout.bottom<1&&layout.centerY<1&&layout.centerX<1&&!layout.overlap);
    assert.equal(layout.scroll,0);
   }

   assert.deepEqual(errors,[]);
   console.log(`PASS ${viewport.width}px: centered image; three stacked names and icons pinned to bottom; credential-free bookmark/download/share work; no local-only heart; old cached metadata refreshes.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
