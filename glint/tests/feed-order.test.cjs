const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({window:{},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},URL,URLSearchParams}),run=s=>vm.runInContext(s,ctx),requests=[];
run(fs.readFileSync(path.join(__dirname,'../sources.js'),'utf8'));
const post=id=>({id,md5:'abcdef',image_width:100,image_height:100,width:100,height:100,preview_url:'https://example.test/a.jpg',file_url:'https://example.test/a.jpg',file:{width:100,height:100,url:'https://example.test/a.jpg'},preview:{url:'https://example.test/a.jpg'}});
ctx.json=async(url,opts)=>{const u=new URL(url);requests.push({u,opts});const rows=[post(10),post(30)];
  if(u.hostname==='e621.net')return {posts:rows};
  if(u.hostname==='gelbooru.com')return {'@attributes':{count:rows.length},post:rows};
  if(u.hostname==='derpibooru.org')return {images:rows,total:rows.length};
  return rows;};
run('pbJSON=async(u,o)=>json(u,o)');
(async()=>{
 const supports={danbooru:true,yandere:true,konachan:true,sakuga:true,e621:true,gelbooru:true,derpibooru:true,animepictures:false,eshuushuu:true};
 for(const [source,supported] of Object.entries(supports))assert.equal(run(`pbPostPopularitySupported('${source}')`),supported,source+' popularity support');
 // Each supported source maps Popular to its own genuine server-side order.
 const mapped={danbooru:/order:score/,yandere:/order:score/,e621:/order:score/,gelbooru:/sort:score:desc/};
 for(const [source,pattern] of Object.entries(mapped)){
  const posts=await run(`pbLoadPosts('${source}',{tags:'landscape',order:'popularity',limit:2})`),last=requests.at(-1).u;
  const sent=source==='gelbooru'?last.searchParams.get('tags'):last.searchParams.getAll('tags').join(' ');
  assert.match(sent,pattern,source+' popularity token');assert.match(sent,/landscape/,'query retained');
  assert.equal(posts.nextCursor,null,'popularity is not an ID cursor');assert.deepEqual(Array.from(posts,p=>p.sid),['10','30'],'server order kept as-is, never re-sorted by id');
  assert.equal(posts.hasMore,true,'full server page still has more');
 }
 const phil=await run("pbLoadPosts('derpibooru',{tags:'landscape',order:'popularity'})"),p=requests.at(-1).u;
 assert.equal(p.searchParams.get('sf'),'score');assert.equal(p.searchParams.get('sd'),'desc');assert.equal(phil.nextCursor,null);
 const shu=await run("pbLoadPosts('eshuushuu',{order:'popularity',limit:2})"),shuUrl=requests.at(-1).u;
 assert.equal(shuUrl.searchParams.get('sort_by'),'favorites');assert.equal(shuUrl.searchParams.get('sort_order'),'DESC');assert.equal(shu.nextCursor,null);
 // Popularity page 2 remains server-paginated, not an id cursor.
 await run("pbLoadPosts('danbooru',{tags:'landscape',order:'popularity',page:3})");
 assert.equal(requests.at(-1).u.searchParams.get('page'),'3');assert.equal(requests.at(-1).u.searchParams.get('page'),'3');
 // Newest stays the default and never adds an ordering token.
 for(const source of ['danbooru','yandere','e621','gelbooru']){
  await run(`pbLoadPosts('${source}',{tags:'landscape'})`);const q=requests.at(-1).u;
  assert.equal(/order:|sort:|sf=/.test(q.href),false,source+' newest token-free');
 }
 // Unsupported sources must fail honestly, not silently return score-sorted ids.
 for(const source of ['animepictures']){const before=requests.length;await assert.rejects(run(`pbLoadPosts('${source}',{tags:'landscape',order:'popularity',limit:2})`),/does not support popularity sorting/);assert.equal(requests.length,before,'no request for an unsupported order')}
 // A query-level order the user typed is never rewritten by the chip default.
 await run("pbLoadPosts('danbooru',{tags:'landscape order:score',preserveQueryOrder:true})");
 assert.equal(requests.at(-1).u.searchParams.get('tags'),'landscape order:score');
 console.log('PASS: Popular maps to real native ordering for Danbooru/Moebooru/e621 (order:score), Gelbooru (sort:score:desc), Philomena (sf=score) and e-shuushuu (favorites); popularity is server-paginated with no ID cursor; Newest stays default and token-free; unsupported sources fail honestly; explicit query order is untouched.');
})().catch(e=>{console.error(e);process.exitCode=1});
