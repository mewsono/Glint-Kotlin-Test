/* Native-account behaviour mocked end-to-end. NEVER writes a real source. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const BASE=process.env.PINBOARD_TEST_URL||'http://127.0.0.1:8000';
const artwork='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="820"><rect width="600" height="820" fill="#426975"/><circle cx="390" cy="260" r="145" fill="#d7bd8e"/><path d="M0 820V620L210 350 600 820" fill="#1e424c"/></svg>';
const post=id=>({id,md5:'1234567890abcdef1234567890abcdef',image_width:600,image_height:820,width:600,height:820,file:{url:'https://cdn.donmai.us/test.png',width:600,height:820,ext:'png'},preview:{url:'https://cdn.donmai.us/test.png'},sample:{url:'https://cdn.donmai.us/test.png'},tag_string:'landscape sky',tags:'landscape sky',file_url:'https://cdn.donmai.us/test.png',preview_url:'https://cdn.donmai.us/test.png',sample_url:'https://cdn.donmai.us/test.png',large_file_url:'https://cdn.donmai.us/test.png',rating:'g',created_at:'2026-01-02T12:00:00Z',file_ext:'png'});
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of (process.env.PINBOARD_TEST_WIDTHS||"360,390,435,1200").split(",").map(Number)){
  const mobile=width<600,context=await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage(),errors=[],calls=[],native=new Map();let mode='',delayRead=0,delayWrite=0;
  const accountSet=(host,user)=>{const k=host+'|'+user;if(!native.has(k))native.set(k,new Set());return native.get(k)};
  const numWrites=()=>calls.filter(c=>c.envelope?.mutation).length;
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('pb-swipe-hint-v22','1');if(!localStorage.getItem('__like_seeded')){localStorage.setItem('__like_seeded','1');localStorage.setItem('pb2',JSON.stringify({likes:['danbooru:101','yandere:201'],bookmarks:[],bookmarkVersion:1,src:'danbooru',srcs:['danbooru','yandere'],mode:'live'}))}});
  await page.route('**/*',async route=>{
   const req=route.request(),outer=new URL(req.url());if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:artwork});
   if(outer.pathname!=='/api/proxy')return outer.hostname==='127.0.0.1'?route.continue():route.abort();
   let envelope=null;try{envelope=JSON.parse(req.postData()||'null')}catch(e){}const u=new URL(envelope?.pb_private===1?envelope.url:outer.searchParams.get('u'));
   const body=envelope?.body||'',form=new URLSearchParams(body),basic=envelope?.headers?.Authorization,user=basic?Buffer.from(basic.replace(/^Basic /,''),'base64').toString().split(':')[0]:form.get('login')||u.searchParams.get('login')||u.searchParams.get('user_id')||envelope?.headers?.Cookie?.match(/user_id=(\d+)/)?.[1]||'public',liked=accountSet(u.hostname,user),tags=u.searchParams.get('tags')||'',id=String(form.get('id')||(body.startsWith('{')?JSON.parse(body).post_id:'')||u.searchParams.get('id')||u.searchParams.get('search[post_id]')||tags.match(/id:(\d+)/)?.[1]||u.pathname.match(/favorites\/(\d+)/)?.[1]||101);
   calls.push({outer,u,envelope,body,user,id});
   const reply=async(value,status=200,extra={})=>{const text=typeof value==='string'?value:JSON.stringify(value);try{return await route.fulfill({status:200,contentType:'application/json',headers:{'cache-control':'no-store'},body:envelope?.pb_private===1?JSON.stringify({pb_private_response:1,status,body:text,...extra}):text})}catch(e){/* expected if an account switch aborted this read */}};
   if(envelope?.mutation){
    if(mode==='403')return reply({message:'Permission denied <b>blocked</b> DUMMY_UI_KEY'},403);
    if(mode==='429')return reply({message:'Source rate limit; wait and recheck.'},429,{retry_after:'0.01'});
    const target=!(envelope.method==='DELETE'||form.get('score')==='0'||u.searchParams.get('s')==='delete');if(target)liked.add(id);else liked.delete(id);
    if(delayWrite)await new Promise(r=>setTimeout(r,delayWrite));if(mode==='network-after-write')return route.abort('failed');
    return reply(u.hostname==='gelbooru.com'?(target?'3':''):{post_id:+id},envelope.method==='DELETE'?204:200);
   }
   if(['/profile.json','/users/me.json'].includes(u.pathname))return reply({id:11,name:user});
   if(u.pathname==='/user/authenticate.json')return reply({success:true});
   if(u.pathname==='/counts/posts.json'){if(mode==='count-unknown')return reply({error:'unavailable'},503);const name=tags.match(/^fav:(\S+)/)?.[1]||user;return reply({counts:{posts:accountSet(u.hostname,name).size}})}
   if(u.pathname==='/post/vote.json'){const score=liked.has(id)?3:0;if(delayRead)await new Promise(r=>setTimeout(r,delayRead));return reply({success:true,vote:score})}
   if(u.pathname==='/favorites.json'&&u.searchParams.has('search[post_id]')){const who=u.searchParams.get('search[user_name]'),present=accountSet(u.hostname,who).has(id);if(delayRead)await new Promise(r=>setTimeout(r,delayRead));return reply(present?[{id:90000+Number(id),post_id:+id}]:[])}
   if(u.pathname==='/favorites.json')return reply([...liked].map(id=>post(+id)));
   if(u.pathname==='/post.xml')return reply('<posts count="0"></posts>');
   if(u.pathname==='/posts.json'||u.pathname==='/post.json'){
    let rows=[post(101),post(102)];const fav=tags.match(/(?:ordfav:|fav:|vote:3:)(\S+)/)?.[1];if(fav)rows=[...accountSet(u.hostname,fav)].map(id=>post(+id));const exact=tags.match(/(?:^|\s)id:(\d+)/)?.[1];if(exact)rows=rows.filter(p=>String(p.id)===exact);
    return reply(u.hostname==='e621.net'?{posts:rows}:rows);
   }
   if(u.pathname==='/index.php'){const uid=tags.match(/fav:(\d+)/)?.[1]||user;let rows=[...accountSet(u.hostname,uid)].map(id=>post(+id));if(tags.includes('id:'))rows=rows.filter(p=>String(p.id)===id);return reply({'@attributes':{count:rows.length},post:rows})}
   if(/^\/posts\/\d+\.json$/.test(u.pathname))return reply(post(+u.pathname.match(/\d+/)[0]));
   if(u.pathname==='/api/v1/json/search/images')return reply({images:[],total:0});
   return reply([]);
  });
  const press=selector=>page.locator(selector).first()[mobile?'tap':'click']();
  const waitState=liked=>page.waitForFunction(liked=>{const b=document.querySelector('.source-like');return b&&!b.disabled&&b.getAttribute('aria-pressed')===String(liked)},liked);
  const open=id=>page.evaluate(id=>detail(id),id);
  await page.goto(BASE+'/');await page.waitForSelector('.grid [data-id="danbooru:101"]');assert.equal(await page.evaluate(()=>PB_APP_VERSION),'v65');
  await press('.grid [data-id="danbooru:101"]');assert.equal(await page.locator('.post-actions button').count(),3);assert.equal(await page.locator('.source-like').count(),0);assert.equal(numWrites(),0,'legacy local hearts are NOT auto-uploaded');
  await press('.post-actions [data-a="bookmark"]');assert.equal(await page.evaluate(()=>S.bookmarks.length),1);assert.equal(numWrites(),0,'bookmark must not call a favourite writer');
  // Installation exposes capabilities without accidentally adding/removing a row.
  await press('.post-topbar [data-a="close"]');await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));await page.evaluate(()=>sourceSheet());const srcs=await page.evaluate(()=>[...S.srcs]);assert.equal(await page.locator('.source-card').count(),16);await press('.source-card[data-source="danbooru"] [data-a="sourceinfo"]');assert.deepEqual(await page.evaluate(()=>S.srcs),srcs);assert.match(await page.locator('.source-support').innerText(),/Boorusama reference/);assert.match(await page.locator('.source-support').innerText(),/not an encrypted vault/);
  await press('.source-support [data-a="editsrc2"]');await page.fill('#auUser','tester');await page.fill('#auKey','DUMMY_UI_KEY');await press('[data-a="testauth"]');await page.waitForFunction(()=>document.getElementById('auth-check-result')?.textContent.includes('Verified as tester'));
  assert.equal(await page.evaluate(()=>pbHasAuth('danbooru')),false,'checking draft credentials does not silently save');await press('[data-a="saveauth"]');assert.equal(await page.evaluate(()=>pbHasAuth('danbooru')),true);assert.ok(await page.evaluate(()=>pbAuth.danbooru.verifiedAt));
  delayRead=300;await open('danbooru:101');
  // Reading the account state no longer locks the heart: it shows the wait but
  // stays tappable, and it is still honest about not knowing yet.
  assert.equal(await page.locator('.source-like').isDisabled(),false,'the heart is tappable while the state is being read');assert.equal(await page.locator('.source-like').getAttribute('aria-busy'),'true');assert.equal(await page.locator('.source-like').getAttribute('aria-pressed'),'mixed','nothing is claimed before the source answers');
  await waitState(false);assert.equal(numWrites(),0,'old local pink heart is not remote truth');delayRead=0;
  await page.evaluate(()=>{window.__postImage=document.querySelector('.post-image');window.__postHistory=history.length});const before=numWrites();delayWrite=350;
  await page.evaluate(()=>{const b=document.querySelector('.source-like');b.click();b.click()});assert.equal(await page.locator('.source-like').isDisabled(),true);assert.equal(await page.locator('.source-like').getAttribute('aria-pressed'),'false','no optimistic Like before source confirmation');await waitState(true);delayWrite=0;assert.equal(numWrites(),before+1,'double tap has one native write');assert.equal(await page.evaluate(()=>window.__postImage===document.querySelector('.post-image')&&history.length===window.__postHistory),true);assert.equal(await page.evaluate(()=>S.bookmarks.length),1);assert.deepEqual(await page.evaluate(()=>S.likes),['danbooru:101','yandere:201']);
  if(width===390){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/source-like-v65.png'})}
  await press('.post-topbar [data-a="close"]');await page.waitForFunction(()=>!document.getElementById('ov').classList.contains('show'));await page.evaluate(()=>{S.screen='profile';S.bt='Likes';render()});await page.waitForFunction(()=>favState('danbooru').pins.length===1&&!favState('danbooru').busy);assert.match(await page.locator('.likes-head').innerText(),/1 liked post/);
  await open('danbooru:101');await waitState(true);await press('.source-like');await waitState(false);await page.waitForFunction(()=>favState('danbooru').total===0&&!favState('danbooru').busy);assert.match(await page.locator('.likes-head').innerText(),/0 liked posts/);assert.equal(calls.findLast(c=>c.envelope?.mutation).u.pathname,'/favorites/101.json');assert.equal(await page.evaluate(()=>S.bookmarks.length),1,'Unlike must not remove bookmark');
  // One tap while the account state is unknown does the whole job: read the
  // truth, then favourite. It never removes on that path.
  await page.evaluate(()=>{SOURCE_LIKES.clear()});await page.evaluate(()=>detail('danbooru:101'));
  await page.waitForFunction(()=>!document.querySelector('.source-like')?.getAttribute('aria-busy')||document.querySelector('.source-like').getAttribute('aria-busy')==='false');
  await page.evaluate(()=>{SOURCE_LIKES.clear();refreshPostLike(pin('danbooru:101'))});
  assert.equal(await page.locator('.source-like').getAttribute('aria-pressed'),'mixed','cleared memory starts unknown');
  let n=numWrites();await press('.source-like');
  await page.waitForFunction(()=>{const b=document.querySelector('.source-like');return b&&b.getAttribute('aria-pressed')==='mixed'&&b.getAttribute('aria-busy')==='true'}).catch(()=>{});
  await waitState(true);assert.equal(numWrites(),n+1,'one tap after an unknown state writes exactly once');
  assert.equal(accountSet('danbooru.donmai.us','tester').has('101'),true);
  // A tap that lands while the read is still running is remembered, not dropped.
  // It only ever adds: a second tap on an already-favourited post must not
  // silently remove something the user could not see yet.
  await page.evaluate(()=>{SOURCE_LIKES.clear();refreshPostLike(pin('danbooru:101'))});
  delayRead=250;n=numWrites();
  await page.evaluate(()=>{const b=document.querySelector('.source-like');b.click();setTimeout(()=>document.querySelector('.source-like')?.click(),40)});
  await page.waitForFunction(()=>{const b=document.querySelector('.source-like');return b&&b.getAttribute('aria-busy')!=='true'});
  await page.waitForFunction(()=>/Already in your/.test(document.getElementById('toast')?.textContent||'')).catch(()=>{});
  await page.waitForTimeout(400);delayRead=0;
  assert.equal(numWrites(),n,'a queued tap on an already-favourite post writes nothing');
  await waitState(true);
  // …and on a post that is not favourited yet it adds, in one write.
  await page.evaluate(()=>detail('danbooru:102'));
  await page.waitForFunction(()=>{const b=document.querySelector('.source-like');return b&&b.getAttribute('aria-pressed')==='mixed'||b&&b.getAttribute('aria-busy')!=='true'});
  await waitState(false);
  await page.evaluate(()=>{SOURCE_LIKES.clear();refreshPostLike(pin('danbooru:102'))});
  delayRead=250;n=numWrites();
  await page.evaluate(()=>{const b=document.querySelector('.source-like');b.click();setTimeout(()=>document.querySelector('.source-like')?.click(),40)});
  await page.waitForFunction(()=>{const b=document.querySelector('.source-like');return b&&b.getAttribute('aria-pressed')==='true'&&b.getAttribute('aria-busy')!=='true'});
  delayRead=0;
  assert.equal(numWrites(),n+1,'the queued tap adds it with exactly one write');
  // put 102 back so the rest of the run sees the same account contents
  await press('.source-like');await waitState(false);
  await page.evaluate(()=>detail('danbooru:101'));await waitState(true);
  // Moebooru: the login a vote read needs is cached, so a heart tap is not a
  // second slow login every time (yande.re / Konachan).
  await page.evaluate(fixture=>{pbSetAuth('yandere',{login:'moe',passHash:'a'.repeat(40),hashVersion:2});const row=normPin(PB_SOURCES.yandere.map(fixture),'yandere');S.pinCache[row.id]=row;window.__moeId=row.id;detail(row.id)},post(201));
  await waitState(false);
  const moeAuths=()=>calls.filter(c=>c.u.pathname==='/user/authenticate.json'&&c.u.hostname==='yande.re').length;
  const logins=moeAuths();assert.ok(logins>=1,'the first read verifies the account');
  await page.evaluate(()=>{SOURCE_LIKES.clear();refreshPostLike(pin(window.__moeId))});
  n=numWrites();await press('.source-like');await waitState(true);
  assert.equal(moeAuths(),logins,'a later read/write reuses the cached login');
  assert.equal(numWrites(),n+1);
  await page.evaluate(()=>{pbSetAuth('danbooru',{login:'tester',apiKey:'DUMMY_UI_KEY'});detail('danbooru:101')});
  await page.waitForFunction(()=>{const b=document.querySelector('.source-like');return b&&b.getAttribute('aria-busy')!=='true'&&b.getAttribute('aria-pressed')!=='mixed'});
  // Permission failure: no fake pink, no replay, no HTML/secret injection.
  // Start from "not favourited" so the denied write is an attempt to add.
  if(await page.evaluate(()=>document.querySelector('.source-like')?.getAttribute('aria-pressed')==='true')){await press('.source-like');await waitState(false)}
  mode='403';n=numWrites();await press('.source-like');await page.waitForFunction(()=>!!document.querySelector('.post-like-feedback [data-a="likestatus"]'));assert.equal(numWrites(),n+1);assert.equal(await page.locator('.source-like').isDisabled(),false,'a denied write leaves a tappable heart, not a dead end');assert.equal(await page.locator('.post-like-feedback b').count(),0);assert.doesNotMatch(await page.locator('.post-like-feedback').innerText(),/DUMMY_UI_KEY/);assert.equal(accountSet('danbooru.donmai.us','tester').has('101'),false);mode='';await press('[data-a="likestatus"]');await waitState(false);
  mode='429';n=numWrites();await press('.source-like');await page.waitForSelector('.post-like-feedback [data-a="likestatus"]');assert.equal(numWrites(),n+1);mode='';await press('[data-a="likestatus"]');await waitState(false);
  // Timeout / network failure after commit needs a READ, never a repeated POST.
  mode='network-after-write';n=numWrites();await press('.source-like');await page.waitForSelector('.post-like-feedback [data-a="likestatus"]');assert.match(await page.locator('.post-like-feedback').innerText(),/may have reached the website/);assert.equal(accountSet('danbooru.donmai.us','tester').has('101'),true);assert.equal(numWrites(),n+1);mode='';await press('[data-a="likestatus"]');await waitState(true);assert.equal(numWrites(),n+1);await page.waitForFunction(()=>favState('danbooru').total===1&&favState('danbooru').pins.length===1&&!favState('danbooru').busy);
  // A late old-account response cannot recolour the new account's heart.
  delayRead=500;await open('danbooru:101');await page.evaluate(()=>pbSetAuth('danbooru',{login:'bob',apiKey:'BOB_UI_KEY'}));await waitState(false);await page.waitForTimeout(550);assert.equal(await page.locator('.source-like').getAttribute('aria-pressed'),'false');delayRead=0;
  // An already-sent request can finish on the old account, but it cannot claim
  // success for another account selected while it was in flight.
  await page.evaluate(()=>{PB_LAST_WRITE.danbooru=0});delayWrite=500;n=numWrites();await press('.source-like');await page.waitForFunction(()=>document.querySelector('.source-like')?.getAttribute('aria-busy')==='true');await page.waitForTimeout(50);await page.evaluate(()=>pbSetAuth('danbooru',{login:'carol',apiKey:'CAROL_UI_KEY'}));await waitState(false);await page.waitForTimeout(550);assert.equal(numWrites(),n+1);assert.equal(accountSet('danbooru.donmai.us','carol').has('101'),false);assert.equal(await page.locator('.source-like').getAttribute('aria-pressed'),'false');delayWrite=0;
  await page.evaluate(()=>pbSetAuth('danbooru',null));assert.equal(await page.locator('.source-like').count(),0);assert.equal(await page.locator('.post-actions button').count(),3);assert.equal(await page.evaluate(()=>S.bookmarks.length),1);assert.deepEqual(await page.evaluate(()=>S.likes),['danbooru:101','yandere:201']);
  // A post reached only from Profile Likes must survive cache invalidation,
  // but its old account's heart must disappear immediately on removal.
  await page.evaluate(p=>{pbSetAuth('danbooru',{login:'tester',apiKey:'DUMMY_UI_KEY'});const row=normPin(PB_SOURCES.danbooru.map(p,PB_SOURCES.danbooru),'danbooru');favState('danbooru').pins=[row];detail(row.id)},post(555));await waitState(false);await page.evaluate(()=>pbSetAuth('danbooru',null));assert.equal(await page.locator('.source-like').count(),0);assert.equal(await page.evaluate(()=>!!pin('danbooru:555')),true);assert.equal(await page.evaluate(()=>S.bookmarks.length),1);
  // The same protection is needed while a settings sheet temporarily replaces
  // that FAV-only post: resolve its parent from the non-secret history entry.
  await page.evaluate(p=>{pbSetAuth('danbooru',{login:'tester',apiKey:'DUMMY_UI_KEY'});const row=normPin(PB_SOURCES.danbooru.map(p,PB_SOURCES.danbooru),'danbooru');favState('danbooru').pins=[row];detail(row.id)},post(556));await waitState(false);await page.evaluate(()=>sourceEditSheet('danbooru'));await page.fill('#auUser','editor_user');await page.fill('#auKey','EDITOR_UI_KEY');await press('[data-a="saveauth"]');await waitState(false);assert.equal(await page.evaluate(()=>postView().id),'danbooru:556');assert.equal(await page.evaluate(()=>!!pin('danbooru:556')),true);assert.equal(await page.evaluate(()=>S.bookmarks.length),1);
  // Username changes cannot retain another account's API key/session.
  await page.evaluate(()=>{pbSetAuth('danbooru',{login:'tester',apiKey:'DUMMY_UI_KEY'});sourceEditSheet('danbooru')});await page.fill('#auUser','another');await press('[data-a="saveauth"]');assert.equal(await page.evaluate(()=>pbAuth.danbooru.apiKey), '');assert.equal(await page.evaluate(()=>pbCanLike('danbooru')),false);
  if(width===390){
   // All current presets have a truthful feature/setup sheet; unsupported
   // native cookie/token flows are documented, not fake account forms.
   for(const id of await page.evaluate(()=>Object.keys(PB_SOURCES))){await page.evaluate(id=>sourceInfoSheet(id),id);assert.ok((await page.locator('.source-support').innerText()).includes('Boorusama reference'));assert.equal(await page.locator('.source-support').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,id)}
   await page.evaluate(()=>sourceEditSheet('eshuushuu'));assert.equal(await page.locator('#auUser,#auKey,[data-a="testauth"]').count(),0);assert.match(await page.locator('#source-account-form').innerText(),/not implemented here/);
   await page.evaluate(()=>sourceEditSheet('derpibooru'));assert.equal(await page.locator('#auUser').count(),0);await page.fill('#auKey','PHILO_UI_KEY');await press('[data-a="testauth"]');await page.waitForFunction(()=>document.getElementById('auth-check-result')?.textContent.includes('does not verify a logged-in identity'));await press('[data-a="saveauth"]');assert.equal(await page.evaluate(()=>pbHasAuth('derpibooru')),true);assert.equal(await page.evaluate(()=>pbCanLike('derpibooru')),false);
   await page.evaluate(()=>sourceEditSheet('gelbooru'));await page.locator('details').last().locator('summary').click();await page.fill('#auBundle','api_key=GEL_UI_KEY&user_id=27');await press('[data-a="parseauth"]');assert.equal(await page.inputValue('#auUser'),'27');assert.equal(await page.inputValue('#auKey'),'GEL_UI_KEY');await press('[data-a="saveauth"]');assert.equal(await page.evaluate(()=>pbHasAuth('gelbooru')),true);assert.equal(await page.evaluate(()=>pbCanLike('gelbooru')),false);
   await page.evaluate(()=>{sourceSheet();document.getElementById('toast').style.display='none'});await page.screenshot({path:'/home/user/.cache/pinboard/source-installer-v65.png'});
   // Post source, not Home source, owns the writer and scoped state.
   for(const id of ['yandere','konachan','sakuga','e621','gelbooru']){
    await page.evaluate(({id,p})=>{const a=id==='e621'?{login:'tester',apiKey:'E621_UI_KEY'}:id==='gelbooru'?{login:'27',apiKey:'GEL_UI_KEY',session:'GEL_COOKIE_0123456789'}:{login:'tester',passHash:'a'.repeat(40),hashVersion:2};pbSetAuth(id,a);const row=PB_SOURCES[id].map(p,PB_SOURCES[id]);const value=normPin(row,id);S.pinCache[value.id]=value;S.src='danbooru';detail(value.id)}, {id,p:post(201)});await waitState(false);const start=numWrites();await press('.source-like');await waitState(true);assert.equal(numWrites(),start+1);const c=calls.findLast(c=>c.envelope?.mutation);assert.equal(c.u.hostname,id==='e621'?'e621.net':id==='gelbooru'?'gelbooru.com':id==='sakuga'?'www.sakugabooru.com':id==='konachan'?'konachan.net':'yande.re');assert.equal(await page.evaluate(()=>S.src),'danbooru');assert.equal(await page.evaluate(()=>S.bookmarks.length),1);
   }
   // A missing native total is unknown even when an empty page is complete.
   mode='count-unknown';await page.evaluate(()=>{history.replaceState({...history.state,[POST_VIEW_KEY]:{kind:'app'}},'');close();pbSetAuth('danbooru',{login:'empty',apiKey:'EMPTY_UI_KEY'});S.screen='profile';S.bt='Likes';render();loadFavorites(true)});await page.waitForFunction(()=>favState('danbooru').done&&favState('danbooru').countChecked);assert.match(await page.locator('.likes-head').innerText(),/Total unavailable/);assert.doesNotMatch(await page.locator('.likes-head').innerText(),/0 liked/);mode='';
  }
  // No new request exposes any secret in its address; writes are private POST.
  for(const c of calls)if(c.envelope){assert.equal(c.envelope.pb_private,1);for(const key of ['DUMMY_UI_KEY','BOB_UI_KEY','CAROL_UI_KEY','PHILO_UI_KEY','GEL_UI_KEY'])assert.ok(!c.outer.href.includes(key));if(c.envelope.mutation)assert.ok(['POST','DELETE','GET'].includes(c.envelope.method))}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: remote-only confirmed Like/Unlike; independent bookmarks/legacy data; native Profile Likes/count; double taps, denied/rate/network uncertainty, recheck, post/account races, private URLs and setup UI.`);
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
