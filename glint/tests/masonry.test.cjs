const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ctx=vm.createContext({S:{cols:2},pc:item=>`<i data-id="${item.id}"></i>`});
vm.runInContext(app.slice(app.indexOf('function masonryRatio('),app.indexOf('function pcx(')),ctx);
const run=code=>vm.runInContext(code,ctx),columns=markup=>[...markup.matchAll(/<div class="col">(.*?)<\/div>/g)].map(m=>(m[1].match(/<i /g)||[]).length);
for(const rows of [
 Array.from({length:6},(_,id)=>({id,p:{r:1.3}})),
 Array.from({length:6},(_,id)=>({id,p:{width:600,height:800}})),
 [undefined,null,NaN,Infinity,-1,'1.3'].map((r,id)=>({id,r})),
 [.68,1.3,1.5,.85,1.25,1.1].map((r,id)=>({id,p:{r}}))
]){
 ctx.rows=rows;const sizes=columns(run('masonry(rows)'));assert.equal(sizes.reduce((a,b)=>a+b,0),6);assert.ok(sizes.every(n=>n>=2),JSON.stringify(sizes));
 assert.ok(run('rows.every(row=>Number.isFinite(masonryRatio(row))&&masonryRatio(row)>0)'));
}
assert.equal(run('masonryRatio({r:Infinity,p:{width:400,height:600}})'),1.5);
assert.equal(run("masonryRatio({p:{r:'1.25'}})"),1.25);
assert.equal(run('masonryRatio({p:{r:NaN,width:600,height:400}})'),2/3);
run('S.cols=3');ctx.rows=Array.from({length:6},(_,id)=>({id}));assert.deepEqual(columns(run('masonry(rows)')),[2,2,2]);
run('S.cols=0');assert.deepEqual(columns(run('masonry(rows)')),[3,3]);
console.log('PASS: nested saved records, missing/string/invalid image ratios, mixed aspects, finite column heights and two/three-column layouts.');
