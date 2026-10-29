const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({window:{},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},URL,URLSearchParams}),run=s=>vm.runInContext(s,ctx),requests=[];
run(fs.readFileSync(path.join(__dirname,'../sources.js'),'utf8'));
const post=id=>({id,md5:'abcdef',image_width:100,image_height:100,width:100,height:100,preview_url:'https://example.test/a.jpg',file_url:'https://example.test/a.jpg',file:{width:100,height:100,url:'https://example.test/a.jpg'},preview:{url:'https://example.test/a.jpg'}});
ctx.json=async url=>{const u=new URL(url),tags=u.searchParams.get('tags')||'';requests.push(u);if(tags.split(/\s+/).filter(Boolean).length>2)throw new Error('You cannot search for more than 2 tags at a time.');const posts=[post(20),post(99)];return u.hostname==='e621.net'?{posts}:u.hostname==='gelbooru.com'?{post:posts}:posts};run('pbJSON=async u=>json(u)');
(async()=>{
 for(const source of ['danbooru','yandere','e621','gelbooru']){
  for(const order of ['',",order:'newest'"]){
   const posts=await run(`pbLoadPosts('${source}',{tags:'1girl ice_cream',page:2${order}})`),u=requests.at(-1);assert.equal(u.searchParams.get('tags'),'1girl ice_cream');assert.deepEqual(Array.from(posts,p=>p.sid),['99','20']);assert.equal(posts.nextCursor,['danbooru','e621'].includes(source)?'b20':null);
  }
 }
 await assert.rejects(run("pbLoadPosts('danbooru',{tags:'1girl ice_cream',order:'popularity'})"),/more than 2 tags/,'do not silently fake popularity or bypass the source limit');
 assert.equal(requests.at(-1).searchParams.get('tags'),'1girl ice_cream order:score');
 console.log('PASS: default and explicit Newest send exactly two content tags across booru families; descending normalization/raw cursor preserved; only non-default sorting adds an ordering token.');
})().catch(e=>{console.error(e);process.exitCode=1});
