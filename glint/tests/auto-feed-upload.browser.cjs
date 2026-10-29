// Real scrolling must advance the feed without tapping the old spinner.
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const began=Date.now(),pool=Array.from({length:121},(_,i)=>({id:300000-i,...(i===39?{}:{md5:(300000-i).toString(16).padStart(32,'0'),file_url:`https://cdn.donmai.us/original/${300000-i}.png`,large_file_url:`https://cdn.donmai.us/sample/${300000-i}.png`}),image_width:600,image_height:800,file_size:150000,file_ext:'png',tag_string:'aris_(blue_archive) test_artist blue_archive',tag_string_character:'aris_(blue_archive)',tag_string_artist:'test_artist',tag_string_copyright:'blue_archive',created_at:new Date(began-65000-i*60000).toISOString(),rating:'g'}));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const mode of [{w:390,h:844,mobile:true},{w:360,h:804,mobile:true,legacy:true},{w:1200,h:900,mobile:false}]){
   const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mode.mobile,hasTouch:mode.mobile,serviceWorkers:'block'}),page=await context.newPage(),queries=[],errors=[],held=[];
   let failures=0,delay=0,hang=false,details=0;page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({legacy})=>{localStorage.setItem('pb-swipe-hint-v22','1');if(legacy)window.PointerEvent=undefined},mode);
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#456b81"/></svg>'});
    if(url.pathname!=='/api/proxy')return url.hostname==='127.0.0.1'?route.continue():route.abort();
    const u=new URL(url.searchParams.get('u')),tags=u.searchParams.get('tags')||'',tag=tags.split(' ').find(t=>!t.includes(':')),cursor=u.searchParams.get('page')||'1',limit=+(u.searchParams.get('limit')||40);let body=[];
    if(u.pathname.includes('/counts/'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"count not available"}'});
    if(/^\/posts\/\d+\.json$/.test(u.pathname)){details++;await new Promise(r=>setTimeout(r,70));body=pool.find(p=>String(p.id)===u.pathname.match(/\d+/)[0])}
    else if(u.pathname==='/posts.json'){
     if(!tag)body=[pool[0]];
     else{
      if(limit===40){
       queries.push(cursor);
       if(hang){await new Promise(resolve=>held.push(resolve));try{return await route.fulfill({contentType:'application/json',body:'[]'})}catch{return}}
       if(delay)await new Promise(r=>setTimeout(r,delay));
       if(failures){failures--;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"try again"}'})}
      }
      let rows=pool.filter(p=>p.tag_string.split(' ').includes(tag));
      if(cursor.startsWith('b'))rows=rows.filter(p=>p.id<+cursor.slice(1));
      else if(cursor.startsWith('a'))rows=rows.filter(p=>p.id>+cursor.slice(1)).reverse();
      else rows=rows.slice((+cursor-1)*limit);
      body=rows.slice(0,limit);
     }
    }
    try{await route.fulfill({contentType:'application/json',body:JSON.stringify(body)})}catch{}
   });
   const press=selector=>page.locator(selector).first()[mode.mobile?'tap':'click']();
   const count=n=>page.waitForFunction(n=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f?.pins.length===n&&!f.busy},n);
   const atBottom=async()=>page.locator('#sheet').evaluate(s=>{s.scrollTop=s.scrollHeight});
   await page.goto('http://127.0.0.1:8000/');await page.waitForSelector('.grid [data-id="danbooru:300000"]');await press('.grid [data-id="danbooru:300000"]');
   await page.evaluate(()=>blankPostPage('danbooru:300000'));await page.waitForSelector('[data-related-key="series-0"] .related-more:not(:disabled)');
   await press('[data-related-key="series-0"] .related-more');await count(39);
   assert.match(await page.locator('.tag-feed-page .likes-head').innerText(),/39 posts loaded/);
   assert.equal(await page.locator('.tag-feed-page .spin').count(),0);
   assert.equal(await page.locator('.tag-feed-load').innerText(),'Load more');
   // Place near the end, then use native touch/wheel to cross the threshold.
   delay=250;await page.locator('#sheet').evaluate(s=>{s.scrollTop=s.scrollHeight-s.clientHeight-420});
   if(mode.mobile){
    const cdp=await context.newCDPSession(page),x=mode.w/2,y=mode.h*.74;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
    for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x,y:y-i*40}]});await page.waitForTimeout(12)}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{await page.mouse.move(mode.w/2,mode.h*.7);await page.mouse.wheel(0,260)}
   await page.waitForFunction(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f?.busy||f?.pins.length===79});
   await page.locator('#sheet').evaluate(s=>{for(let i=0;i<15;i++)s.dispatchEvent(new Event('scroll'))});
   await count(79);delay=0;assert.deepEqual(queries,['1','b299961']);
   assert.equal(await page.locator('.tag-feed-page .spin').count(),0);
   // Errors stop animation/automatic retries; the labeled retry advances once.
   failures=1;await atBottom();await page.waitForSelector('.tag-feed-error');
   const failed=queries.at(-1),attempts=queries.length;await page.waitForTimeout(700);assert.equal(queries.length,attempts);assert.equal(await page.locator('.tag-feed-page .spin').count(),0);
   await press('.tag-feed-error [data-a="tagfeedmore"]');await count(119);assert.equal(queries.at(-1),failed);
   // A real post's … page shows its source upload age and exact datetime.
   await press('.tag-feed-page [data-id="danbooru:300000"]');await page.waitForSelector('.post-detail');await press('.post-topbar [data-a="menu"]');
   const field=page.locator('[data-file-field="uploaded"] dd');
   assert.match(await field.innerText(),/minute[s]? ago/);assert.equal(await field.locator('time').getAttribute('datetime'),pool[0].created_at);
   assert.ok(await field.locator('time').getAttribute('title'));
   await page.evaluate(()=>{const p=pin('danbooru:300000');p.uploadedAt=Date.now()-3605000;refreshPostInfo(p)});assert.equal(await field.innerText(),'an hour ago');
   if(mode.w===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/upload-time-v46.png'})}
   await page.evaluate(()=>{const p=pin('danbooru:300000');p.uploadedAt=null;p.date=Date.now();refreshPostInfo(p)});assert.equal(await field.innerText(),'Not provided');
   await page.goBack();await page.waitForSelector('.post-detail');const previousDetails=details;
   await page.evaluate(()=>{const p=pin('danbooru:300000');delete p.uploadedAt;delete p.uploadInfoReady;p.detailsReady=true;p.fileInfoReady=true;p.sourceInfoReady=true;detail(p.id,true)});
   await press('.post-topbar [data-a="menu"]');await page.waitForSelector('[data-file-field="uploaded"] time');assert.equal(details,previousDetails+1);
   await page.goBack();await page.waitForSelector('.post-detail');await page.goBack();await count(119);
   await atBottom();await count(120);assert.match(await page.locator('.tag-feed-end').innerText(),/End of results/);assert.equal(await page.locator('.tag-feed-page .spin').count(),0);
   // A stalled request cannot animate forever, and navigating Back cancels it.
   if(mode.w===390){
    await page.clock.install();hang=true;
    await page.evaluate(()=>tagFeedPage({src:'danbooru',kind:'series',tag:'blue_archive',query:'blue_archive',parentId:'danbooru:300000'}));
    await page.waitForFunction(()=>TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey)?.busy);
    await page.clock.fastForward(16000);await page.waitForSelector('.tag-feed-error');assert.match(await page.locator('.tag-feed-error').innerText(),/took too long/);assert.equal(await page.locator('.tag-feed-page .spin').count(),0);
    hang=false;held.splice(0).forEach(release=>release());await press('.tag-feed-error [data-a="tagfeedmore"]');await count(39);
    hang=true;await atBottom();await page.waitForFunction(()=>TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey)?.busy);const key=await page.evaluate(()=>postView().id);
    await press('.tag-feed-back');await page.waitForSelector('.related-sections');await page.waitForFunction(key=>!TAG_FEEDS.get(key).busy,key);
    const stopped=queries.length;await page.clock.fastForward(20000);assert.equal(queries.length,stopped);held.splice(0).forEach(release=>release());
   }
   assert.deepEqual(errors,[]);
   console.log(`PASS ${mode.w}px${mode.legacy?' legacy touch':''}: native scrolling auto-loads 39→79→119 posts without spinner taps; no duplicate/error retry loops, visible loading/end states, real upload age + exact date and cache enrichment${mode.w===390?', 15s timeout and Back cancellation':''}.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
