// Optional live read-only regression test. Uses public favourites; no real API key.
// References: Danbooru PaginationExtension and Searchable#apply_default_order.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const seen=[];
const context=vm.createContext({window:{},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},URL,URLSearchParams,console,
  fetch:async(url,opts)=>{
    const local=new URL(url,'http://127.0.0.1:8000');
    const upstream=new URL(local.searchParams.get('u'));
    // Never send test credentials. These endpoints support public read access.
    upstream.searchParams.delete('login');upstream.searchParams.delete('api_key');
    local.searchParams.set('u',upstream.toString());
    const response=await fetch(local,opts);
    if(response.ok)seen.push({upstream,body:await response.clone().json()});
    return response;
  }});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../sources.js'),'utf8'),context);
vm.runInContext('PB_AUTH.danbooru={login:"evazion",apiKey:"test-not-sent"}',context);
(async()=>{
  const newest=await vm.runInContext('pbLoadFavorites("danbooru",{limit:5,order:"newest"})',context);
  const oldest=await vm.runInContext('pbLoadFavorites("danbooru",{limit:5,order:"oldest"})',context);
  const first=seen.at(-1).body;
  const expected=[...first].sort((a,b)=>a.id-b.id).map(f=>String(f.post.id));
  assert.deepEqual(Array.from(oldest,p=>p.sid),expected);
  const next=await vm.runInContext(`pbLoadFavorites("danbooru",{limit:5,order:"oldest",cursor:${JSON.stringify(oldest.nextCursor)}})`,context);
  const second=seen.at(-1).body;
  assert.ok(Math.min(...second.map(f=>f.id))>Math.max(...first.map(f=>f.id)));
  assert.equal(new Set([...oldest,...next].map(p=>p.sid)).size,oldest.length+next.length);
  assert.notEqual(newest[0].sid,oldest[0].sid);
  console.log('PASS live Danbooru API: newest differs from oldest, batches reverse correctly, and the next cursor advances without duplicates.');
  console.log('Oldest favourite IDs:',first.map(f=>f.id).sort((a,b)=>a-b).join(', '));
})().catch(e=>{console.error(e);process.exitCode=1});
