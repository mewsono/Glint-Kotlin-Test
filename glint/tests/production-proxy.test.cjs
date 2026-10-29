/* Serverless production boundaries. No real network. */
const assert=require('node:assert/strict'),core=require('../proxy-core.cjs');
(async()=>{const original=global.fetch;let calls=[];try{
 global.fetch=async(url,opts)=>{calls.push({url,opts});return new Response('<script>localStorage.getItem("pb-auth")</script>',{headers:{'content-type':'text/html'}})};
 const html=await core.handleProxy('GET','https://danbooru.donmai.us/',null);
 assert.equal(html.statusCode,200);assert.match(html.headers['content-security-policy'],/sandbox/);assert.match(html.headers['content-security-policy'],/default-src 'none'/);assert.equal(html.headers['x-content-type-options'],'nosniff');
 for(const [target,body] of [['https://danbooru.donmai.us/posts/101.json','{}'],['https://e621.net/favorites.json','{}'],['https://rule34.paheal.net/graphql',JSON.stringify({query:'mutation Delete { post(id:1) }'})],['https://rule34.paheal.net/graphql',JSON.stringify({query:'query Safe { post { id } } mutation Bad { post { id } }'})]]){
  const before=calls.length;assert.equal((await core.handleProxy('POST',target,body)).statusCode,502);assert.equal(calls.length,before,'unscoped POST actions blocked before network');
 }
 const before=calls.length;assert.equal((await core.handleProxy('GET','https://gelbooru.com/public/addfav.php?id=101',null)).statusCode,502);assert.equal(calls.length,before);
 assert.throws(()=>core.validateAction('https://gelbooru.com/public/addfav.php?id=101','GET',false));
 assert.throws(()=>core.safeHeaders({Authorization:'Basic DUMMY'},'cdn.donmai.us'));
 assert.equal((await core.handleProxy('POST','https://rule34.paheal.net/graphql',JSON.stringify({query:'query Search { post { id } }'}))).statusCode,200);
 const signal=calls.at(-1).opts.signal;assert.ok(signal instanceof AbortSignal);
 // Advertised and actual streaming sizes are both bounded to fit serverless envelopes.
 global.fetch=async()=>new Response('x',{headers:{'content-length':String(4*1024*1024)}});
 assert.equal((await core.handleProxy('GET','https://cdn.donmai.us/image.png',null)).statusCode,502);
 global.fetch=async()=>new Response('x'.repeat(3*1024*1024+1));
 assert.equal((await core.handleProxy('GET','https://cdn.donmai.us/image.png',null)).statusCode,502);
 console.log('PASS proxy-origin HTML isolation, no public mutation bypass, scoped auth hosts, request-wide timeout signal and bounded serverless payloads. No real network.');
}finally{global.fetch=original}})().catch(e=>{console.error(e);process.exitCode=1});
