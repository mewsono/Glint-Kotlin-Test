// Regression: a large tag must not stop after 36 usable images from 40 API records.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const post=(id,available=true)=>({id,...(available?{md5:id.toString(16).padStart(32,'0'),file_url:`https://cdn.donmai.us/original/${id}.png`,large_file_url:`https://cdn.donmai.us/sample/${id}.png`}:{}),image_width:600,image_height:800,file_size:100000,file_ext:'png',tag_string:'aris_(blue_archive) test_artist blue_archive',tag_string_character:'aris_(blue_archive)',tag_string_artist:'test_artist',tag_string_copyright:'blue_archive',rating:'g'});
const pool=Array.from({length:126},(_,i)=>post(200000-i,i<36||i>=80)),parent=pool[0];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const mode of [{w:390,h:844,mobile:true},{w:360,h:804,mobile:true,legacy:true},{w:1200,h:900,mobile:false}]){
   const context=await browser.newContext({viewport:{width:mode.w,height:mode.h},isMobile:mode.mobile,hasTouch:mode.mobile,serviceWorkers:'block'}),page=await context.newPage(),queries=[],errors=[];
   let cap=false,countDelay=0;page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({legacy})=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({hidden:['danbooru:199915']}));if(legacy)window.PointerEvent=undefined},mode);
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#456b81"/></svg>'});
    if(url.pathname!=='/api/proxy')return url.hostname==='127.0.0.1'?route.continue():route.abort();
    const u=new URL(url.searchParams.get('u')),tags=u.searchParams.get('tags')||'',cursor=u.searchParams.get('page')||'1',limit=+(u.searchParams.get('limit')||40),oldest=tags.includes('order:id_asc');
    let body=[];
    if(u.pathname.includes('/counts/')){if(countDelay)await new Promise(r=>setTimeout(r,countDelay));body={counts:{posts:140000}};}
    else if(/^\/posts\/\d+\.json$/.test(u.pathname))body=pool.find(p=>String(p.id)===u.pathname.match(/\d+/)[0]);
    else if(u.pathname==='/posts.json'){
     const tag=tags.split(' ').find(t=>!t.includes(':'));
     if(!tag)body=[parent];
     else{
      let posts=pool.filter(p=>p.tag_string.split(' ').includes(tag)).sort((a,b)=>oldest?a.id-b.id:b.id-a.id);
      if(cursor.startsWith('b'))posts=posts.filter(p=>p.id<+cursor.slice(1));
      else if(cursor.startsWith('a'))posts=posts.filter(p=>p.id>+cursor.slice(1));
      else posts=posts.slice((+cursor-1)*limit);
      body=posts.slice(0,cap&&limit===40?36:limit);
      // A duplicate returned by the source must not be inserted twice.
      if(!oldest&&cursor==='b199921')body[4]=pool[10];
      if(oldest&&cursor.startsWith('a'))body.reverse();
      if(limit===40)queries.push({cursor,oldest,raw:body.length});
     }
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   });
   const press=selector=>page.locator(selector).first()[mode.mobile?'tap':'click']();
   const state=()=>page.evaluate(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return {count:f.pins.length,ids:f.pins.map(p=>p.id),done:f.done,cursor:f.cursor,page:f.page,scanned:f.scanned,order:f.order,err:f.err}});
   const advance=async()=>{
    const before=await state();await page.locator('#sheet').evaluate(e=>{e.scrollTop=e.scrollHeight});
    await page.waitForFunction(before=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f&&!f.busy&&(f.page>before.page||f.err&&f.err!==before.err)},before);
   };
   const settled=()=>page.waitForFunction(()=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);return f&&f.loaded&&!f.busy});
   // Oldest is no longer a chip in the tag feed (its control is Newest <-> Popular),
   // but the chronological cursor path is unchanged, so drive it directly.
   const setOrder=async order=>{await page.evaluate(o=>{const f=TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey);applyTagFeedOrder(f,o);loadTagFeed(f,true)},order);await settled()};
   await page.goto(BASE+'/');await page.waitForSelector('.grid [data-id="danbooru:200000"]');
   await press('.grid [data-id="danbooru:200000"]');await page.waitForSelector('.post-detail');
   await page.evaluate(()=>blankPostPage('danbooru:200000'));
   await page.waitForFunction(()=>document.querySelectorAll('.related-card[data-id="danbooru:200000"]').length===3);
   for(const key of ['character-0','artist-0','series-0']){
    const section=page.locator(`[data-related-key="${key}"]`);
    assert.equal(await section.locator('.related-card').count(),5);
    assert.equal(await section.locator('.related-card').first().getAttribute('data-id'),'danbooru:200000');
   }
   await press('[data-related-key="series-0"] .related-more');await settled();
   let f=await state();assert.equal(f.count,36);assert.equal(f.done,false);assert.equal(f.cursor,'b199961');assert.equal(f.scanned,40);
   await page.waitForFunction(()=>TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey)?.total===140000);
   assert.match(await page.locator('.tag-feed-page .likes-head').innerText(),/140,000 posts/);
   assert.equal(await page.locator('.tag-feed-page [data-a="tagfeedmore"]').count(),1);
   // One click passes a completely unavailable 40-record batch and finds the next artworks.
   await advance();f=await state();
   assert.equal(f.count,74);assert.equal(f.page,3);assert.equal(f.scanned,120);assert.equal(f.cursor,'b199881');assert.equal(f.done,false);
   assert.deepEqual(queries.slice(0,3).map(q=>q.cursor),['1','b199961','b199921']);
   assert.equal(new Set(f.ids).size,74);assert.ok(!f.ids.includes('danbooru:199915'));
   assert.deepEqual(f.ids.map(id=>+id.split(':')[1]),f.ids.map(id=>+id.split(':')[1]).sort((a,b)=>b-a));
   // A capped/short batch is not treated as final while the source count says more remain.
   await advance();f=await state();assert.equal(f.count,80);assert.equal(f.done,false);assert.equal(f.scanned,126);
   await advance();f=await state();assert.equal(f.done,true);assert.equal(f.count,80);
   assert.equal(await page.locator('.tag-feed-page [data-a="tagfeedmore"]').count(),0);
   // Oldest also advances over unavailable records at the far edge of its batch.
   await page.locator('#sheet').evaluate(s=>{s.scrollTop=0});await setOrder('oldest');
   assert.equal((await state()).order,'oldest');assert.equal((await state()).count,40);
   await advance();f=await state();assert.equal(f.count,45);assert.equal(f.cursor,'a199954');assert.equal(f.done,false);
   await press('.tag-feed-back');await page.waitForSelector('.related-sections');
   assert.equal(await page.locator('.related-card[data-id="danbooru:200000"]').count(),3);
   await press('[data-related-key="series-0"] .related-more');await settled();assert.equal((await state()).order,'newest');assert.equal((await state()).count,36);assert.equal((await state()).done,false);
   // Also handle an API that caps the actual record batch below our request,
   // with its large total arriving after the short page has already rendered.
   await press('.tag-feed-back');await page.waitForSelector('.related-sections');cap=true;countDelay=250;
   await press('[data-related-key="series-0"] .related-more');await settled();
   await page.waitForFunction(()=>TAG_FEEDS.get(document.querySelector('#sheet').dataset.tagFeedKey)?.total===140000);
   f=await state();assert.equal(f.count,36);assert.equal(f.scanned,36);assert.equal(f.done,false);assert.equal(f.cursor,'b199965');
   await advance();assert.ok((await state()).count>36);assert.equal((await state()).done,false);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${mode.w}px${mode.legacy?' legacy touch':''}: current artwork remains in all matching previews; 140k-tag pagination continues past 36 images, skips unavailable batches, uses raw-record cursors, excludes hidden/duplicate rows and stops only on actual exhaustion.`);
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
