/* No real network: shared Node core and both deployment entry points. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const core=require('../proxy-core.cjs');
(async()=>{
 const original=global.fetch,calls=[];let upstream=()=>new Response('{"post_id":101}',{status:200,headers:{'content-type':'application/json','set-cookie':'private-cookie=DO_NOT_FORWARD'}});
 global.fetch=async(url,opts)=>{calls.push({url:String(url),opts});return upstream(url,opts)};
 try{
  const envelope=(extra={})=>({pb_private:1,url:'https://danbooru.donmai.us/favorites.json',method:'POST',headers:{Authorization:'Basic DUMMY_SECRET','Content-Type':'application/json'},body:'{"post_id":101}',mutation:true,...extra});
  const check=r=>{assert.equal(r.headers['cache-control'],'no-store, private');assert.equal(r.headers['set-cookie'],undefined);return JSON.parse(r.body.toString())};
  let r=await core.handleProxy('POST','https://danbooru.donmai.us/favorites.json',envelope()),j=check(r);assert.equal(j.pb_private_response,1);assert.equal(j.status,200);assert.equal(calls.length,1);assert.equal(calls[0].opts.method,'POST');assert.equal(calls[0].opts.body,'{"post_id":101}');assert.equal(new Headers(calls[0].opts.headers).get('authorization'),'Basic DUMMY_SECRET');assert.equal(calls[0].opts.redirect,'manual');assert.equal(new Headers(calls[0].opts.headers).get('cache-control'),'no-cache, no-store');
  upstream=()=>new Response(null,{status:204});r=await core.handleProxy('POST','',envelope({url:'https://e621.net/favorites/101.json',method:'DELETE',body:null}));assert.equal(check(r).status,204);assert.equal(calls.at(-1).opts.method,'DELETE');assert.equal(calls.at(-1).url,'https://e621.net/favorites/101.json');
  upstream=()=>new Response('',{status:302,headers:{location:'https://evil.example/?stolen=secret'}});const n=calls.length;r=await core.handleProxy('POST','',envelope());assert.equal(check(r).status,302);assert.equal(calls.length,n+1,'private redirects MUST NOT be followed');
  const legacyCount=calls.length;const legacy=await core.handleProxy('GET','https://danbooru.donmai.us/posts.json?api_key=DUMMY_SECRET',null);assert.equal(legacy.statusCode,302);assert.equal(calls.length,legacyCount+1,'legacy key-bearing GETs must not forward credentials through redirects either');
  upstream=()=>new Response('3');r=await core.handleProxy('POST','',envelope({url:'https://gelbooru.com/public/addfav.php?id=101',method:'GET',body:null,headers:{Cookie:'user_id=27; pass_hash=DUMMY_COOKIE_SECRET'}}));assert.equal(check(r).body,'3');assert.equal(calls.at(-1).opts.method,'GET');assert.equal(new Headers(calls.at(-1).opts.headers).get('cookie'),'user_id=27; pass_hash=DUMMY_COOKIE_SECRET');
  const bads=[{url:'https://evil.example/favorites.json'},{url:'http://danbooru.donmai.us/favorites.json'},{url:'https://danbooru.donmai.us:444/favorites.json'},{url:'https://a:b@danbooru.donmai.us/favorites.json'},{url:'https://danbooru.donmai.us/users/1.json',method:'DELETE'},{method:'PATCH'},{headers:{Cookie:'secret'}},{headers:{Authorization:'Basic x\r\nEvil: yes'}}];
  for(const bad of bads){const n=calls.length;assert.equal((await core.handleProxy('POST','',envelope(bad))).statusCode,502);assert.equal(calls.length,n,'invalid target/method/header must fail before network')}
  let reads=0;upstream=()=>{reads++;return new Response('{"counts":{"posts":17}}')};for(let k=0;k<2;k++)check(await core.handleProxy('POST','',envelope({url:'https://danbooru.donmai.us/counts/posts.json?tags=fav:alice',method:'GET',body:null,mutation:false})));assert.equal(reads,2,'account reads have no shared cache');
  upstream=()=>new Response('bad',{status:429,headers:{'retry-after':'60'}});assert.equal(check(await core.handleProxy('POST','',envelope())).retry_after,'60');
  upstream=()=>{throw Error('network error URL contains DUMMY_SECRET')};const start=calls.length;r=await core.handleProxy('POST','',envelope());assert.equal(r.statusCode,502);assert.equal(calls.length,start+1);assert.doesNotMatch(r.body.toString(),/DUMMY_SECRET/);
  upstream=()=>new Response('small',{headers:{'content-length':String(4*1024*1024+1)}});assert.equal((await core.handleProxy('POST','',envelope())).statusCode,502);
  assert.equal((await core.handleProxy('POST','', 'x'.repeat(128*1024+1))).statusCode,413);
  assert.equal((await core.handleProxy('OPTIONS','',null)).statusCode,204);
  // Entry points must preserve the core's body, method and private headers.
  upstream=()=>new Response('{"success":true}',{headers:{'content-type':'application/json'}});
  const netlify=require('../netlify/functions/proxy.js');r=await netlify.handler({httpMethod:'POST',queryStringParameters:{u:'https://danbooru.donmai.us/favorites.json'},body:Buffer.from(JSON.stringify(envelope())).toString('base64'),isBase64Encoded:true});assert.equal(r.headers['cache-control'],'no-store, private');assert.equal(JSON.parse(Buffer.from(r.body,'base64')).pb_private_response,1);
  const {default:vercel}=await import(pathToFileURL(path.join(__dirname,'../api/proxy.js')).href);const res={status(n){this.statusCode=n;return this},setHeader(k,v){this.headers=this.headers||{};this.headers[k]=v;return this},send(b){this.body=b;return this}};await vercel({method:'POST',query:{u:'https://danbooru.donmai.us/favorites.json'},body:envelope()},res);assert.equal(check(res).pb_private_response,1);assert.equal(res.statusCode,200);
  console.log('PASS: Node/Vercel/Netlify native verbs, bodies, auth/form/cookie forwarding; no private redirects/cache/retries/Set-Cookie/log echoes; bounded bodies, allow-listed HTTPS targets and account routes. No real network used.');
 }finally{global.fetch=original}
})().catch(e=>{console.error(e);process.exitCode=1});
