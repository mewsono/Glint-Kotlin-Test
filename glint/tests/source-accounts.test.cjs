/* Pure mocks: this test MUST NOT contact real sources or write real accounts. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const code=fs.readFileSync(path.join(__dirname,'../sources.js'),'utf8');
function storage(seed={}){const data=new Map(Object.entries(seed));return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
function setup(local={},session={}){
 const l=storage(local),s=storage(session),calls=[],actual=new Set();let mode='',identity='alice',pluginCalls=0;
 const ctx=vm.createContext({window:{dispatchEvent(){},CapacitorHttp:{request(){pluginCalls++;throw Error('Account traffic must not use the alternate native transport')}}},localStorage:l,sessionStorage:s,URL,URLSearchParams,TextEncoder,crypto:crypto.webcrypto,AbortController,setTimeout,clearTimeout,console,Date,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},fetch:async(url,opts)=>{
  const outer=new URL(url,'https://pinboard.test/');assert.equal(outer.pathname,'/api/proxy');assert.equal(opts.method,'POST');assert.equal(opts.cache,'no-store');assert.equal(opts.redirect,'error');
  const r=JSON.parse(opts.body),u=new URL(r.url),values=new URLSearchParams(r.body||''),id=String(values.get('id')||JSON.parse(r.body?.startsWith('{')?r.body:'{}').post_id||u.searchParams.get('id')||u.pathname.match(/favorites\/(\d+)/)?.[1]||u.searchParams.get('search[post_id]')||u.searchParams.get('tags')?.match(/id:(\d+)/)?.[1]||101);
  calls.push({outer,opts,r,u,id,time:Date.now()});assert.equal(r.pb_private,1);
  for(const name of ['login','api_key','password_hash','pass_hash','key','user_api_key','user_id'])assert.equal(new URL(outer.searchParams.get('u')).searchParams.has(name),false,`Credential field ${name} leaked to browser URL`);
  const reply=(body,status=200,extra={})=>new Response(JSON.stringify({pb_private_response:1,status,body:typeof body==='string'?body:JSON.stringify(body),...extra}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(r.mutation){
   if(mode==='401')return reply({message:'Invalid API key SECRET_KEY'},401);
   if(mode==='403')return reply({message:'Missing permission'},403);
   if(mode==='429')return reply({message:'Slow down'},429,{retry_after:'0.01'});
   const target=r.method==='DELETE'||values.get('score')==='0'||u.searchParams.get('s')==='delete'?false:true;
   if(mode!=='no-apply'){if(target)actual.add(u.hostname+'|'+id);else actual.delete(u.hostname+'|'+id)}
   if(mode==='network-after-write')throw new TypeError('Network error after sending');
   if(mode==='redirect'){assert.equal(u.hostname,'gelbooru.com');return reply('',302)}
   if(u.hostname==='gelbooru.com')return reply(target?'3':'');
   return reply(mode==='204'?'':{success:true,post_id:+id},mode==='204'?204:200);
  }
  if(u.pathname==='/profile.json'||u.pathname==='/users/me.json')return reply({id:identity==='anonymous'?0:11,name:identity});
  if(u.pathname==='/user/authenticate.json')return mode==='invalid-moe'?reply({success:false,reason:'access denied'},403):reply({success:true});
  if(u.pathname==='/post/vote.json')return reply({success:true,vote:actual.has(u.hostname+'|'+id)?3:0});
  if(u.pathname==='/counts/posts.json')return reply({counts:{posts:actual.size}});
  if(u.pathname==='/favorites.json'&&u.searchParams.has('search[post_id]')&&mode==='wrong-filter')return reply([{id:98765,post_id:999}]);
  if(u.pathname==='/favorites.json'&&u.searchParams.has('search[post_id]'))return reply(actual.has(u.hostname+'|'+id)?[{id:900,post_id:+id}]:[]);
  if(u.pathname==='/favorites.json')return reply([]);
  if(u.pathname==='/posts.json')return reply({posts:actual.has(u.hostname+'|'+id)?[{id:+id}]:[]});
  if(u.pathname==='/index.php')return reply({'@attributes':{count:actual.has(u.hostname+'|'+id)?1:0},post:actual.has(u.hostname+'|'+id)?[{id:+id}]:[]});
  if(u.pathname==='/api/v1/json/search/images')return reply({images:[],total:0});
  return reply([]);
 }});
 vm.runInContext(code,ctx);return {ctx,run:s=>vm.runInContext(s,ctx),local:l,session:s,calls,actual,setMode:v=>mode=v,setIdentity:v=>identity=v,get plugins(){return pluginCalls}};
}
(async()=>{
 const t=setup(),run=t.run;
 const records={danbooru:{login:'alice',apiKey:'SECRET_KEY'},e621:{login:'alice',apiKey:'SECRET_KEY'},yandere:{login:'alice',passHash:'a'.repeat(40)},konachan:{login:'alice',passHash:'b'.repeat(40)},sakuga:{login:'alice',passHash:'c'.repeat(40),hashVersion:2},gelbooru:{login:'27',apiKey:'SECRET_KEY',session:'COOKIE_SECRET_0123456789'}};
 for(const [id,a] of Object.entries(records))run(`pbSetAuth(${JSON.stringify(id)},${JSON.stringify(a)})`);
 assert.equal(run('pbBase64("测试:clé")'),Buffer.from('测试:clé').toString('base64'));
 for(const id of Object.keys(records)){
  assert.equal(run(`pbCanLike('${id}')`),true,id);
  assert.equal(await run(`pbFavoriteStatus('${id}',101)`),false);
  assert.equal(await run(`pbSetFavorite('${id}',101,true)`),true,id);
  const write=t.calls.findLast(c=>c.r.mutation);assert.equal(write.r.mutation,true);
  if(['danbooru','e621'].includes(id)){assert.equal(write.u.pathname,'/favorites.json');assert.equal(write.r.method,'POST');assert.deepEqual(JSON.parse(write.r.body),{post_id:101});assert.equal(write.r.headers.Authorization,'Basic '+Buffer.from('alice:SECRET_KEY').toString('base64'))}
  if(['yandere','konachan','sakuga'].includes(id)){assert.equal(write.u.pathname,'/post/vote.json');assert.equal(write.r.method,'POST');assert.equal(write.r.headers['Content-Type'],'application/x-www-form-urlencoded');const v=new URLSearchParams(write.r.body);assert.equal(v.get('score'),'3');assert.equal(v.get('password_hash'),records[id].passHash);assert.equal(v.has('password'),false);if(id==='sakuga')assert.equal(write.u.hostname,'www.sakugabooru.com')}
  if(id==='gelbooru'){assert.equal(write.r.method,'GET');assert.equal(write.u.pathname,'/public/addfav.php');assert.equal(write.r.headers.Cookie,'user_id=27; pass_hash=COOKIE_SECRET_0123456789')}
  run(`PB_LAST_WRITE['${id}']=0`);
  assert.equal(await run(`pbSetFavorite('${id}',101,false)`),false);
  const remove=t.calls.findLast(c=>c.r.mutation);if(['danbooru','e621'].includes(id))assert.equal(remove.u.pathname,'/favorites/101.json','DELETE needs post ID, never favourite-record ID');if(['yandere','konachan','sakuga'].includes(id))assert.equal(new URLSearchParams(remove.r.body).get('score'),'0');
 }
 assert.equal(t.plugins,0);
 // Earlier successful vote checks intentionally cache this identity for five
 // minutes. Clear the per-account cache to assert the fresh denied-auth path.
 run('PB_MOE_AUTH.clear()');
 t.setMode('invalid-moe');const count=t.calls.length;await assert.rejects(run('pbFavoriteStatus("yandere",101)'),/access denied/);assert.equal(t.calls.length,count+1,'bad Moe hash must stop before an anonymous vote 0 can masquerade as source state');assert.equal(t.calls.at(-1).u.pathname,'/user/authenticate.json');t.setMode('');
 assert.equal(await run('pbTestAuth("e621")'),'alice');assert.equal(t.calls.at(-1).u.pathname,'/users/me.json');
 t.setMode('wrong-filter');await assert.rejects(run('pbFavoriteStatus("danbooru",101)'),/exact, account-scoped/);t.setMode('');
 t.setIdentity('anonymous');await assert.rejects(run('pbTestAuth("e621")'),/did not confirm/);t.setIdentity('someone_else');await assert.rejects(run('pbTestAuth("danbooru")'),/did not confirm/);t.setIdentity('alice');
 run('pbSetAuth("e621",{login:"alice"})');assert.equal(run('pbHasAuth("e621")'),false);assert.equal(run('pbCanLike("e621")'),false);
 run('pbSetAuth("gelbooru",{login:"27",apiKey:"SECRET_KEY"})');assert.equal(run('pbHasAuth("gelbooru")'),true);assert.equal(run('pbCanLike("gelbooru")'),false);const before=t.calls.length;await assert.rejects(run('pbSetFavorite("gelbooru",101,true)'),/complete account/);assert.equal(t.calls.length,before);
 assert.equal(run('pbGelSessionOk("pass_hash=COOKIE_SECRET_0123456789")'),false);assert.equal(run('pbGelSessionOk("user_id=27; pass_hash=COOKIE_SECRET_0123456789")'),false);
 run('pbSetAuth("derpibooru",{apiKey:"KEY_ONLY_12345"})');assert.equal(run('pbHasAuth("derpibooru")'),true);assert.equal(run('pbCanLike("derpibooru")'),false);assert.match(await run('pbTestAuth("derpibooru")'),/does not verify a logged-in identity/);
 await run('pbLoadPosts("derpibooru",{page:1})');assert.equal(t.calls.at(-1).u.searchParams.get('key'),'KEY_ONLY_12345');
 assert.equal(run('pbHasAuth("animepictures",{login:"alice"})'),false);assert.equal(run('pbCanLike("eshuushuu")'),false);assert.equal(run('pbHasAuth("sakuga",{login:"alice",passHash:"a".repeat(40)})'),false);
 for(const [host,salt] of [['https://yande.re/','choujin-steiner--{0}--'],['https://konachan.net/','So-I-Heard-You-Like-Mupkids-?--{0}--'],['https://www.sakugabooru.com/','er@!$rjiajd0$!dkaopc350!Y%)--{0}--']])assert.equal(await run(`pbMoebooruHash('  päsś word  ',${JSON.stringify(host)})`),crypto.createHash('sha1').update(salt.replace('{0}','  päsś word  ')).digest('hex'));
 // Every denied/uncertain/mismatched write has exactly ONE mutation, no
 // alternate transport, no anonymous retry, and no success return.
 for(const mode of ['401','403','429','no-apply','network-after-write']){
  t.setMode(mode);run('PB_LAST_WRITE.danbooru=0');t.actual.clear();const n=t.calls.filter(c=>c.r.mutation).length;
  await assert.rejects(run('pbSetFavorite("danbooru",101,true)'),e=>!String(e.message).includes('SECRET_KEY'));
  assert.equal(t.calls.filter(c=>c.r.mutation).length,n+1,mode);
 }
 t.setMode('204');run('PB_LAST_WRITE.danbooru=0');assert.equal(await run('pbSetFavorite("danbooru",101,true)'),true);
 t.setMode('');run('pbSetAuth("gelbooru",'+JSON.stringify(records.gelbooru)+');PB_LAST_WRITE.gelbooru=0');await run('pbSetFavorite("gelbooru",101,true)');t.setMode('redirect');run('PB_LAST_WRITE.gelbooru=0');assert.equal(await run('pbSetFavorite("gelbooru",101,false)'),false,'a normal Gel removal redirect is accepted ONLY with read-back confirmation');
 // An abort while waiting for the per-source limiter sends no write.
 t.setMode('');const controller=new AbortController();t.ctx.abortSignal=controller.signal;run('PB_LAST_WRITE.danbooru=Date.now()+60000');const n=t.calls.length,pending=run('pbSetFavorite("danbooru",101,false,{signal:abortSignal})');controller.abort();await assert.rejects(pending,/cancel/);assert.equal(t.calls.length,n);
 // Account removal invalidates a queued job before network I/O.
 run('PB_LAST_WRITE.danbooru=Date.now()+30');const queued=run('pbSetFavorite("danbooru",101,false)');run('pbSetAuth("danbooru",null)');await assert.rejects(queued,/account changed/);assert.equal(t.calls.length,n);
 // Central migration cannot fan out a hash or resurrect a removed account.
 const old={moebooru:{login:'old',passHash:'d'.repeat(40)},danbooru:{login:'alice',apiKey:'SECRET_KEY'}};
 const m=setup({}, {'pb-keys':JSON.stringify(old)});m.run('pbLoadAuth()');assert.equal(m.run('pbHasAuth("danbooru")'),true);for(const id of ['yandere','konachan','sakuga'])assert.equal(m.run(`pbHasAuth('${id}')`),false);assert.ok(m.local.getItem('pb-unassigned-auth-v64'));assert.equal(m.session.getItem('pb-keys'),null);m.run('pbSetAuth("danbooru",null);pbLoadAuth()');assert.equal(m.run('pbHasAuth("danbooru")'),false);
 const oldE621=setup({}, {'pb-keys':JSON.stringify({e621:{login:'alice',apiKey:'SECRET_KEY'}})});oldE621.run('pbLoadAuth()');assert.equal(oldE621.run('pbHasAuth("e621")'),true);
 const scoped=setup({}, {'pb-keys':JSON.stringify({moebooru:{sourceId:'konachan',login:'old',passHash:'d'.repeat(40)}})});scoped.run('pbLoadAuth()');assert.equal(scoped.run('pbHasAuth("konachan")'),true);assert.equal(scoped.run('pbHasAuth("yandere")'),false);
 const fanout=setup({'pb-auth':JSON.stringify({yandere:{login:'old',passHash:'d'.repeat(40)},konachan:{login:'old',passHash:'d'.repeat(40)}})});fanout.run('pbLoadAuth()');assert.equal(fanout.run('pbHasAuth("yandere")'),false);assert.equal(fanout.run('PB_AUTH.yandere.passHash'), 'd'.repeat(40));assert.equal(fanout.run('PB_AUTH.konachan.needsReentry'),true);fanout.run('pbSetAuth("yandere",{login:"old",passHash:"d".repeat(40),hashVersion:2});pbLoadAuth()');assert.equal(fanout.run('pbHasAuth("yandere")'),true);assert.equal(fanout.run('pbHasAuth("konachan")'),false);
 const preserved=setup({'pb-auth':JSON.stringify(records)});preserved.run('pbLoadAuth()');assert.equal(preserved.run('Object.keys(PB_AUTH).length'),6);assert.equal(preserved.run('PB_AUTH.sakuga.hashVersion'),2);
 const blocked=setup({'pb-auth':JSON.stringify({danbooru:records.danbooru})});blocked.run('pbLoadAuth()');const epoch=blocked.run('pbAuthVersion("danbooru")');blocked.local.setItem=()=>{throw Error('quota')};assert.throws(()=>blocked.run('pbSetAuth("danbooru",{login:"other",apiKey:"OTHER_KEY"})'),/Nothing was saved/);assert.equal(blocked.run('PB_AUTH.danbooru.login'),'alice');assert.equal(blocked.run('pbAuthVersion("danbooru")'),epoch);
 assert.equal(t.plugins,0);
 console.log('PASS: six native favourite writers + authoritative readback; correct salts/Basic/form/cookies/post IDs; private POST/no key URLs; scoped identity; denied/uncertain/204/302 outcomes; no retries; abort/account races; safe credential migration. No real network used.');
})().catch(e=>{console.error(e);process.exitCode=1});
