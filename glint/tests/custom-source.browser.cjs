/* Explore follows the Home source and no longer repeats the source row; the
   catalogue can add a source the app does not ship with, by guessing or by
   choosing its API type. Fixture traffic only. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,1200').split(',').map(Number);
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const post=id=>({id,md5:String(id).padStart(32,'f'),image_width:400,image_height:520,file_ext:'png',file_url:`https://cdn.example-booru.org/${id}.png`,preview_file_url:`https://cdn.example-booru.org/${id}.jpg`,large_file_url:`https://cdn.example-booru.org/${id}.jpg`,tag_string:'landscape my_custom_tag',rating:'g',score:id,created_at:'2026-10-20T10:00:00Z'});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],hits=[];
  page.setDefaultTimeout(9000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');
   if(!localStorage.getItem('pb2'))localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url()),full=decodeURIComponent(u.pathname+u.search);
   if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.hostname==='booru.example.org'){
     hits.push(full);
     if(u.pathname.endsWith('/posts.json'))return route.fulfill({contentType:'application/json',body:JSON.stringify([post(4101),post(4102)])});
     return route.fulfill({status:404,contentType:'application/json',body:'{"error":"nope"}'});
   }
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   const target=new URL(u.searchParams.get('u'));
   let value=[];
   if(target.pathname.endsWith('counts/posts.json'))value={counts:{posts:2}};
   else if(target.pathname==='/posts.json')value=[{id:3001,md5:'a'.repeat(32),image_width:400,image_height:520,file_ext:'png',file_url:'https://cdn.donmai.us/3001.png',preview_url:'https://cdn.donmai.us/3001.png',large_file_url:'https://cdn.donmai.us/3001.png',tag_string:'landscape',rating:'g',score:5,created_at:'2026-10-20T10:00:00Z'}];
   else if(target.pathname==='/explore/posts/popular.json')value=[{id:3002,md5:'b'.repeat(32),image_width:400,image_height:520,file_ext:'png',file_url:'https://cdn.donmai.us/3002.png',preview_url:'https://cdn.donmai.us/3002.png',large_file_url:'https://cdn.donmai.us/3002.png',tag_string:'landscape',rating:'g',score:5,created_at:'2026-10-20T10:00:00Z'}];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(value)})});
  await page.goto(BASE+'/');await page.waitForFunction(()=>window.PB_APP_READY===true);
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();

  // ---- the header keeps one edit control, with its own icon --------------
  assert.equal(await page.locator('.hdh [data-a="editsrc"]').count(),0,'the top bar no longer carries a source edit button');

  // ---- Explore shows which source it is on, and no source row ------------
  await page.evaluate(()=>{S.screen='profile';S.bt='Explore';render();exploreEnsure()});
  await page.waitForSelector('.ex-sections');
  assert.equal(await page.locator('.ex-srcs, .ex-sections ~ .srctabs, .tabpane[data-tab="Explore"] .srctabs').count(),0,'Explore does not repeat the source row');
  assert.equal(await page.locator('.tabpane[data-tab="Explore"] .exhead b').innerText(),'Danbooru','Explore opens on the source name alone');
  assert.equal(await page.locator('.tabpane[data-tab="Explore"] .exhead span').count(),0,'with no second line under it');
  assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.tabpane[data-tab="Explore"] .exhead b')).fontSize))<=13,true,'the source name is a small caption, not a page title');

  // ---- the add-source page offers a custom source ------------------------
  await page.evaluate(()=>{S.screen='home';render()});
  await press('.addsrc');
  await page.waitForSelector('.source-catalogue');
  const addCustom=page.locator('.source-catalogue [data-a="customsrc"]');
  assert.equal(await addCustom.count(),1,'the catalogue offers a custom source');
  await addCustom.first()[mobile?'tap':'click']();
  await page.waitForSelector('.custom-source-form');

  // ---- Guess asks the address, and fills the picker ----------------------
  await page.fill('#csName','Example');
  await page.fill('#csBase','booru.example.org');
  await page.locator('[data-a="csguess"]').first().click();
  await page.waitForFunction(()=>document.querySelector('#cs-result')?.textContent.includes('Danbooru API'));
  assert.equal(await page.evaluate(()=>document.querySelector('#csEngine').value),'danbooru','the guess fills the picker');
  assert.equal(hits.some(h=>/posts\.json/.test(h)),true,'the guess asked the address itself');

  // ---- Add verifies it, adds it to the row, and Home uses it -------------
  await page.locator('[data-a="csadd"]').first().click();
  await page.waitForSelector('.source-catalogue');
  const customId=await page.evaluate(()=>Object.keys(PB_SOURCES).find(id=>PB_SOURCES[id].custom));
  assert.ok(customId,'the custom source is registered');
  assert.equal(await page.evaluate(()=>S.srcs.includes(Object.keys(PB_SOURCES).find(id=>PB_SOURCES[id].custom))),true,'and it is in the source row');
  await page.evaluate(()=>close());
  await page.evaluate(id=>{S.src=id;S.mode='live';render();loadLive(true)},customId);
  await page.waitForFunction(()=>document.querySelectorAll('.grid [data-id]').length>0);
  assert.equal(await page.locator('.grid [data-id]').count(),2,'Home shows posts from the custom source');
  assert.equal(await page.evaluate(id=>document.querySelector('.grid [data-id]')?.dataset.id.startsWith(id+':'),customId),true,'with the custom source id');
  assert.equal(await page.locator('.tabs .srctab, .tabs [data-a="src"], .tabs [data-a="addsrc"]').count()>0,true,'Home still shows the source row');

  // ---- it survives a reload ---------------------------------------------
  await page.reload();await page.waitForFunction(()=>window.PB_APP_READY===true);
  assert.equal(await page.evaluate(id=>!!PB_SOURCES[id]&&S.srcs.includes(id),customId),true,'the custom source is remembered');

  // ---- and Explore is honest: no invented views -------------------------
  await page.evaluate(id=>{S.src=id;S.screen='profile';S.bt='Explore';render();exploreReset(id);exploreEnsure()},customId);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.ex-section').count(),0,'a custom source gets no invented explore view');
  assert.match(await page.locator('.ex-sections .empty').innerText(),/no explore view/i);
  assert.equal(hits.some(h=>/explore/.test(h)),false,'and no explore request is made for it');

  // ---- Delete removes it for good ---------------------------------------
  await page.evaluate(()=>{S.screen='home';S.src='danbooru';render()});
  await press('.addsrc');
  await page.waitForSelector('.source-catalogue');
  await page.locator(`.source-catalogue [data-source="${customId}"] [data-a="srcdel"]`).first().click();
  await page.waitForSelector('.source-catalogue');
  assert.equal(await page.evaluate(id=>!PB_SOURCES[id]&&!S.srcs.includes(id),customId),true,'Delete removes the source');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pb-custom-sources-v1')||'[]').length),0,'and forgets it on this device');

  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: Explore names the source instead of repeating the row; the catalogue adds a custom source by guessing or choosing its API type, verifies it, shows its posts, remembers it and deletes it without inventing views.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
