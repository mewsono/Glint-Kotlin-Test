const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},URL,URLSearchParams});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../sources.js'),'utf8'),context);
let requests=[];
context.json=async url=>{requests.push(new URL(url));return []};
vm.runInContext('pbJSON=async url=>json(url);pbJSONFriendly=async url=>json(url)',context);
const run=s=>vm.runInContext(s,context);
(async()=>{
 for(const id of ['danbooru','e621','yandere','gelbooru','derpibooru']){
  assert.equal(run(`pbPostSortSupported('${id}')`),true);
  await run(`pbLoadPosts('${id}',{tags:'test_character rating:g order:score',page:'a100',limit:40,order:'oldest'})`);
  let u=requests.at(-1);
  if(id==='derpibooru'){assert.equal(u.searchParams.get('sf'),'id');assert.equal(u.searchParams.get('sd'),'asc')}
  else{const tags=u.searchParams.get('tags');assert.match(tags,id==='gelbooru'?/sort:id:asc/:id==='yandere'?/order:id$/:/order:id_asc/);assert.doesNotMatch(tags,/order:score/)}
  await run(`pbLoadPosts('${id}',{tags:'test_character',page:2,limit:40,order:'newest'})`);u=requests.at(-1);
  if(id==='derpibooru')assert.equal(u.searchParams.get('sd'),'desc');else assert.equal(u.searchParams.get('tags'),'test_character');
  await run(`pbLoadPosts('${id}',{tags:'test_character rating:g',limit:24})`);u=requests.at(-1);
  if(id==='derpibooru')assert.equal(u.searchParams.get('sd'),'desc');else assert.equal(u.searchParams.get('tags'),'test_character rating:g');
 }
 context.json=async()=>[{id:30,md5:'abcdef',image_width:100,image_height:100},{id:20,md5:'abcdef',image_width:100,image_height:100}];
 const next=await run("pbLoadPosts('danbooru',{tags:'test_character',page:'a10',order:'oldest'})");assert.deepEqual(Array.from(next,p=>p.sid),['20','30']);
 // Raw API pagination survives missing image URLs, including an entirely
 // unavailable batch. The cursor includes records filtered out of the grid.
 const raw=Array.from({length:40},(_,i)=>({id:2000-i,...(i<36?{md5:'abcdef',image_width:100,image_height:100}:{})}));
 context.json=async()=>raw;
 const sparse=await run("pbLoadPosts('danbooru',{tags:'blue_archive',limit:40})");
 assert.equal(sparse.length,36);assert.equal(sparse.rawCount,40);assert.equal(sparse.hasMore,true);assert.equal(sparse.nextCursor,'b1961');
 context.json=async()=>raw.map(p=>({id:p.id}));
 const unavailable=await run("pbLoadPosts('danbooru',{tags:'blue_archive',limit:40})");
 assert.equal(unavailable.length,0);assert.equal(unavailable.hasMore,true);assert.equal(unavailable.nextCursor,'b1961');assert.ok(unavailable.batchKey.includes('1961'));
 const ascending=await run("pbLoadPosts('danbooru',{tags:'blue_archive',limit:40,order:'oldest'})");assert.equal(ascending.nextCursor,'a2000');
 context.json=async()=>raw.slice(0,36);
 const capped=await run("pbLoadPosts('danbooru',{limit:40})");assert.equal(capped.endConfirmed,false);
 context.json=async()=>[];
 const ended=await run("pbLoadPosts('danbooru',{limit:40})");assert.equal(ended.hasMore,false);assert.equal(ended.endConfirmed,true);assert.equal(ended.rawCount,0);
 context.json=async()=>({posts:raw,has_more:false});
 const declared=await run("pbLoadPosts('danbooru',{limit:40})");assert.equal(declared.hasMore,false);assert.equal(declared.endConfirmed,true);
 context.json=async url=>{requests.push(new URL(url));return []};
 assert.equal(run("pbPostSortSupported('animepictures')"),false);
 await assert.rejects(run("pbLoadPosts('animepictures',{order:'oldest'})"),/does not support chronological/);
 // Every ordinary Home/Search/Explore/preview request defaults to newest,
 // overriding stale ordering metatags while keeping actual content filters.
 await run("pbLoadPosts('danbooru',{tags:'test_character order:score',page:2,limit:24})");assert.equal(requests.at(-1).searchParams.get('tags'),'test_character');
 context.json=async url=>{requests.push(new URL(url));return {counts:{posts:12345},total:6789}};
 assert.equal(await run("pbLoadPostCount('danbooru',{tags:'sakura_miko rating:g'})"),12345);assert.equal(requests.at(-1).searchParams.get('tags'),'sakura_miko rating:g');
 assert.equal(await run("pbLoadPostCount('derpibooru',{tags:'character:twilight_sparkle'})"),6789);
 run('pbText=async()=>\'<posts count="3456"></posts>\'');assert.equal(await run("pbLoadPostCount('yandere',{tags:'sakura_miko'})"),3456);
 assert.equal(await run("pbLoadPostCount('e621',{tags:'test_character'})"),null);
 context.json=async()=>({counts:{posts:'invalid'}});assert.equal(await run("pbLoadPostCount('danbooru',{})"),null);
 console.log('PASS: source-specific chronological order, cursor passthrough, newest-by-default regular feeds, raw-record pagination through missing images, real matching totals and honest unavailable counts.');
})().catch(e=>{console.error(e);process.exitCode=1});
