const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const KEY='pb-search-history-v1',image='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="#346575"/><circle cx="390" cy="215" r="135" fill="#b9cda6"/></svg>';
const post=id=>({id,tags:'landscape ice_cream 1girl',tag_string:'landscape ice_cream 1girl',rating:'s',md5:'1234567890abcdef1234567890abcdef',width:600,height:780,image_width:600,image_height:780,file_url:'https://konachan.net/recent-test.png',preview_url:'https://konachan.net/recent-test.png',large_file_url:'https://konachan.net/recent-test.png',file_ext:'png'});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,435,1200]){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:860},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{if(localStorage.getItem('__recent_qa_seeded'))return;localStorage.setItem('__recent_qa_seeded','1');localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb-search-history-v1','{broken');localStorage.setItem('pb2',JSON.stringify({screen:'search',src:'konachan',srcs:['danbooru','konachan'],mode:'live',bookmarks:[{id:'danbooru:1',savedAt:123}],bookmarkVersion:1,stags:{konachan:'rating:s'}}))});
  await page.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url()),svg=()=>route.fulfill({contentType:'image/svg+xml',body:image});
   if(r.resourceType()==='image')return svg();if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   const target=new URL(u.searchParams.get('u'));if(/\.(png|jpe?g|webp|gif)$/i.test(target.pathname))return svg();requests.push(target);
   const reply=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(target.pathname==='/counts/posts.json')return reply({counts:{posts:3}});
   if(target.pathname==='/post.xml')return route.fulfill({contentType:'application/xml',body:`<posts count="${target.searchParams.get('tags')?3:213673}"></posts>`});
   if(/\/(tags|tag)\.json$/.test(target.pathname))return reply([{name:'hatsune_miku',count:100,type:4}]);
   return reply([post(903),post(901),post(902)]);
  });
  const input=()=>page.locator('#q'),press=s=>page.locator(s).first()[mobile?'tap':'click'](),history=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pb-search-history-v1')||'[]')),rows=()=>page.locator('.recent-run span').allTextContents(),postRequests=()=>requests.filter(u=>/\/(posts|post)\.json$/.test(u.pathname));
  const wait=q=>page.waitForFunction(q=>SEARCH?.query===q&&!SEARCH.busy&&!SEARCH.error&&SRES.length===3,q),clear=()=>input().fill('');
  const run=async q=>{await input().fill(q);await input().press('Enter');await wait(q)};
  const homeSource=async source=>{await press('[data-a="nav"][data-v="home"]');await press(`.srctabs [data-v="${source}"]`);await press('[data-a="nav"][data-v="search"]')};
  await page.goto('http://127.0.0.1:8000/?screen=search');await page.waitForFunction(()=>SEARCH_COUNT?.total===213673);assert.equal(await page.locator('.search-recents h2').innerText(),'Recent searches');assert.match(await page.locator('.recent-empty').innerText(),/No recent searches yet/);assert.equal(postRequests().length,0);
  // DOM value is authoritative even when a mobile keyboard has not emitted input.
  const url=page.url(),before=postRequests().length;await input().evaluate(e=>e.value='1girl ice_cream');await input().press('Enter');await wait('1girl ice_cream');assert.equal(page.url(),url);assert.equal(postRequests().length-before,1);assert.equal(postRequests().at(-1).searchParams.get('tags'),'1girl ice_cream');assert.equal(await input().evaluate(e=>e===document.activeElement),false);assert.deepEqual((await history()).map(r=>r.query),['1girl ice_cream']);
  await clear();assert.deepEqual(await rows(),['1girl ice_cream']);
  // Native form submission covers the mobile keyboard Search action too.
  const nativeBefore=postRequests().length;await input().evaluate(e=>e.value='landscape');await page.locator('#search-form').evaluate(f=>f.requestSubmit());await wait('landscape');assert.equal(postRequests().length-nativeBefore,1);await clear();assert.deepEqual(await rows(),['landscape','1girl ice_cream']);
  await page.reload();await page.locator('.recent-list').waitFor();assert.deepEqual(await rows(),['landscape','1girl ice_cream']);
  await press('.recent-run[data-v="1girl ice_cream"]');await wait('1girl ice_cream');assert.equal(await input().inputValue(),'1girl ice_cream');await clear();assert.deepEqual(await rows(),['1girl ice_cream','landscape'],'rerunning a query moves it to the top without duplication');
  await press('.recent-remove[data-v="landscape"]');assert.deepEqual(await rows(),['1girl ice_cream']);assert.equal(await page.evaluate(()=>SEARCH),null,'remove must not run a search');
  // The magnifier is also a proper submit button, not just decoration.
  await input().fill('hatsune_miku rating:s -comic');await press('.search-submit');await wait('hatsune_miku rating:s -comic');await clear();assert.deepEqual(await rows(),['hatsune_miku rating:s -comic','1girl ice_cream']);
  // History strings remain plain text and a long native query stays in the viewport.
  const hostile='<img src=x onerror="window.__recentsXSS=1">';await run(hostile);await clear();assert.equal(await page.locator('.recent-list img').count(),0);assert.equal(await page.evaluate(()=>window.__recentsXSS),undefined);assert.equal((await rows())[0],hostile);
  await press('.recent-remove');assert.equal((await rows()).includes(hostile),false);
  const long='very_long_tag_'.repeat(20)+' rating:s -comic';await run(long);await clear();const geom=await page.locator('.recent-list').evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth,right:e.getBoundingClientRect().right,screen:innerWidth}));assert.ok(geom.scroll<=geom.width&&geom.right<=geom.screen,JSON.stringify(geom));await press('.recent-remove');
  // Draft keystrokes are not separate history entries; composition Enter does not submit.
  await input().fill('unsubmitted_draft');await clear();assert.equal((await history()).some(r=>r.query==='unsubmitted_draft'),false);
  const imeBefore=postRequests().length;await input().evaluate(e=>{e.focus();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value='青空';e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));e.form.requestSubmit()});assert.equal(postRequests().length,imeBefore);assert.equal((await history()).some(r=>r.query==='青空'),false);await input().evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await input().press('Enter');await wait('青空');await clear();await press('.recent-remove');
  if(width===390){await page.waitForFunction(()=>SEARCH_COUNT?.query===''&&!SEARCH_COUNT.busy);fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/recent-searches-v65.png'})}
  // Home still owns the source; recents are scoped to that source.
  await homeSource('danbooru');assert.deepEqual(await rows(),[]);await run('danbooru_tag');await clear();assert.deepEqual(await rows(),['danbooru_tag']);await press('.recent-clear');assert.deepEqual(await rows(),[]);assert.ok((await history()).some(r=>r.source==='konachan'),'clearing one source must retain the other source history');
  await homeSource('konachan');assert.deepEqual(await rows(),['hatsune_miku rating:s -comic','1girl ice_cream']);await page.evaluate(()=>document.documentElement.dataset.theme='light');assert.equal(await page.locator('#app').evaluate(e=>e.scrollWidth<=e.clientWidth),true);await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await press('.recent-clear');assert.equal((await history()).length,0);await page.reload();await page.locator('.recent-empty').waitFor();assert.deepEqual(await rows(),[]);assert.equal(await page.evaluate(()=>S.bookmarks.length),1);assert.equal(await page.evaluate(()=>S.stags.konachan),'rating:s');assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: Enter/native mobile form/icon submit exact query once and dismiss keyboard; local newest-first deduplicated recents survive reload, tap reruns, remove/clear work, source isolation, draft/IME safety, escaped/long queries, both themes and saved data preserved.`);await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
