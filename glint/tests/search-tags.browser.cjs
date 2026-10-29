const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const image='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="#356373"/><circle cx="385" cy="215" r="135" fill="#d7be85"/><path d="M0 780V620L230 350 600 780" fill="#1d384b"/></svg>';
const post=(id,missing=false)=>({id,tag_string:'hatsune_miku vocaloid solo',tag_string_character:'hatsune_miku',tag_string_artist:'test_artist',tag_string_copyright:'vocaloid',tags:'hatsune_miku vocaloid solo',rating:'g',created_at:'2026-10-01T12:00:00Z',source:'https://www.pixiv.net/artworks/123456789',...missing?{}:{md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:780,width:600,height:780,file_url:'https://cdn.donmai.us/search-test.png',large_file_url:'https://cdn.donmai.us/search-test.png',preview_url:'https://cdn.donmai.us/search-test.png',file_ext:'png',file_size:12000}});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,1200]){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:860},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];let fail=true;
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({screen:'search',src:'danbooru',srcs:['danbooru','yandere'],mode:'live',hidden:[],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:image});
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   const target=new URL(u.searchParams.get('u'));requests.push(target);
   if(target.pathname==='/counts/posts.json')return route.fulfill({contentType:'application/json',body:JSON.stringify({counts:{posts:123}})});
   if(target.pathname==='/post.xml')return route.fulfill({contentType:'application/xml',body:'<posts count="123"></posts>'});
   const reply=async(body,status=200)=>{try{await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})}catch(e){}};
   if(/\/(?:tag|tags)\.json$/.test(target.pathname))return reply(target.hostname==='yande.re'?[{name:'hatsune_miku',count:1234,type:4},{name:'hatsune_miku_symphony',count:20,type:3}]:[{name:'hatsune_miku',post_count:4321,category:4},{name:'hatsune_miku_(append)',post_count:100,category:4}]);
   const tags=target.searchParams.get('tags')||'',cursor=target.searchParams.get('page')||'1';
   if(tags.includes('timeout_tag'))return;
   if(tags.includes('bad_tag')&&fail)return reply({message:'This tag query is invalid.'},422);
   if(tags.includes('slow_tag')){await delay(950);return reply([post(111)])}
   if(tags.includes('new_tag'))return reply([post(808)]);
   if(tags.includes('paginated_tag'))return reply(cursor==='1'?Array.from({length:40},(_,i)=>post(3000-i,i>=36)):Array.from({length:5},(_,i)=>post(2960-i)));
   if(/\/posts\/\d+\.json$/.test(target.pathname))return reply(post(503));
   return reply(target.hostname==='yande.re'?[post(503),post(501),post(502)]:[post(903),post(901),post(902)]);
  });
  const input=()=>page.locator('#q'),press=selector=>page.locator(selector).first()[mobile?'tap':'click']();
  const chooseHomeSource=async source=>{await press('[data-a="nav"][data-v="home"]');await press(`.srctabs [data-v="${source}"]`);await press('[data-a="nav"][data-v="search"]')};
  const wait=async(query,n,source='danbooru')=>page.waitForFunction(({query,n,source})=>SEARCH?.query===query&&SEARCH.source===source&&!SEARCH.busy&&!SEARCH.error&&SRES?.length===n,{query,n,source});
  await page.goto('http://127.0.0.1:8000/?screen=search');await input().waitFor();assert.equal(await page.locator('[data-a="qs"]').count(),0);assert.equal(await page.locator('.search-head>.tabs,.search-head [data-a="src"],.search-head [data-a="addsrc"]').count(),0);assert.equal(requests.filter(u=>!['/counts/posts.json','/post.xml'].includes(u.pathname)).length,0,'no suggested-tag or post requests on the idle screen');
  fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});if(width===390)await page.screenshot({path:'/home/user/.cache/pinboard/search-v60-clean.png'});
  // Real tag names come from the selected source, not static shortcut buttons.
  await input().fill('hatsune_mi');await page.waitForSelector('#search-tag-options:not([hidden]) [role="option"]');
  assert.equal(await page.locator('#q').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#search-tag-options button span').first().innerText(),'hatsune_miku');
  const bounds=await page.locator('#search-tag-options').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  if(width===390)await page.screenshot({path:'/home/user/.cache/pinboard/search-v60-tags.png'});
  await page.evaluate(()=>window.__queryNode=document.getElementById('q'));await input().press('ArrowDown');await input().press('Enter');
  assert.equal(await input().inputValue(),'hatsune_miku');assert.equal(await input().evaluate(e=>document.activeElement===e),false);await wait('hatsune_miku',3);
  assert.equal(await page.evaluate(()=>window.__queryNode===document.getElementById('q')),true);assert.equal(await input().evaluate(e=>e.selectionStart),12);
  // Existing terms/exclusions are kept when replacing a token in the middle.
  await input().fill('solo -hatsu rating:g');await input().evaluate(e=>e.setSelectionRange(11,11));await input().press('ArrowLeft');await input().press('ArrowRight');
  await page.waitForSelector('#search-tag-options:not([hidden]) [role="option"]');await press('#search-tag-options [role="option"]');
  assert.equal(await input().inputValue(),'solo -hatsune_miku rating:g');assert.equal(await input().evaluate(e=>document.activeElement===e),true);
  await wait('solo -hatsune_miku rating:g',3);
  const advanced='hatsune_miku rating:g -comic order:score';await input().fill(advanced);await input().press('Enter');await wait(advanced,3);
  const request=requests.filter(u=>u.pathname==='/posts.json').at(-1);assert.equal(request.searchParams.get('tags'),advanced);assert.deepEqual(await page.evaluate(()=>SRES.map(p=>p.sid)),['903','901','902']);
  assert.equal(await page.locator('#search-tag-options').isVisible(),false);assert.equal(await page.locator('#sres .cap').count(),0);
  // An older request cannot repaint a newer query, or resurrect a cleared query.
  await input().fill('slow_tag');await page.waitForFunction(()=>SEARCH?.query==='slow_tag'&&SEARCH.running);await input().fill('new_tag');await wait('new_tag',1);await delay(700);assert.deepEqual(await page.evaluate(()=>SRES.map(p=>p.sid)),['808']);
  await input().fill('slow_tag');await page.waitForFunction(()=>SEARCH?.query==='slow_tag'&&SEARCH.running);await input().fill('');await delay(700);assert.equal(await page.evaluate(()=>SEARCH),null);assert.equal(await page.locator('#sres .spin').count(),0);assert.equal(await page.locator('#sres .search-recents').isVisible(),true);
  await input().fill('source_tag');await wait('source_tag',3);await chooseHomeSource('yandere');await input().fill('source_tag');await wait('source_tag',3,'yandere');assert.equal(await input().inputValue(),'source_tag');
  await input().fill('hatsune_mi');await page.waitForSelector('#search-tag-options:not([hidden]) [role="option"]');assert.ok(requests.some(u=>u.hostname==='yande.re'&&u.pathname==='/tag.json'&&u.searchParams.get('name')==='hatsune_mi*'));
  await press('#search-tag-options [role="option"]');await wait('hatsune_miku',3,'yandere');
  // Errors settle into an actionable state, not an indefinitely spinning result.
  await input().fill('bad_tag');await page.waitForSelector('.search-error');assert.equal(await page.locator('#sres .spin').count(),0);fail=false;await press('[data-a="searchretry"]');await wait('bad_tag',3,'yandere');
  await input().fill('<img src=x onerror="window.__searchXSS=1">');await input().press('Enter');await page.waitForFunction(()=>SEARCH&&!SEARCH.busy);assert.equal(await page.locator('.search-head img').count(),0);assert.equal(await page.evaluate(()=>window.__searchXSS),undefined);
  await chooseHomeSource('danbooru');await input().fill('paginated_tag');await wait('paginated_tag',36);
  assert.equal(await page.evaluate(()=>SEARCH.cursor),'b2961');await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await wait('paginated_tag',41);
  assert.ok(requests.some(u=>u.searchParams.get('tags')?.includes('paginated_tag')&&u.searchParams.get('page')==='b2961'));assert.equal(await page.evaluate(()=>SEARCH.hasMore),false);
  await page.evaluate(()=>window.scrollTo(0,0));await input().fill('hatsune_miku');await input().press('Enter');await wait('hatsune_miku',3);
  await press('#sres [data-a="open"]');await page.waitForSelector('#sheet .post-detail');await page.goBack();await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));assert.equal(await input().inputValue(),'hatsune_miku');
  await page.evaluate(()=>document.documentElement.dataset.theme='light');assert.equal(await page.locator('#app').evaluate(e=>e.scrollWidth<=e.clientWidth),true);assert.deepEqual(errors,[]);
  if(width===360){
   await page.clock.install();await input().fill('timeout_tag');await page.clock.fastForward(400);await page.waitForFunction(()=>SEARCH?.query==='timeout_tag'&&SEARCH.running);await page.clock.fastForward(15500);await page.waitForSelector('.search-error');assert.match(await page.locator('.search-error').innerText(),/too long/);assert.equal(await page.locator('#sres .spin').count(),0);
  }
  // Deep-linked tag queries execute immediately on reload, without a keystroke.
  await page.goto('http://127.0.0.1:8000/?screen=search&q=hatsune_miku');await wait('hatsune_miku',3);assert.equal(await input().inputValue(),'hatsune_miku');
  console.log(`PASS ${width}px: no shortcut chips; source-aware tag completion and keyboard/touch selection; native operators/order, focus/caret, stale/clear/source races, retry/timeout, raw-cursor pagination, details/Back, escaped input and deep-link search.`);await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
