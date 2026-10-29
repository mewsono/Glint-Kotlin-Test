const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const post=(id,missing=false)=>({id,tags:'tag_a tag_b',tag_string:'tag_a tag_b',rating:'s',score:id===750?100:id===950?10:1,created_at:'2026-10-01T12:00:00Z',...missing?{}:{md5:'1234567890abcdef1234567890abcdef',width:600,height:780,image_width:600,image_height:780,preview_url:'https://cdn.donmai.us/header-test-'+id+'.png',file_url:'https://cdn.donmai.us/header-test-'+id+'.png',file:{width:600,height:780,url:'https://cdn.donmai.us/header-test.png'},preview:{url:'https://cdn.donmai.us/header-test.png'}}});
const filter=tags=>tags.split(/\s+/).filter(t=>! /^(order|sort):/.test(t)).join(' '),total=q=>q==='tag_a'?10:q==='tag_a tag_b'?3:q==='zero_tag'?0:q==='slow_count'?10000:q==='large_query'?98765:16543;
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,435,1200]){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:860},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];let countFail=true;
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({screen:'search',src:'yandere',srcs:['danbooru','yandere','e621'],hidden:[],bookmarks:[{id:'danbooru:1',savedAt:123}],bookmarkVersion:1}))});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(req.resourceType()==='image'){const id=Number(u.pathname.match(/(\d+)\.png$/)?.[1]||750),h=id%360;return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="hsl(${h},35%,30%)"/><circle cx="390" cy="220" r="140" fill="hsl(${h+50},45%,70%)"/><path d="M0 780V590L240 350 600 780" fill="hsl(${h},40%,17%)"/></svg>`})}
   if(u.pathname!=='/api/proxy')return u.hostname==='127.0.0.1'?route.continue():route.abort();
   const target=new URL(u.searchParams.get('u')),tags=target.searchParams.get('tags')||'',q=filter(tags);requests.push(target);
   const reply=async(body,status=200,type='application/json')=>{try{await route.fulfill({status,contentType:type,body:typeof body==='string'?body:JSON.stringify(body)})}catch(e){}};
   if(target.pathname==='/post.xml'||target.pathname==='/counts/posts.json'){
    if(q==='slow_count')await delay(1000);
    if(q==='count_error'&&countFail)return reply({message:'Source temporarily unavailable'},500);
    if(q==='count_timeout')return;
    const n=total(q);return target.pathname==='/post.xml'?reply(`<posts count="${n}"></posts>`,200,'application/xml'):reply({counts:{posts:n}});
   }
   if(/\/(tag|tags)\.json$/.test(target.pathname))return reply([]);
   const popular=/order:score|sort:score/.test(tags);let posts=q==='zero_tag'?[]:(popular?[750,950,850]:[950,850,750]).map(id=>post(id));
   if(q==='tag_a')posts.push(...Array.from({length:7},(_,i)=>post(700-i,true)));
   return reply(target.hostname==='e621.net'?{posts}:posts);
  });
  const cdp=mobile?await context.newCDPSession(page):null;
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:i+1,x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}))});
  const input=()=>page.locator('#q'),press=async selector=>{const e=page.locator(selector).first();if(!mobile)return e.click();await e.waitFor({state:'visible'});const r=await e.boundingBox();await touch('touchStart',[{x:r.x+r.width/2,y:r.y+r.height/2}]);await touch('touchEnd',[]);await page.waitForTimeout(50)},count=()=>page.locator('.search-count b').innerText();
  const wait=async(q,n,source='yandere')=>page.waitForFunction(({q,n,source})=>SEARCH?.query===q&&SEARCH.source===source&&!SEARCH.busy&&!SEARCH.error&&SEARCH_COUNT?.total===n&&!SEARCH_COUNT.busy,{q,n,source});
  const chooseHome=async source=>{await press('[data-a="nav"][data-v="home"]');await press(`.srctabs [data-v="${source}"]`);await press('[data-a="nav"][data-v="search"]')};
  await page.goto('http://127.0.0.1:8000/?screen=search');await page.waitForFunction(()=>SEARCH_COUNT?.total===16543&&!SEARCH_COUNT.busy);
  assert.equal(await count(),'16,543 posts');assert.equal(await page.locator('.search-source').innerText(),'Searching on yande.re');
  assert.equal(await page.locator('.search-head .srctabs,.search-head [data-a="src"],.search-head [data-a="addsrc"]').count(),0);
  assert.equal(await page.locator('.search-sort').innerText(),'Newest');
  await input().fill('tag_a');await wait('tag_a',10);assert.equal(await count(),'10 posts');assert.equal(await page.evaluate(()=>SRES.length),3,'full query total includes matching records without usable previews');
  await page.evaluate(()=>window.__countInput=document.getElementById('q'));
  await input().fill('tag_a tag_b');assert.notEqual(await count(),'10 posts','do not keep a stale single-tag count while the intersection is loading');await wait('tag_a tag_b',3);assert.equal(await count(),'3 posts');
  assert.equal(await input().evaluate(e=>document.activeElement===e),true);assert.equal(await page.evaluate(()=>window.__countInput===document.getElementById('q')),true);
  assert.ok(requests.some(u=>u.pathname==='/post.xml'&&u.searchParams.get('tags')==='tag_a tag_b'));
  const countCalls=requests.filter(u=>u.pathname==='/post.xml').length;
  await press('.search-sort');await page.waitForFunction(()=>SEARCH?.order==='popularity'&&!SEARCH.busy);
  assert.equal(await page.locator('.search-sort').innerText(),'Popularity');assert.equal(await page.locator('.search-sort').getAttribute('aria-pressed'),'true');assert.equal(await count(),'3 posts');
  assert.equal(requests.filter(u=>u.pathname==='/post.xml').length,countCalls,'sorting does not change or re-fetch the tag-intersection total');
  assert.match(requests.filter(u=>u.pathname==='/post.json').at(-1).searchParams.get('tags'),/^tag_a tag_b order:score$/);assert.deepEqual(await page.evaluate(()=>SRES.map(p=>p.sid)),['750','950','850']);assert.equal(await page.evaluate(()=>SEARCH.cursor),null);
  await press('.search-sort');await page.waitForFunction(()=>SEARCH?.order==='newest'&&!SEARCH.busy);assert.deepEqual(await page.evaluate(()=>SRES.map(p=>p.sid)),['950','850','750']);assert.equal(await count(),'3 posts');
  // Refine the query and retain the selected popularity order across refinements.
  await press('.search-sort');await page.waitForFunction(()=>SEARCH?.order==='popularity'&&!SEARCH.busy);await input().fill('large_query');await wait('large_query',98765);assert.equal(await page.evaluate(()=>SEARCH.order),'popularity');assert.equal(await count(),'98,765 posts');
  const geometry=await page.locator('.search-summary').evaluate(row=>{const a=row.querySelector('.search-count').getBoundingClientRect(),b=row.querySelector('.search-sort').getBoundingClientRect();return {left:a.left,right:a.right,sortLeft:b.left,sortRight:b.right,width:document.documentElement.clientWidth}});assert.ok(geometry.left>=0&&geometry.right<=geometry.sortLeft&&geometry.sortRight<=geometry.width);
  if(width===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/search-summary-v61.png'})}
  await input().fill('zero_tag');await wait('zero_tag',0);assert.equal(await count(),'0 posts');
  if(width===390){
   await input().fill('slow_count');await page.waitForFunction(()=>SEARCH_COUNT?.query==='slow_count'&&SEARCH_COUNT.running);await input().fill('tag_a tag_b');await wait('tag_a tag_b',3);await delay(800);assert.equal(await count(),'3 posts');
   await input().fill('count_error');await page.waitForFunction(()=>SEARCH_COUNT?.query==='count_error'&&!SEARCH_COUNT.busy&&SEARCH&&!SEARCH.busy);assert.equal(await count(),'Total unavailable');assert.ok(await page.locator('#sres .grid').count());countFail=false;await input().press('Enter');await wait('count_error',16543);
  }
  await chooseHome('danbooru');await input().fill('tag_a tag_b');await wait('tag_a tag_b',3,'danbooru');assert.equal(await page.locator('.search-source').innerText(),'Searching on Danbooru');assert.equal(await page.locator('.search-sort').innerText(),'Newest');
  if(width===390){await chooseHome('e621');await input().fill('tag_a tag_b');await page.waitForFunction(()=>SEARCH?.source==='e621'&&!SEARCH.busy&&SEARCH_COUNT&&!SEARCH_COUNT.busy);assert.equal(await count(),'Total unavailable');assert.equal(await page.locator('.search-source').innerText(),'Searching on e621');assert.equal(requests.some(u=>u.hostname==='e621.net'&&u.pathname==='/counts/posts.json'),false)}
  assert.equal(await page.evaluate(()=>S.bookmarks.length),1);await page.evaluate(()=>document.documentElement.dataset.theme='light');assert.equal(await page.locator('.search-head').evaluate(e=>e.scrollWidth<=e.clientWidth),true);assert.deepEqual(errors,[]);
  // Horizontal gestures in Search must not silently select a different source.
  if(mobile){const selected=await page.evaluate(()=>S.src);await touch('touchStart',[{x:280,y:350}]);for(let x=250;x>=100;x-=30)await touch('touchMove',[{x,y:350}]);await touch('touchEnd',[]);await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>S.src),selected);assert.equal(await page.locator('#ov.show').count(),0)}
  if(width===360){await page.clock.install();await input().fill('count_timeout');await page.clock.fastForward(400);await page.waitForFunction(()=>SEARCH_COUNT?.query==='count_timeout'&&SEARCH_COUNT.running);await page.clock.fastForward(15500);await page.waitForFunction(()=>SEARCH_COUNT&&!SEARCH_COUNT.busy);assert.equal(await count(),'Total unavailable')}
  console.log(`PASS ${width}px: source tabs removed; Home-source caption; exact query totals 10→3/zero and not loaded-image count; genuine newest/popularity order, stable count on sort, large-count layout, retained focus, no hidden source swipe, safe unavailable/stale/timeout counts and saved data preserved.`);await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
