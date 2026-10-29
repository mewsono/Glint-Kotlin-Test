const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({window:{},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},URL,URLSearchParams});
const run=s=>vm.runInContext(s,ctx),plain=s=>JSON.parse(JSON.stringify(run(s)));
run(fs.readFileSync(path.join(__dirname,'../sources.js'),'utf8'));
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');run(app.slice(app.indexOf('const searchQuery='),app.indexOf('function cancelSearch(){')));
assert.equal(run("searchQuery('  hatsune_miku\u00a0 rating:g  -comic order:score  ')"),'hatsune_miku rating:g -comic order:score');
assert.deepEqual(plain("searchTagToken('solo -hatsu rating:g',11)"),{start:5,end:11,prefix:'-',term:'hatsu',caret:11});
assert.deepEqual(plain("searchTagToken('~miku',5)"),{start:0,end:5,prefix:'~',term:'miku',caret:5});
for(const q of ['a','solo ','rating:g','order:score','ha*','tag?','<img']){ctx.q=q;assert.equal(run('searchTagToken(q,q.length)'),null)}
let requests=[];ctx.json=async(url,options)=>{requests.push({url:new URL(url),options});return []};run('pbJSON=async (u,o)=>json(u,o)');
(async()=>{
 for(const id of ['danbooru','e621','yandere','gelbooru']){
  requests=[];ctx.json=async(url,options)=>{requests.push({url:new URL(url),options});const posts=[{id:20,md5:'abcdef',width:100,height:100,image_width:100,image_height:100,preview_url:'https://example.test/a.jpg',file_url:'https://example.test/a.jpg',file:{width:100,height:100,url:'https://example.test/a.jpg',md5:'abcdef',ext:'jpg'},preview:{url:'https://example.test/a.jpg'},sample:{url:'https://example.test/a.jpg'}},{id:99,md5:'abcdef',width:100,height:100,image_width:100,image_height:100,preview_url:'https://example.test/a.jpg',file_url:'https://example.test/a.jpg',file:{width:100,height:100,url:'https://example.test/a.jpg',md5:'abcdef',ext:'jpg'},preview:{url:'https://example.test/a.jpg'},sample:{url:'https://example.test/a.jpg'}}];return id==='e621'?{posts}:id==='gelbooru'?{post:posts}:posts};
  const pins=await run(`pbLoadPosts('${id}',{tags:'hatsune_miku rating:g -comic ${id==='gelbooru'?'sort:score:desc':'order:score'}',preserveQueryOrder:true,limit:40,page:2})`);
  const url=requests[0].url,tags=url.searchParams.get('tags');assert.match(tags,/-comic/);assert.match(tags,/rating:g/);assert.match(tags,id==='gelbooru'?/sort:score:desc/:/order:score/);assert.doesNotMatch(tags,/id_desc|sort:id/);
  assert.equal(pins.nextCursor,null);assert.deepEqual(Array.from(pins,p=>p.sid),['20','99'],'keep the server ranking instead of re-sorting custom queries by ID');
 }
 requests=[];ctx.json=async(url,options)=>{requests.push({url:new URL(url),options});return [{name:'hatsune_miku',post_count:456,category:4},{name:'hatsune_miku',post_count:456},{name:'old_name',is_deprecated:true,post_count:1}]};
 const dan=await run("pbAutocomplete('danbooru','hatsune_mi')");assert.deepEqual(JSON.parse(JSON.stringify(dan)),[{name:'hatsune_miku',count:456,category:4}]);assert.equal(requests[0].url.searchParams.get('search[name_matches]'),'hatsune_mi*');
 ctx.json=async(url,options)=>{requests.push({url:new URL(url),options});return [{name:'hatsune_miku',count:78,type:4},{name:'no_count'}]};
 const moe=await run("pbAutocomplete('yandere','hatsune_mi')");assert.deepEqual(JSON.parse(JSON.stringify(moe)),[{name:'hatsune_miku',count:78,category:4},{name:'no_count',count:null,category:null}]);assert.equal(requests.at(-1).url.pathname,'/tag.json');assert.equal(requests.at(-1).url.searchParams.get('name'),'hatsune_mi*');
 const count=requests.length;await run("pbAutocomplete('yandere','rating:g')");await run("pbAutocomplete('animepictures','land')");assert.equal(requests.length,count,'metatags and unsupported autocomplete do not call guessed endpoints');
 console.log('PASS: native multi-tag/exclusion/filter queries and custom order survive unchanged; rank/page pagination preserved; source-specific autocomplete, honest counts, caret tokenization and no guessed endpoints.');
})().catch(e=>{console.error(e);process.exitCode=1});
