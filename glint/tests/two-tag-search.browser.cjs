const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const query='1girl ice_cream',post=id=>({id,md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:780,tag_string:query,tag_string_character:'',tag_string_artist:'',tag_string_copyright:'',rating:'g'});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,1200]){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:860},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');localStorage.setItem('pb2',JSON.stringify({screen:'search',src:'danbooru',srcs:['danbooru','yandere'],mode:'live',bookmarks:[{id:'danbooru:1',savedAt:123}],bookmarkVersion:1}))});
  await page.route('**/*',async route=>{
   const r=route.request(),url=new URL(r.url());
   if(r.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="#366475"/><circle cx="380" cy="220" r="130" fill="#b3cbb3"/></svg>'});
   if(url.pathname!=='/api/proxy')return url.hostname==='127.0.0.1'?route.continue():route.abort();
   const target=new URL(url.searchParams.get('u')),tags=target.searchParams.get('tags')||'';if(/\.(jpe?g|png|webp|gif|avif)$/i.test(target.pathname))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780"><rect width="600" height="780" fill="#366475"/><circle cx="380" cy="220" r="130" fill="#b3cbb3"/></svg>'});requests.push(target);
   const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(target.pathname==='/counts/posts.json')return reply({counts:{posts:tags===query?21739:1000000}});
   if(target.pathname==='/tags.json')return reply([]);
   // Enforce Danbooru's actual token budget, including ordering metatags.
   if(tags.split(/\s+/).filter(Boolean).length>2)return reply({message:'You cannot search for more than 2 tags at a time.'},422);
   const cursor=target.searchParams.get('page')||'1';return reply(Array.from({length:40},(_,i)=>post((cursor==='1'?1000:960)-i)));
  });
  await page.goto('http://127.0.0.1:8000/?screen=search&q='+encodeURIComponent(query));
  await page.waitForFunction(()=>SEARCH?.query==='1girl ice_cream'&&!SEARCH.busy&&!SEARCH.error&&SEARCH_COUNT?.total===21739);
  assert.equal(await page.locator('.search-sort').innerText(),'Newest');assert.equal(await page.locator('.search-error').count(),0);assert.equal(await page.evaluate(()=>SRES.length),40);
  assert.equal(requests.filter(u=>u.pathname==='/posts.json').at(-1).searchParams.get('tags'),query);assert.equal(await page.locator('.search-count b').innerText(),'21,739 posts');
  assert.deepEqual(await page.evaluate(()=>SRES.slice(0,3).map(p=>p.sid)),['1000','999','998']);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>SRES.length===80&&!SEARCH.busy);const next=requests.filter(u=>u.pathname==='/posts.json').at(-1);assert.equal(next.searchParams.get('page'),'b961');assert.equal(next.searchParams.get('tags'),query);
  await page.evaluate(()=>window.scrollTo(0,0));
  // Non-default ordering is still real; the site limit is explained honestly.
  await page.locator('.search-sort')[mobile?'tap':'click']();await page.waitForSelector('.search-error');assert.match(await page.locator('.search-error').innerText(),/Popularity sorting uses an additional sort token/);
  await page.locator('.search-sort')[mobile?'tap':'click']();await page.waitForFunction(()=>SEARCH?.order==='newest'&&!SEARCH.busy&&!SEARCH.error&&SRES.length===40);assert.equal(requests.filter(u=>u.pathname==='/posts.json').at(-1).searchParams.get('tags'),query);assert.equal(await page.locator('#q').inputValue(),query);
  assert.equal(await page.evaluate(()=>S.bookmarks.length),1);assert.deepEqual(errors,[]);
  if(width===390){await page.waitForFunction(()=>[...document.querySelectorAll('#sres img')].some(i=>i.complete&&i.naturalWidth>0));await page.waitForTimeout(250);fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/two-tag-search-v62.png'})}
  console.log(`PASS ${width}px: strict two-token source accepts 1girl ice_cream, no hidden Newest tag, raw-ID cursor pagination still works, source total retained, non-default tag-limit errors explained and Newest recovers.`);await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
