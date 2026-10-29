// NODE_PATH=/home/user/.tools/browser/node_modules node tests/related-art.browser.cjs
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
function post(id,character,artist,series){return {id,md5:id.toString(16).padStart(32,'0'),image_width:600,image_height:900,file_size:1400000,file_ext:'png',tag_string:[character,artist,series,'blue_sky'].join(' '),tag_string_character:character,tag_string_artist:artist,tag_string_copyright:series,large_file_url:`https://cdn.donmai.us/sample/${id}.png`,file_url:`https://cdn.donmai.us/original/${id}.png`,rating:'g',source:'https://www.pixiv.net/artworks/123456789'}};
const parent=post(2000,'sakura_miko hoshimachi_suisei','thomas_8000','hololive');
const chars=Array.from({length:27},(_,i)=>post(1100+i,'sakura_miko','guest_artist','hololive'));
const artists=Array.from({length:9},(_,i)=>post(1200+i,'other_character','thomas_8000','other_series'));
const series=Array.from({length:10},(_,i)=>post(1300+i,'other_character','guest_artist','hololive'));
const alternate=Array.from({length:8},(_,i)=>post(1400+i,'hoshimachi_suisei','guest_artist','hololive'));
const wrong=post(9998,'unrelated_character','unrelated_artist','unrelated_series'),hidden=post(9999,'sakura_miko','guest_artist','hololive');
const all=[parent,...chars,...artists,...series,...alternate,wrong,hidden];
const charFirst=[parent,wrong,hidden,chars[26],chars[26],...chars.slice(7,26).reverse()];assert.equal(charFirst.length,24);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const mode of [{w:390,h:844,mobile:true},{w:360,h:804,mobile:true,legacy:true},{w:1200,h:900,mobile:false}]){
   const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mode.mobile,hasTouch:mode.mobile,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[],queries=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));let failSeries=true;
   await page.addInitScript(({legacy})=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({hidden:['danbooru:9999']}));if(legacy)window.PointerEvent=undefined;Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Preview','NotAllowedError'))},mode);
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(route.request().resourceType()==='image'){
     const color=(parseInt(u.pathname.split('/').pop(),16)||91)%360;
     return route.fulfill({status:200,contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="hsl(${color} 35% 32%)"/><circle cx="300" cy="340" r="170" fill="hsl(${(color+60)%360} 50% 75%)"/><path d="M0 900V690L230 490 600 900" fill="hsl(${color} 40% 20%)"/></svg>`});
    }
    if(u.pathname==='/api/proxy'){
     const target=new URL(u.searchParams.get('u')),tag=(target.searchParams.get('tags')||'').replace(/(?:^|\s)(?:order|sort):\S+/g,'').trim(),number=+(target.searchParams.get('page')||1);
     let body=[];
     const detail=target.pathname.match(/^\/posts\/(\d+)\.json$/);
     if(detail){await new Promise(r=>setTimeout(r,90));body=all.find(p=>String(p.id)===detail[1])||parent}
     else if(target.pathname==='/posts.json'){
      if(!tag)body=[parent];
      else{
       queries.push({tag,order:target.searchParams.get('tags').match(/order:\S+/)?.[0],page:number,host:target.hostname,limit:+target.searchParams.get('limit')});
       if(tag==='sakura_miko')body=number===1?charFirst:[chars[7],...chars.slice(0,7).reverse()];
       else if(tag==='thomas_8000')body=[parent,...artists];
       else if(tag==='hololive'){
        if(failSeries){failSeries=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"temporary test failure"}'})}
        body=[parent,...series];
       }else if(tag==='hoshimachi_suisei'){await new Promise(r=>setTimeout(r,220));body=[parent,...alternate]}
      }
     }
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    }
    return u.hostname==='127.0.0.1'?route.continue():route.abort();
   });
   const group=key=>page.locator(`[data-related-key="${key}"]`);
   const cards=key=>group(key).locator('.related-card');
   const press=selector=>mode.mobile?page.locator(selector).first().tap():page.locator(selector).first().click();
   const waitPost=()=>page.waitForFunction(()=>postView()?.kind==='post'&&document.querySelector('.post-detail'));
   const waitRelated=(n=4)=>page.waitForFunction(n=>postView()?.kind==='blank'&&document.querySelectorAll('.related-section').length===n,n);
   const count=async(key,n)=>page.waitForFunction(({key,n})=>document.querySelectorAll(`[data-related-key="${key}"] .related-card`).length===n,{key,n});
   const cdp=await context.newCDPSession(page);
   const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:i+1,x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}))});
   const swipe=async(from,to)=>{
    if(mode.mobile){await touch('touchStart',[from]);for(let i=1;i<=6;i++){await touch('touchMove',[{x:from.x+(to.x-from.x)*i/6,y:from.y+(to.y-from.y)*i/6}]);await page.waitForTimeout(12)}await touch('touchEnd',[])}
    else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:6});await page.mouse.up()}
    await page.waitForTimeout(100);
   };
   await page.goto('http://127.0.0.1:8000/');await page.waitForSelector('.grid [data-id="danbooru:2000"]');await press('.grid [data-id="danbooru:2000"]');await waitPost();
   const media=await page.locator('.post-media').boundingBox(),start={x:media.x+media.width/2,y:media.y+media.height*.65};
   await swipe(start,{x:start.x,y:start.y-160});await waitRelated();
   await count('character-0',5);await count('artist-0',5);await count('series-0',5);
   assert.equal(await group('series-0').locator('.related-more').innerText(),'See more');
   assert.deepEqual(await page.locator('.related-section').evaluateAll(ss=>ss.map(s=>s.dataset.relatedKind)),['character','character','artist','series']);
   assert.deepEqual(await page.locator('.related-section h2').allTextContents(),['Sakura Miko','Hoshimachi Suisei','Artist: Thomas 8000','Series: Hololive']);
   const sliderMetrics=await group('character-0').locator('.related-grid').evaluate(el=>({card:el.querySelector('.related-card')?.getBoundingClientRect().width,client:el.clientWidth,scroll:el.scrollWidth}));
   assert(sliderMetrics.card>=128,'Related art slider images use the larger card size');assert(sliderMetrics.scroll>sliderMetrics.client,'the row scrolls horizontally beyond its visible cards');
   await count('character-1',5);assert.equal(await page.locator('.related-tag-select,.related-footer').count(),0);
   for(const [key,tag] of [['character-0','sakura_miko'],['character-1','hoshimachi_suisei'],['artist-0','thomas_8000'],['series-0','hololive']]){
    const ids=await cards(key).evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
    assert.equal(new Set(ids).size,5);assert.deepEqual(ids.map(id=>+id.split(':')[1]),ids.map(id=>+id.split(':')[1]).sort((a,b)=>b-a));assert.ok(ids.every(id=>!['danbooru:9998','danbooru:9999'].includes(id)));
    assert.ok(await cards(key).evaluateAll((nodes,tag)=>nodes.every(n=>pin(n.dataset.id).tags.includes(tag)),tag));
    assert.equal(ids.filter(id=>id==='danbooru:2000').length,1,'the current matching artwork must not be excluded');
    assert.match(await group(key).locator('.related-more').innerText(),/See more/);
    assert.equal(await group(key).locator('.related-grid').evaluate(grid=>grid.children.length===5&&[...grid.children].every(node=>node.classList.contains('related-card'))),true);
    assert.equal(await group(key).locator('.related-section-heading .related-more').count(),1,'See more stays beside its section title');
   }
   assert.equal(await page.locator('.related-grid .cap').count(),0);
   assert.ok(queries.every(q=>q.host==='danbooru.donmai.us'&&q.limit===24&&q.order===undefined));
   assert.equal(await page.locator('#nav').isVisible(),false);
   assert.equal(await page.locator('#sheet').evaluate(s=>s.scrollWidth<=s.clientWidth+1),true);
   if(mode.w===390){await page.locator('#sheet').evaluate(s=>{s.scrollTop=0});fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/related-art-mobile.png',fullPage:false})}
   // Load more navigates to a dedicated named feed, never expands previews.
   for(const [key,title] of [['character-0','Sakura Miko'],['character-1','Hoshimachi Suisei'],['artist-0','Artist: Thomas 8000'],['series-0','Series: Hololive']]){
    const tile=group(key).locator('.related-more');await tile.scrollIntoViewIfNeeded();
    const before=await page.locator('#sheet').evaluate(s=>s.scrollTop),historyLength=await page.evaluate(()=>history.length);
    await press(`[data-related-key="${key}"] .related-more`);
    await page.waitForFunction(()=>postView()?.kind==='tagfeed'&&document.querySelector('.tag-feed-title'));
    assert.equal(await page.locator('.tag-feed-title').innerText(),title);
    assert.equal(await page.evaluate(()=>history.length),historyLength+(key==='character-0'?1:0));
    await page.waitForFunction(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f&&!f.busy&&f.pins.length>0});
    await press('.tag-feed-back');await waitRelated();await count(key,5);
    assert.ok(Math.abs(await page.locator('#sheet').evaluate(s=>s.scrollTop)-before)<3);
   }
   // Preview artwork details still return to the original sections and scroll.
   const child=cards('artist-0').first();await child.scrollIntoViewIfNeeded();const savedScroll=await page.locator('#sheet').evaluate(s=>s.scrollTop),childID=await child.getAttribute('data-id');
   const requestsBeforeChild=queries.length;
   await child[mode.mobile?'tap':'click']();await waitPost();assert.equal(await page.evaluate(()=>postView().id),childID);
   assert.equal(await page.locator('.post-actions .post-action').count(),3);assert.equal(await page.locator('.source-like').count(),0);
   await page.goBack();await waitRelated();await count('character-0',5);
   assert.ok(Math.abs(await page.locator('#sheet').evaluate(s=>s.scrollTop)-savedScroll)<3);assert.equal(queries.length,requestsBeforeChild);
   // Every character has its own visible, correctly matched art block.
   assert.ok(await cards('character-1').evaluateAll(nodes=>nodes.every(n=>pin(n.dataset.id).tags.includes('hoshimachi_suisei'))));
   const names=await page.evaluate(()=>makeRelatedGroups({src:'danbooru',characters:['one','two'],artists:['artist_one','artist_two'],series:['series_one','series_two']}).map(relatedHeading));
   assert.deepEqual(names,['One','Two','Artist: Artist One','Artist: Artist Two','Series: Series One','Series: Series Two']);
   // The page really scrolls. A downward swipe while already scrolled does not exit.
   await page.locator('#sheet').evaluate(s=>{s.scrollTop=0});
   if(mode.mobile)await swipe({x:mode.w/2,y:mode.h*.8},{x:mode.w/2,y:mode.h*.5});
   else{await page.mouse.move(mode.w/2,mode.h*.6);await page.mouse.wheel(0,420);await page.waitForTimeout(160)}
   assert.ok(await page.locator('#sheet').evaluate(s=>s.scrollTop>20));assert.equal(await page.evaluate(()=>postView().kind),'blank');
   await swipe({x:mode.w/2,y:mode.h*.45},{x:mode.w/2,y:mode.h*.45+120});assert.equal(await page.evaluate(()=>postView().kind),'blank');
   // Pull down at the top returns to the original post, not a related child.
   await page.locator('#sheet').evaluate(s=>{s.scrollTop=0});await page.waitForTimeout(120);
   await swipe({x:mode.w*.94,y:85},{x:mode.w*.94,y:255});await waitPost();assert.equal(await page.evaluate(()=>postView().id),'danbooru:2000');
   // Cached posts without categories are enriched before related sections settle.
   await page.evaluate(()=>{const p=pin('danbooru:2000');p.characters=[];p.artists=[];p.series=[];p.detailsReady=false;RELATED_PAGES.delete(String(p.id));detail(p.id);blankPostPage(p.id)});
   await waitRelated();await count('character-0',5);await count('artist-0',5);await count('series-0',5);
   assert.equal(await group('artist-0').locator('h2').innerText(),'Artist: Thomas 8000');
   await press('.related-header [data-a="postback"]');await waitPost();
   // Late requests for an obsolete character list cannot resurrect old blocks.
   await page.evaluate(()=>{const p=pin('danbooru:2000');RELATED_PAGES.delete(String(p.id));blankPostPage(p.id);p.characters=['sakura_miko'];refreshPostInfo(p)});
   await waitRelated(3);await count('character-0',5);await count('artist-0',5);await count('series-0',5);await page.waitForTimeout(300);
   assert.deepEqual(await page.locator('.related-section h2').allTextContents(),['Sakura Miko','Artist: Thomas 8000','Series: Hololive']);
   await press('.related-header [data-a="postback"]');await waitPost();
   // Missing artist names never fall back to the uploader or unrelated tags.
   await page.evaluate(()=>{const p=pin('danbooru:2000');p.characters=['sakura_miko','hoshimachi_suisei'];p.artists=[];p.author='not_the_artist';p.detailsReady=true;RELATED_PAGES.delete(String(p.id));blankPostPage(p.id)});
   await waitRelated();await count('character-0',5);await count('series-0',5);
   assert.equal(await cards('artist-0').count(),0);assert.match(await group('artist-0').innerText(),/No artist tag provided/);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${mode.w}px${mode.legacy?' legacy touch':''}: named per-tag sections, horizontal image sliders, five previews with a See more header action, dedicated named feed navigation, exact matches, stale-response protection, child Back/scroll restoration and swipe navigation.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
