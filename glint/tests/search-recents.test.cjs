const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),store={};let blocked=false;
const ctx=vm.createContext({PB_SOURCES:{konachan:{name:'Konachan'},danbooru:{name:'Danbooru'}},S:{src:'konachan',mode:'live'},localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return store[k]||null},setItem:(k,v)=>{if(blocked)throw Error('quota');store[k]=v}},document:{querySelectorAll:()=>[],getElementById:()=>null},renderSearchResults:()=>{},SV:()=>'',I:{x:()=>''}}),run=s=>vm.runInContext(s,ctx),plain=s=>JSON.parse(JSON.stringify(run(s)));
run(app.match(/const esc=[^\n]+/)[0]);run(app.match(/const searchQuery=[^\n]+/)[0]);run(app.slice(app.indexOf('// A small, source-scoped search history'),app.indexOf('// The Search source is the one selected on Home.')));
assert.deepEqual(plain('RECENT_SEARCHES'),[]);
for(const bad of ['{bad','null','{}','42','[null,1,"query",{"query":{},"source":"konachan"}]']){ctx.bad=bad;assert.deepEqual(plain('readSearchHistory(bad)'),[])}
run("rememberSearch('  1girl   ice_cream  ');rememberSearch('landscape');rememberSearch('1girl ice_cream')");assert.deepEqual(plain('recentSearches().map(r=>r.query)'),['1girl ice_cream','landscape']);
run("rememberSearch('rating:g -comic order:score','danbooru')");assert.equal(run('recentSearches().length'),2);assert.equal(JSON.parse(store['pb-search-history-v1']).length,3);
run("for(let i=0;i<25;i++)rememberSearch('tag_'+i)");assert.equal(run('recentSearches().length'),20);assert.equal(run('recentSearches()[0].query'),'tag_24');assert.equal(run("RECENT_SEARCHES.filter(r=>r.source==='danbooru').length"),1);
run("removeRecentSearch('tag_24')");assert.equal(run('recentSearches()[0].query'),'tag_23');run('clearRecentSearches()');assert.equal(run('recentSearches().length'),0);assert.equal(run('RECENT_SEARCHES.length'),1);
run('RECENT_SEARCHES=readSearchHistory()');assert.equal(run('RECENT_SEARCHES.length'),1);run("rememberSearch('<img src=x onerror=alert(1)>')");const html=run('recentSearchesHTML()');assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
blocked=true;assert.doesNotThrow(()=>run("rememberSearch('offline_tag');clearRecentSearches()"));assert.deepEqual(plain('readSearchHistory()'),[]);
console.log('PASS: bounded per-source local recents, normalized exact native queries, dedup/newest-first order, safe bad storage/markup/quota, individual removal and clear without touching other source history.');
