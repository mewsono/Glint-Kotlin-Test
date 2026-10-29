const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({window:{},S:{src:'yandere',mode:'live',q:''},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},URL,URLSearchParams});
const run=s=>vm.runInContext(s,ctx),app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
run(fs.readFileSync(path.join(__dirname,'../sources.js'),'utf8'));
run(app.slice(app.indexOf('const searchQuery='),app.indexOf('function cancelSearch(){')));
assert.equal(run("searchFilterQuery('tag_a tag_b -tag_c rating:s order:score score:>10')"),'tag_a tag_b -tag_c rating:s score:>10');
assert.equal(run('searchOrderForQuery()'),'newest');run("SEARCH_VIEW.order='popularity'");assert.equal(run("searchOrderForQuery('tag_a tag_b')"),'popularity');assert.equal(run("searchOrderForQuery('tag_a order:id_desc')"),'newest');assert.equal(run("searchOrderForQuery('tag_a order:score')"),'popularity');assert.equal(run("searchOrderForQuery('tag_a order:random')"),'custom');
let requests=[];const raw=[20,99].map(id=>({id,md5:'abcdef',image_width:100,image_height:100,width:100,height:100,preview_url:'https://example.test/a.jpg',file_url:'https://example.test/a.jpg',file:{width:100,height:100,url:'https://example.test/a.jpg'},preview:{url:'https://example.test/a.jpg'},representations:{small:'https://example.test/a.jpg',full:'https://example.test/a.jpg'}}));
ctx.json=async(url,options)=>{requests.push({url:new URL(url),options});const host=new URL(url).hostname;return host==='e621.net'?{posts:raw}:host==='gelbooru.com'?{post:raw}:host==='derpibooru.org'?{images:raw}:raw};
run('pbJSON=async(u,o)=>json(u,o);pbJSONFriendly=async(u,o)=>json(u,o);pbText=async(u,o)=>json(u,o)');
(async()=>{
 for(const id of ['danbooru','yandere','e621','gelbooru','derpibooru']){
  assert.equal(run(`pbPostPopularitySupported('${id}')`),true);
  const posts=await run(`pbLoadPosts('${id}',{tags:'tag_a tag_b -tag_c rating:s',page:2,order:'popularity'})`),u=requests.at(-1).url;
  if(id==='derpibooru'){assert.equal(u.searchParams.get('sf'),'score');assert.equal(u.searchParams.get('sd'),'desc')}
  else{assert.match(u.searchParams.get('tags'),id==='gelbooru'?/sort:score:desc$/:/order:score$/);assert.match(u.searchParams.get('tags'),/tag_a tag_b -tag_c rating:s/)}
  assert.deepEqual(Array.from(posts,p=>p.sid),['20','99'],'server popularity ranking must not be re-sorted by ID');assert.equal(posts.nextCursor,null,'score-ranked pages need numeric pagination, not an ID cursor');
 }
 assert.equal(run("pbPostPopularitySupported('animepictures')"),false);
 await assert.rejects(run("pbLoadPosts('animepictures',{tags:'test',order:'popularity'})"),/does not support popularity/);
 ctx.signal={test:'abort signal'};ctx.json=async(url,options)=>{const u=new URL(url);requests.push({url:u,options});const q=u.searchParams.get('tags');if(u.pathname==='/post.xml')return `<posts count="${q==='tag_a'?10:q==='tag_a tag_b'?3:0}"></posts>`;return {counts:{posts:q==='tag_a'?10:q==='tag_a tag_b'?3:0},'@attributes':{count:7},total:9}};
 for(const id of ['danbooru','yandere']){
  assert.equal(await run(`pbLoadPostCount('${id}',{tags:'tag_a',signal})`),10);
  assert.equal(await run(`pbLoadPostCount('${id}',{tags:'tag_a tag_b',signal})`),3);assert.equal(requests.at(-1).url.searchParams.get('tags'),'tag_a tag_b');assert.equal(requests.at(-1).options.signal,ctx.signal);
  assert.equal(await run(`pbLoadPostCount('${id}',{tags:'no_matches'})`),0);
 }
 assert.equal(await run("pbLoadPostCount('gelbooru',{tags:'tag_a tag_b'})"),7);
 assert.equal(await run("pbLoadPostCount('e621',{tags:'tag_a tag_b'})"),null);
 console.log('PASS: exact combined-query counts 10→3/zero, cancellation propagation, safe unknown totals, source-native popularity across five engines, no fake ID-sorted popularity or ranked ID cursors.');
})().catch(e=>{console.error(e);process.exitCode=1});
