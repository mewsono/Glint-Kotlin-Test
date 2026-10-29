/* Tags in post info are entry points, and related art carries the same
   Newest / Popular order as the feeds (plus Oldest where a source has it).
   Fixture traffic only; no source is contacted. */
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#3d6a76"/></svg>';
const post=(id,{character='hatsune_miku',artist='wlop',series='vocaloid'}={})=>({id,md5:'1234567890abcdef1234567890abcdef',image_width:400,image_height:520,
  file_url:`https://cdn.donmai.us/${id}.png`,preview_url:`https://cdn.donmai.us/${id}.png`,large_file_url:`https://cdn.donmai.us/${id}.png`,
  tag_string:'landscape scenery',tag_string_character:character,tag_string_artist:artist,tag_string_copyright:series,rating:'g',score:Number(id)});
const widths=(process.env.PINBOARD_TEST_WIDTHS||'360,390,1200').split(',').map(Number);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of widths){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({mode:'live',screen:'home',src:'danbooru',srcs:['danbooru','yandere'],bookmarks:[],bookmarkVersion:1}))});
  await page.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}
   const target=new URL(envelope?.pb_private===1?envelope.url:u.searchParams.get('u')),tags=target.searchParams.get('tags')||'';
   if(!envelope)requests.push({host:target.hostname,path:target.pathname,tags,page:target.searchParams.get('page')});
   let value=[];
   if(target.pathname.endsWith('counts/posts.json'))value={counts:{posts:6}};
   else if(/order:score|sort:score/.test(tags+target.href))value=[post(3),post(9),post(5)];
   else if(/order:id_asc/.test(tags))value=[post(1),post(2),post(4)];
   else value=[post(9),post(5),post(3)];
   return route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto(BASE+'/');await page.waitForFunction(()=>S.live.danbooru?.length&&!LOADING);
  const press=sel=>page.locator(sel).first()[mobile?'tap':'click']();
  const lastFetch=()=>requests.filter(r=>r.host==='danbooru.donmai.us'&&r.path==='/posts.json').at(-1);

  // --- Tags in post info are real buttons -----------------------------------
  await page.evaluate(()=>detail('danbooru:9'));
  await page.waitForSelector('.post-info .post-tag-inline');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.post-info .post-tag-inline')].map(n=>n.tagName)),['BUTTON','BUTTON','BUTTON'],'post info names are buttons');
  assert.match(await page.locator('.post-info .post-tag-inline').first().getAttribute('aria-label'),/Hatsune Miku feed on Danbooru/);
  // A plain tap on that name opens the tag's feed; Back returns to the post.
  await press('.post-info .post-tag-inline');
  await page.waitForSelector('.tag-feed-page .tag-feed-sort');
  assert.match(await page.locator('.tag-feed-title').innerText(),/Hatsune Miku/);
  await page.waitForFunction(()=>!document.querySelector('.tag-feed-loading'));
  assert.match(lastFetch().tags,/(?:^|\s)character:hatsune_miku(?:\s|$)/,'a metadata tag tap asks for the namespaced tag');
  await page.evaluate(()=>history.back());await page.waitForFunction(()=>postView()?.kind==='post');

  await page.evaluate(()=>menu('danbooru:9'));
  await page.waitForSelector('.post-tags-sheet .post-tag');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.post-tag-list .post-tag')].map(n=>n.tagName)),['BUTTON','BUTTON','BUTTON','BUTTON','BUTTON'],'every tag chip is a button');

  // Tapping a character tag opens that tag's own feed, prefixed for Danbooru.
  await press('.post-tag-list .post-tag');
  await page.waitForSelector('.tag-feed-page .tag-feed-sort');
  await page.waitForFunction(()=>!document.querySelector('.tag-feed-page')?.querySelector('.tag-feed-loading'));
  assert.match(await page.locator('.tag-feed-title').innerText(),/Hatsune Miku/);
  assert.match(lastFetch().tags,/(?:^|\s)character:hatsune_miku(?:\s|$)/,'tag feed asks for the namespaced tag');

  // --- One control: Newest <-> Popular ---------------------------------------
  const feedState=()=>page.evaluate(()=>{const f=TAG_FEEDS.get($('#sheet').dataset.tagFeedKey);return {order:f.order,cursor:f.cursor,page:f.page}});
  const settled=()=>page.waitForFunction(()=>{const f=TAG_FEEDS.get($('#sheet').dataset.tagFeedKey);return f&&!f.busy});
  assert.equal((await feedState()).order,'newest','Newest is the first order');
  assert.equal(await page.locator('.tag-feed-page .likes-sort').count(),1,'the tag feed shows exactly one order control');
  assert.match(await page.locator('.tag-feed-sort').innerText(),/Newest/);
  assert.equal(await page.locator('.tag-feed-sort').getAttribute('aria-pressed'),'false');
  await press('.tag-feed-sort');await settled();
  assert.equal((await feedState()).order,'popularity','one tap switches that control to Popular');
  assert.match(lastFetch().tags,/(?:^|\s)order:score(?:\s|$)/,'Popular is the source score order');
  assert.equal((await feedState()).cursor,null,'popularity never uses an ID cursor');
  assert.equal(await page.locator('.tag-feed-sort').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.tag-feed-sort').innerText(),/Popular/,'the same control now reads Popular');
  await press('.tag-feed-sort');await settled();
  assert.equal((await feedState()).order,'newest');
  assert.doesNotMatch(lastFetch().tags,/order:|sort:/,'Newest adds no sort token');
  assert.match(await page.locator('.tag-feed-sort').innerText(),/Newest/);
  // Back returns to the post info sheet, not out of the post.
  await page.evaluate(()=>history.back());await page.waitForSelector('.post-tags-sheet');

  // --- A General tag from the same sheet also opens a feed -------------------
  await page.evaluate(()=>{const b=[...document.querySelectorAll('.post-tag-list .post-tag')].find(n=>n.dataset.group==='general');b.click()});
  await page.waitForSelector('.tag-feed-page .tag-feed-sort');
  await page.waitForFunction(()=>!document.querySelector('.tag-feed-loading'));
  assert.match(lastFetch().tags,/(?:^|\s)landscape(?:\s|$)/,'general tags stay unprefixed');

  // --- Related art follows the same order ------------------------------------
  await page.evaluate(()=>{leaveTagFeed();$('#ov').classList.remove('show');S.forder={};RELATED_PAGES.clear();blankPostPage('danbooru:9')});
  await page.waitForSelector('.related-header .related-sort');
  assert.equal(await page.locator('.related-header .related-sort').getAttribute('data-order'),'newest');
  assert.match(await page.locator('.related-header .related-sort').innerText(),/Newest/);
  await page.waitForFunction(()=>[...document.querySelectorAll('.related-card')].length>0);
  const relatedSections=await page.evaluate(()=>[...document.querySelectorAll('.related-section')].map(s=>s.dataset.relatedTag));
  assert.ok(relatedSections.length>=3,'every related group renders a section');
  const beforeCalls=requests.length;
  await press('.related-header .related-sort');
  await page.waitForFunction(()=>document.querySelector('.related-header .related-sort')?.dataset.order==='popularity');
  await page.waitForFunction(()=>[...document.querySelectorAll('.related-card')].length>0);
  const popularCalls=requests.slice(beforeCalls).filter(r=>r.host==='danbooru.donmai.us'&&r.path==='/posts.json');
  assert.ok(popularCalls.length>=relatedSections.length,'each related section is re-requested');
  assert.ok(popularCalls.every(r=>/(?:^|\s)order:score(?:\s|$)/.test(r.tags)),'related art popularity is a real server order');
  // The choice is the same per-source setting the feeds use, so it is saved.
  assert.equal(await page.evaluate(()=>localStorage.getItem('pb2').includes('"forder":{"danbooru":"popularity"}')),true,'related order is persisted per source');
  // Leaving and re-opening the related page keeps Popular.
  await page.evaluate(()=>{leaveBlankPage();$('#ov').classList.remove('show');RELATED_PAGES.clear()});
  await page.evaluate(()=>blankPostPage('danbooru:9'));
  await page.waitForSelector('.related-header .related-sort');
  assert.equal(await page.locator('.related-header .related-sort').getAttribute('data-order'),'popularity','the saved order comes back');

  // Load more from a Popular related section keeps Popular in the full feed.
  await page.waitForFunction(()=>document.querySelector('.related-more'));
  await press('.related-more');
  await page.waitForSelector('.tag-feed-page .tag-feed-sort');
  assert.equal(await page.locator('.tag-feed-sort').getAttribute('aria-pressed'),'true','the tag feed inherits the related order');

  // --- Unsupported sources stay honest --------------------------------------
  const disabled=await page.evaluate(()=>{
    const state={id:'x',src:'animepictures',order:'newest'};
    const html=relatedHeaderHTML(state),wrap=document.createElement('div');wrap.innerHTML=html;
    const chip=wrap.querySelector('.related-sort');
    return {disabled:chip.disabled,title:chip.title,label:chip.textContent};
  });
  assert.equal(disabled.disabled,true,'no fake Popular control without a server order');
  assert.match(disabled.title,/not available/);
  assert.match(disabled.label,/Newest/);

  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: post info tags are buttons, the tag-feed control toggles Newest/Popular, related art honours the same order, unsupported sources stay disabled.`);
  await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
