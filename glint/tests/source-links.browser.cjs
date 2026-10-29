// NODE_PATH=/home/user/.tools/browser/node_modules node tests/source-links.browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const base={md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:900,file_size:1400000,file_ext:'png',tag_string:'sakura_miko hololive thomas_8000',tag_string_character:'sakura_miko',tag_string_copyright:'hololive',tag_string_artist:'thomas_8000',large_file_url:'https://cdn.donmai.us/sample/test.png',file_url:'https://cdn.donmai.us/original/test.png',rating:'g'};
const posts=[{...base,id:701,source:'https://i.pximg.net/img-original/img/2026/10/23/00/00/00/123456789_p0.jpg'},{...base,id:702,source:'https://x.com/example_artist/status/123456789'},{...base,id:703,source:''},{...base,id:704,source:'https://www.pixiv.net/artworks/123456789\nhttps://x.com/example_artist/status/123456789\nhttps://www.artstation.com/artwork/example\nhttps://artist.tumblr.com/post/123'}];
const image='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#2e4f5c"/><circle cx="300" cy="400" r="180" fill="#ddbda2"/></svg>';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const width of [360,390,1200]){
   const mobile=width<600,context=await browser.newContext({viewport:{width,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];let detailRequests=0;page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>localStorage.setItem('pb-swipe-hint-v22','1'));
   await context.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url());
    if(request.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:image});
    if(['www.pixiv.net','x.com'].includes(u.hostname)&&request.resourceType()==='document')return route.fulfill({status:200,contentType:'text/html',body:'<title>Mock original source</title>Original source'});
    if(u.pathname==='/api/proxy'){
     const target=new URL(u.searchParams.get('u')),match=target.pathname.match(/^\/posts\/(\d+)\.json$/);
     if(match){detailRequests++;await new Promise(r=>setTimeout(r,130))}
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(match?posts.find(p=>String(p.id)===match[1]):target.pathname==='/posts.json'?posts:[])});
    }
    return u.hostname==='127.0.0.1'?route.continue():route.abort();
   });
   const press=selector=>mobile?page.locator(selector).first().tap():page.locator(selector).first().click();
   const waitPost=()=>page.waitForFunction(()=>document.querySelector('.post-detail')&&history.state?.__pinboardPostView?.kind==='post');
   await page.goto('http://127.0.0.1:8000/');await page.waitForSelector('.grid [data-id="danbooru:701"]');
   await press('.grid [data-id="danbooru:701"]');await waitPost();
   assert.deepEqual(await page.locator('.post-info-row dd').allTextContents(),['Sakura Miko','Hololive','Thomas 8000']);
   const link=page.locator('.post-source-link[data-platform="pixiv"]');
   assert.equal(await link.count(),1);assert.equal(await link.getAttribute('href'),'https://www.pixiv.net/artworks/123456789');
   assert.match(await link.getAttribute('aria-label'),/original source.*Pixiv/);assert.equal(await link.locator('svg path').count(),1);
   const geometry=await page.evaluate(()=>{const info=document.querySelector('.post-info').getBoundingClientRect(),names=document.querySelector('.post-info dl').getBoundingClientRect(),source=document.querySelector('.post-source-link').getBoundingClientRect(),bottom=document.querySelector('.post-bottom').getBoundingClientRect(),sheet=document.getElementById('sheet').getBoundingClientRect();return {inside:source.right<=info.right+.5&&names.right<=source.left+.5,target:source.width>=44&&source.height>=44,bottom:Math.abs(bottom.bottom-sheet.bottom),center:Math.abs((names.top+names.height/2)-(source.top+source.height/2))}});
   assert.ok(geometry.inside&&geometry.target&&geometry.bottom<1&&geometry.center<1);
   if(width===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/post-source-mobile.png'})}
   const popupPromise=context.waitForEvent('page');await press('.post-source-link');const popup=await popupPromise;
   await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),'https://www.pixiv.net/artworks/123456789');
   assert.equal(await popup.evaluate(()=>window.opener),null);assert.equal(await popup.evaluate(()=>document.referrer),'');await popup.close();
   assert.equal(await page.evaluate(()=>postView().kind),'post');
   await press('.post-topbar [data-a="menu"]');assert.equal(await page.locator('.post-tags-sheet .sx,.post-tags-sheet [data-a="close"]').count(),0);
   assert.equal(await page.locator('.post-tags-heading [data-a="postback"]').count(),1);
   assert.deepEqual(await page.locator('.post-more-sections>.post-more-section').evaluateAll(ns=>ns.map(n=>n.dataset.section)),['file','tags']);
   await page.goBack();await waitPost();await page.goForward();await page.waitForSelector('.post-tags-sheet');
   assert.equal(await page.locator('#sheet .sx').count(),0);await press('.post-tags-heading [data-a="postback"]');await waitPost();
   // Bookmarks are now an in-place toggle, not an unrelated picker dialog.
   await press('.post-actions [data-a="bookmark"]');assert.equal(await page.locator('.post-detail').count(),1);
   assert.equal(await page.locator('.post-actions [data-a="bookmark"]').getAttribute('aria-pressed'),'true');
   // Only Post info loses its X; unrelated dialogs such as Settings keep it.
   await page.evaluate(()=>settings());assert.equal(await page.locator('#sheet .sx').count(),1);
   await press('#sheet .sx');await waitPost();
   // Old pins whose category + file metadata is already ready still upgrade.
   const previous=detailRequests;
   await page.evaluate(()=>{const p=pin('danbooru:701');delete p.sourceLinks;delete p.sourceInfoReady;p.detailsReady=true;p.fileInfoReady=true;detail(p.id);window.__originalImage=document.querySelector('.post-image')});
   await page.waitForSelector('.post-source-link[data-platform="pixiv"]');assert.equal(detailRequests,previous+1);
   assert.equal(await page.evaluate(()=>document.querySelector('.post-image')===window.__originalImage),true);
   await page.evaluate(()=>detail('danbooru:702'));assert.equal(await page.locator('.post-source-link[data-platform="x"]').count(),1);
   assert.equal(await page.locator('.post-source-link').getAttribute('href'),'https://x.com/example_artist/status/123456789');
   await page.evaluate(()=>detail('danbooru:703'));assert.equal(await page.locator('.post-source-link').count(),0);
   await page.evaluate(()=>detail('danbooru:704'));assert.deepEqual(await page.locator('.post-source-link').evaluateAll(ns=>ns.map(n=>n.dataset.platform)),['pixiv','x','artstation']);
   assert.ok(await page.locator('.post-info').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   await press('.post-media');await page.waitForSelector('.image-viewer');assert.equal(await page.locator('#sheet .post-source-link,#sheet button').count(),0);
   await page.goBack();await waitPost();assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: source icons beside bottom-docked names, secure original links, Pixiv/X/unknown + multiple sources, cache upgrade; … panel has no X, Back works, unrelated close buttons and image-only fullscreen preserved.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
