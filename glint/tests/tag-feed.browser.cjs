// NODE_PATH=/home/user/.tools/browser/node_modules node tests/tag-feed.browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const post=(id,character='sakura_miko',artist='thomas_8000',series='hololive')=>({id,md5:id.toString(16).padStart(32,'0'),image_width:600,image_height:[800,1000,680][id%3],file_size:1400000,file_ext:'png',tag_string:`${character} ${artist} ${series} blue_sky`,tag_string_character:character,tag_string_artist:artist,tag_string_copyright:series,large_file_url:`https://cdn.donmai.us/sample/${id}.png`,file_url:`https://cdn.donmai.us/original/${id}.png`,rating:'g',source:'https://www.pixiv.net/artworks/123456789'});
const parent=post(901,'sakura_miko hoshimachi_suisei'),pool=[parent,...Array.from({length:101},(_,i)=>post(1100+i)),post(9999)];
const alternate=Array.from({length:8},(_,i)=>post(1400+i,'hoshimachi_suisei','other_artist','other_series'));
const all=[...pool,...alternate],match=(p,tag)=>p.tag_string.split(' ').includes(tag);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const mode of [{w:390,h:844,mobile:true},{w:395,h:844,mobile:true},{w:360,h:804,mobile:true,legacy:true},{w:1200,h:900,mobile:false}]){
   const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mode.mobile,hasTouch:mode.mobile,serviceWorkers:'block'}),page=await context.newPage();
   const errors=[],requests=[];let failures=0,slowOldest=false;page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({legacy})=>{localStorage.setItem('pb-auth',JSON.stringify({danbooru:{login:'tester',apiKey:'test-key'}}));localStorage.setItem('pb2',JSON.stringify({hidden:['danbooru:9999']}));localStorage.setItem('pb-swipe-hint-v22','1');if(legacy)window.PointerEvent=undefined;Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Preview','NotAllowedError'))},mode);
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(route.request().resourceType()==='image'){
     const id=parseInt(u.pathname.split('/').pop())||42,h=id*13%360;
     return route.fulfill({status:200,contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="hsl(${h} 35% 32%)"/><circle cx="390" cy="230" r="140" fill="hsl(${(h+70)%360} 50% 75%)"/><path d="M0 800V600L220 390 600 800" fill="hsl(${h} 40% 20%)"/></svg>`});
    }
    if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
    const target=new URL(u.searchParams.get('u')),tags=target.searchParams.get('tags')||'',tag=tags.split(' ').find(t=>!t.includes(':'))||'',cursor=target.searchParams.get('page')||'1',limit=+(target.searchParams.get('limit')||40),oldest=tags.includes('order:id_asc');requests.push(target);
    let body=[];
    if(target.pathname.includes('/counts/'))body={counts:{posts:tags.startsWith('fav:')?103:all.filter(p=>match(p,tag)).length}};
    else if(target.pathname==='/posts.json'){
     if(tags.startsWith('ordfav:'))body=pool.slice(0,limit);
     else if(!tag)body=[parent];
     else{
      if(limit===40&&failures){failures--;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"temporary fixture failure"}'})}
      if(oldest&&slowOldest)await new Promise(r=>setTimeout(r,240));
      let posts=all.filter(p=>match(p,tag)).sort((a,b)=>oldest?a.id-b.id:b.id-a.id);
      if(cursor.startsWith('a'))posts=posts.filter(p=>p.id>+cursor.slice(1));
      else if(cursor.startsWith('b'))posts=posts.filter(p=>p.id<+cursor.slice(1));
      else posts=posts.slice((+cursor-1)*limit);
      body=posts.slice(0,limit);if(oldest&&cursor.startsWith('a'))body.reverse();
     }
    }else if(/^\/posts\/\d+\.json$/.test(target.pathname))body=all.find(p=>String(p.id)===target.pathname.match(/\d+/)[0]);
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   const press=selector=>page.locator(selector).first()[mode.mobile?'tap':'click']();
   const current=()=>page.evaluate(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f&&{pins:f.pins.map(p=>p.id),order:f.order,done:f.done,page:f.page,busy:f.busy,err:f.err,total:f.total}});
   const waitFeed=()=>page.waitForFunction(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return postView()?.kind==='tagfeed'&&f&&f.loaded&&!f.busy});
   // The tag-feed control now offers Newest <-> Popular only. Chronological
   // (Oldest) ordering is still fully supported by the feed, so these preserved
   // cursor/retry assertions select it through the same applyTagFeedOrder path
   // the control uses, instead of a chip that no longer exists.
   const setOrder=async order=>{await page.evaluate(o=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);applyTagFeedOrder(f,o);loadTagFeed(f,true)},order);await waitFeed()};
   const advance=async()=>{
    const before=await current();await page.locator('#sheet').evaluate(e=>{e.scrollTop=e.scrollHeight});
    await page.waitForFunction(before=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f&&!f.busy&&(f.page>before.page||f.err&&f.err!==before.err)},before);
   };
   const metric=async selector=>page.locator(selector).first().evaluate(e=>{const s=getComputedStyle(e);return {font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,spacing:s.letterSpacing,color:s.color,bg:s.backgroundColor,radius:s.borderRadius,gap:s.gap}});
   await page.goto(BASE+'/?screen=profile&tab=likes');
   await page.waitForFunction(()=>favState(S.src).pins.length===40&&!favState(S.src).busy);
   const type=await metric('.prow .tabs [data-v="Likes"]'),sort=await metric('.likes-sort'),countType=await metric('.likes-head .exhead b'),grid=await metric('.tabpane[data-tab="Likes"] .grid'),art=await metric('.tabpane[data-tab="Likes"] .art');
   const likeWidth=await page.locator('#app').evaluate(e=>e.clientWidth);
   // Matching feeds must work without connecting a Likes account.
   await page.evaluate(parent=>{pbSetAuth('danbooru',null);S.screen='home';render();S.live.danbooru=[normPin(PB_SOURCES.danbooru.map(parent,PB_SOURCES.danbooru),'danbooru')];render();detail('danbooru:901');blankPostPage('danbooru:901')},parent);
   await page.waitForSelector('[data-related-key="character-0"] .related-more:not(:disabled)');
   const previewIDs=await page.locator('[data-related-key="character-0"] .related-card').evaluateAll(nodes=>nodes.map(n=>+n.dataset.id.split(':')[1]));
   assert.deepEqual(previewIDs,[1200,1199,1198,1197,1196]);
   assert.ok(requests.filter(u=>u.pathname==='/posts.json'&&+u.searchParams.get('limit')===24).every(u=>!/(?:^|\s)(?:order|sort):/.test(u.searchParams.get('tags'))));
   const before=await page.evaluate(()=>history.length);await press('[data-related-key="character-0"] .related-more');await waitFeed();
   assert.equal(await page.evaluate(()=>history.length),before+1);assert.equal(await page.locator('.tag-feed-title').innerText(),'Sakura Miko');
   assert.equal(await page.locator('.tag-feed-page').evaluate(e=>e.clientWidth),likeWidth);
   const headingBox=await page.locator('.tag-feed-title').boundingBox(),backBox=await page.locator('.tag-feed-back').boundingBox();
   assert.ok(headingBox.width>250&&headingBox.height<75&&headingBox.x>=backBox.x+backBox.width,'headline must be beside Back, not in the narrow gear column');
   const title=await metric('.tag-feed-title');for(const field of ['font','size','weight','spacing','color'])assert.equal(title[field],type[field],`headline ${field}`);
   assert.deepEqual(await metric('.tag-feed-page .likes-sort'),sort);assert.deepEqual(await metric('.tag-feed-page .likes-head .exhead b'),countType);
   assert.deepEqual(await metric('.tag-feed-page .grid'),grid);assert.deepEqual(await metric('.tag-feed-page .art'),art);
   assert.equal(await page.locator('.tag-feed-page .cap').count(),0);assert.equal(await page.locator('#nav').isVisible(),false);
   assert.match(await page.locator('.tag-feed-page .likes-head').innerText(),/103 posts/);
   assert.equal((await current()).pins[0],'danbooru:1200');assert.ok(!(await current()).pins.includes('danbooru:9999'));
   assert.ok(await page.locator('.tag-feed-page [data-a="relatedopen"]').evaluateAll(ns=>ns.every(n=>pin(n.dataset.id).characters.includes('sakura_miko'))));
   assert.equal(await page.locator('#sheet').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
   if(mode.w===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/tag-feed-mobile.png',fullPage:false})}
   // Exact reported heading: it uses the whole row, not the profile gear slot.
   await page.evaluate(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);window.__originalTag=f.tag;f.tag='constellation_(azur_lane)';renderTagFeed(f)});
   assert.equal(await page.locator('.tag-feed-title').innerText(),'Constellation (Azur Lane)');
   const geometry=await page.locator('.tag-feed-title').evaluate(title=>{const rect=title.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(title);return {width:rect.width,height:rect.height,lines:range.getClientRects().length,header:title.closest('header').getBoundingClientRect().height,firstImage:document.querySelector('.tag-feed-page .grid').getBoundingClientRect().top}});
   assert.ok(geometry.width>250&&geometry.height<55&&geometry.header<80&&geometry.firstImage<160,JSON.stringify(geometry));
   if(mode.w===395)await page.screenshot({path:'/home/user/.cache/pinboard/constellation-headline-v44.png',fullPage:false});
   await page.evaluate(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);f.tag=window.__originalTag;renderTagFeed(f)});
   // Native vertical scrolling remains available; it is not the post swipe handler.
   if(mode.mobile){
    const cdp=await context.newCDPSession(page),x=mode.w/2,y=mode.h*.72;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
    for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x,y:y-35*i}]});await page.waitForTimeout(12)}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{await page.mouse.move(mode.w/2,mode.h/2);await page.mouse.wheel(0,350)}
   await page.waitForTimeout(250);assert.ok(await page.locator('#sheet').evaluate(e=>e.scrollTop>20));assert.equal(await page.evaluate(()=>postView().kind),'tagfeed');
   await page.locator('#sheet').evaluate(e=>{e.scrollTop=0});
   // True server-side oldest ordering and cursor pagination of the full tag.
   await setOrder('oldest');assert.equal((await current()).order,'oldest');assert.equal((await current()).pins[0],'danbooru:901');
   await advance();assert.equal((await current()).pins.length,80);
   const last=()=>requests.filter(u=>u.pathname==='/posts.json'&&+u.searchParams.get('limit')===40).at(-1);
   assert.equal(last().searchParams.get('page'),'a1138');assert.ok(last().searchParams.get('tags').includes('order:id_asc'));
   await advance();
   let state=await current();assert.equal(state.done,true);assert.equal(state.pins.length,102);assert.equal(new Set(state.pins).size,102);
   assert.equal(await page.locator('.tag-feed-page [data-a="tagfeedmore"]').count(),0);
   await page.locator('#sheet').evaluate(s=>{s.scrollTop=0});await setOrder('newest');
   // Retry preserves the loaded cards and does not skip the failed cursor.
   failures=1;await advance();assert.ok((await current()).err);
   const prior=(await current()).pins.length,failedCursor=last().searchParams.get('page');
   await press('.tag-feed-error [data-a="tagfeedmore"]');await waitFeed();assert.ok((await current()).pins.length>prior);assert.equal(last().searchParams.get('page'),failedCursor);
   assert.equal(last().hostname,'danbooru.donmai.us');
   // Open / bookmark / full-screen / Back keep the full feed and its scroll.
   const child=page.locator('.tag-feed-page [data-a="relatedopen"]').nth(7);await child.scrollIntoViewIfNeeded();
   const childId=await child.getAttribute('data-id'),scroll=await page.locator('#sheet').evaluate(e=>e.scrollTop),loaded=(await current()).pins.length,requestCount=requests.length;
   await child[mode.mobile?'tap':'click']();await page.waitForSelector('.post-detail');assert.equal(await page.evaluate(()=>postView().id),childId);
   assert.equal(await page.locator('.post-actions .post-action').count(),3);assert.equal(await page.locator('.post-actions [data-a="like"]').count(),0);await press('.post-actions [data-a="bookmark"]');assert.equal(await page.locator('.post-actions [data-a="bookmark"]').getAttribute('aria-pressed'),'true');
   await press('.post-media');await page.waitForSelector('.image-viewer');assert.equal(await page.locator('.image-viewer button').count(),0);
   await page.goBack();await page.waitForSelector('.post-detail');await page.goBack();await waitFeed();
   assert.equal((await current()).pins.length,loaded);assert.ok(Math.abs(await page.locator('#sheet').evaluate(e=>e.scrollTop)-scroll)<3);
   assert.equal(await page.locator(`.tag-feed-page [data-id="${childId}"] .hrt`).count(),0);assert.equal(await page.evaluate(id=>S.bookmarks.some(r=>r.id===id),childId),true);
   // Detail metadata may request once; returning to the feed never restarts its query.
   assert.equal(requests.slice(requestCount).filter(u=>u.pathname==='/posts.json').length,0);
   // Quick sort taps ignore an older response instead of replacing the new order.
   await page.locator('#sheet').evaluate(e=>{e.scrollTop=0});slowOldest=true;
   await page.evaluate(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);applyTagFeedOrder(f,'oldest');loadTagFeed(f,true)});
   await page.evaluate(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);applyTagFeedOrder(f,'newest');loadTagFeed(f,true)});
   await waitFeed();await page.waitForTimeout(300);
   assert.equal((await current()).order,'newest');assert.equal((await current()).pins[0],'danbooru:1200');slowOldest=false;
   // Native Back and Forward restore the named feed, not an inline expansion.
   await press('.tag-feed-back');await page.waitForSelector('.related-sections');assert.equal(await page.locator('[data-related-key="character-0"] .related-card').count(),5);
   await page.goForward();await waitFeed();assert.equal(await page.locator('.tag-feed-title').innerText(),'Sakura Miko');
   // A full reload can rebuild this history entry from its non-secret descriptor.
   await page.reload();await waitFeed();assert.equal(await page.locator('.tag-feed-title').innerText(),'Sakura Miko');assert.equal((await current()).order,'newest');
   await setOrder('oldest');await page.reload();await waitFeed();assert.equal((await current()).order,'oldest');assert.equal((await current()).pins[0],'danbooru:901');
   await press('.tag-feed-back');await page.waitForSelector('.related-sections');assert.equal(await page.evaluate(()=>postView().id),'danbooru:901');
   // Reopening Load more must not inherit the prior visit's Oldest setting.
   await page.waitForSelector('[data-related-key="character-0"] .related-more:not(:disabled)');await press('[data-related-key="character-0"] .related-more');await waitFeed();
   assert.equal((await current()).order,'newest');assert.equal((await current()).page,1);assert.equal((await current()).pins[0],'danbooru:1200');
   assert.match(await page.locator('.tag-feed-page .likes-sort').innerText(),/Newest/);assert.equal(await page.locator('#sheet').evaluate(e=>e.scrollTop),0);
   await press('.tag-feed-back');await page.waitForSelector('.related-sections');
   await page.waitForSelector('[data-related-key="character-1"] .related-more:not(:disabled)');await press('[data-related-key="character-1"] .related-more');await waitFeed();assert.equal(await page.locator('.tag-feed-title').innerText(),'Hoshimachi Suisei');
   assert.ok(await page.locator('.tag-feed-page [data-a="relatedopen"]').evaluateAll(ns=>ns.every(n=>pin(n.dataset.id).characters.includes('hoshimachi_suisei'))));
   assert.deepEqual(errors,[]);
   console.log(`PASS ${mode.w}px${mode.legacy?' legacy touch':''}: compact full-width Constellation headline; newest previews and every fresh Load more visit, exact Likes UI, working oldest/newest cursor pagination, retry, sort races, actions/fullscreen, scroll/history/reload and separate characters.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
