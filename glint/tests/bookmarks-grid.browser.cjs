const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const root=process.cwd(),now=Date.now(),aspects=[.68,1.33,1.4,.85,1.5,1.15];
const pins=aspects.map((ratio,i)=>({id:`danbooru:${2001+i}`,src:'danbooru',sid:String(2001+i),c:'Danbooru',srcName:'Danbooru',t:'Saved post',r:i===1?'1.33':i===2?null:i===3?-1:undefined,width:600,height:Math.round(600*ratio),grid:'data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${Math.round(600*ratio)}"><rect width="100%" height="100%" fill="hsl(${i*53},36%,30%)"/><circle cx="390" cy="200" r="140" fill="hsl(${i*53+55},45%,70%)"/><path d="M0 1000V600L220 350 600 800V1000" fill="hsl(${i*53},40%,18%)"/></svg>`).toString('base64'),characters:[],series:[],artists:[],tags:[],rating:'g',detailsReady:true,fileInfoReady:true,sourceInfoReady:true,uploadInfoReady:true}));
const version=fs.readFileSync(root+'/app.js','utf8').match(/const APP_VERSION = "(v\d+)"/)[1],build=Number(version.slice(1)),previous='v'+(build-1);
const initial={bookmarkVersion:1,bookmarks:pins.map((p,i)=>({id:p.id,savedAt:now-i*1000})),pinCache:Object.fromEntries(pins.map(p=>[p.id,p])),srcs:['danbooru','yandere'],src:'danbooru',hidden:[],screen:'profile',bt:'Bookmarks',cols:2};
const counts=page=>page.locator('.bookmarks-library .grid>.col').evaluateAll(cols=>cols.map(col=>col.children.length));
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const width of [360,390,435,1200]){
  const context=await browser.newContext({viewport:{width,height:width<600?860:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(initial=>{localStorage.setItem('pb2',JSON.stringify(initial));localStorage.setItem('pb-swipe-hint-v22','1')},initial);
  await page.goto('http://127.0.0.1:8000/?screen=profile&tab=bookmarks');await page.waitForSelector('.bookmarks-library .art');
  assert.deepEqual(await counts(page),[3,3]);
  const geometry=await page.locator('.bookmarks-library .grid').evaluate(grid=>{const box=grid.getBoundingClientRect(),cols=[...grid.children].map(c=>c.getBoundingClientRect());return {width:box.width,left:cols[0].width,right:cols[1].width,gap:cols[1].left-cols[0].right,tops:cols.map(c=>c.top)}});
  assert.ok(Math.abs(geometry.left-geometry.right)<1&&geometry.left+geometry.right>geometry.width*.95);assert.ok(geometry.gap>=3&&geometry.gap<=5);assert.equal(geometry.tops[0],geometry.tops[1]);
  assert.ok(await page.locator('.bookmarks-library .art').evaluateAll(arts=>arts.every(art=>!/(?:NaN|Infinity|undefined)/.test(art.getAttribute('style'))&&art.getBoundingClientRect().height>30)));
  if(width===435){fs.mkdirSync('/home/user/.cache/pinboard',{recursive:true});await page.screenshot({path:'/home/user/.cache/pinboard/bookmarks-grid-v48.png'})}
  await page.evaluate(()=>{for(const p of Object.values(S.pinCache)){p.r=NaN;p.width=0;p.height=0}refreshBookmarks()});assert.deepEqual(await counts(page),[3,3]);
  await page.evaluate(()=>{S.cols=3;refreshBookmarks()});assert.deepEqual(await counts(page),[2,2,2]);
  assert.equal(await page.evaluate(()=>S.bookmarks.length),6);assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: six mixed/legacy saved images fill the entire two-column grid; malformed ratios cannot empty a column, three-column setting and saved data preserved.`);
 }
 // Reproduce the old cached v47 failure, then install the actual v48 worker.
 const context=await browser.newContext({viewport:{width:435,height:860},isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(20000);let upgraded=false;
 const app=fs.readFileSync(root+'/app.js','utf8'),start=app.indexOf('function masonry(list,fn,ex){'),end=app.indexOf('function pcx(',start);
 const oldMasonry='function masonry(list,fn,ex){const c=Array.from({length:S.cols},()=>({h:0,a:[]}));const add=ex===undefined?0:ex;list.forEach(p=>{const k=c.reduce((a,b)=>b.h<a.h?b:a);k.a.push(p);k.h+=p.r+add});const card=fn||pc;return `<div class="grid">${c.map(k=>`<div class="col">${k.a.map(card).join("")}</div>`).join("")}</div>`}\n';
 const oldApp=(app.slice(0,start)+oldMasonry+app.slice(end)).replaceAll(version,previous);
 const oldHTML=fs.readFileSync(root+'/index.html','utf8').replaceAll(version,previous).replaceAll('?v='+build,'?v='+(build-1)).replace('<script src="./pwa.js" defer></script>','');
 const oldWorker=`self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith((async()=>{const c=await caches.open('pinboard-${previous}-static');if(e.request.mode==='navigate')return (await c.match('/index.html'))||fetch(e.request);return (await c.match(e.request))||fetch(e.request)})())});`;
 fs.writeFileSync(root+'/_grid-cache-test-sw.js',oldWorker);
 await context.route('**/_grid-cache-test-sw.js',r=>r.fulfill({contentType:'text/javascript',headers:{'Cache-Control':'no-store','Service-Worker-Allowed':'/'},body:upgraded?fs.readFileSync(root+'/sw.js','utf8'):oldWorker}));
 await context.route('**/pwa.js',r=>r.fulfill({contentType:'text/javascript',body:'/* update manually controlled by regression test */'}));
 await page.goto('http://127.0.0.1:8000/offline.html');
 await page.evaluate(async({initial,oldHTML,oldApp,css,sources,previous,build})=>{
  localStorage.setItem('pb2',JSON.stringify(initial));localStorage.setItem('pb-swipe-hint-v22','1');
  const c=await caches.open('pinboard-'+previous+'-static');for(const [url,body,type] of [['/index.html',oldHTML,'text/html'],['/app.js?v='+(build-1),oldApp,'text/javascript'],['/sources.js?v='+(build-1),sources,'text/javascript'],['/styles.css?v='+(build-1),css,'text/css']])await c.put(url,new Response(body,{headers:{'Content-Type':type}}));
  const images=await caches.open('pinboard-img-v1');await images.put('/saved-cache-test.png',new Response('saved-image',{headers:{'Content-Type':'image/png'}}));
  await navigator.serviceWorker.register('/_grid-cache-test-sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;
 },{initial,oldHTML,oldApp,css:fs.readFileSync(root+'/styles.css','utf8'),sources:fs.readFileSync(root+'/sources.js','utf8'),previous,build});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.goto('http://127.0.0.1:8000/?screen=profile&tab=bookmarks');await page.waitForFunction(previous=>window.PB_APP_VERSION===previous,previous);assert.deepEqual(await counts(page),[6,0],'the stale build reproduces the screenshot');
 upgraded=true;fs.writeFileSync(root+'/_grid-cache-test-sw.js',fs.readFileSync(root+'/sw.js','utf8'));fs.utimesSync(root+'/_grid-cache-test-sw.js',new Date(),new Date(Date.now()+3000));await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update()});
 await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.getRegistration();
  const waiting=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Updated worker did not finish installing')),15000);
   const inspect=()=>{if(reg.waiting){clearTimeout(timer);resolve(reg.waiting)}else if(reg.installing)reg.installing.addEventListener('statechange',inspect,{once:true})};
   reg.addEventListener('updatefound',inspect,{once:true});inspect();
  });
  await new Promise(resolve=>{navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true});waiting.postMessage({type:'SKIP_WAITING'})});
 });
 await page.reload();await page.waitForFunction(version=>window.PB_APP_VERSION===version,version);assert.deepEqual(await counts(page),[3,3]);assert.equal(await page.evaluate(()=>S.bookmarks.length),6);
 assert.equal(await page.evaluate(async()=>!!(await (await caches.open('pinboard-img-v1')).match('/saved-cache-test.png'))),true);
 assert.equal(await page.evaluate(previous=>caches.has('pinboard-'+previous+'-static'),previous),false);
 console.log(`PASS cached upgrade: reproduced [6,0] on ${previous}, updated the real worker to ${version}, restored [3,3] and preserved bookmarks and image cache.`);
 await context.close();
}finally{await browser.close();fs.rmSync(root+'/_grid-cache-test-sw.js',{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
