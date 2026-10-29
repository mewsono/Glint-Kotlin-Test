const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ctx=vm.createContext({PB_SOURCES:{danbooru:{name:'Danbooru'},yandere:{name:'yande.re'},e621:{name:'e621'},sankaku:{name:'Sankaku',off:true},gelbooru:{name:'Gelbooru'}},S:{srcs:['danbooru','yandere','sankaku','gelbooru'],hidden:[],bookmarks:[]},BOOKMARK_VIEW:{source:'all',order:'newest'},hasId:(ids,id)=>ids.some(v=>String(v)===String(id)),allPins:()=>[{id:'danbooru:1',src:'danbooru'},{id:'yandere:1',src:'yandere'}]});
vm.runInContext(app.slice(app.indexOf('function migrateBookmarkRecords('),app.indexOf('\nS.bookmarks=migrateBookmarkRecords')),ctx);
const run=s=>vm.runInContext(s,ctx),plain=s=>JSON.parse(JSON.stringify(run(s)));
const boards=[{d:300,pins:['danbooru:1','yandere:1'],seed:['danbooru:999','0']},{d:400,pins:['danbooru:1','e621:2']},{d:500,pins:['sankaku:1']}];
ctx.boards=boards;
const imported=plain('migrateBookmarkRecords([],boards,true)');
assert.deepEqual(imported.map(r=>r.id),['sankaku:1','danbooru:1','e621:2','yandere:1']);
assert.equal(imported.find(r=>r.id==='danbooru:1').savedAt,400);assert.ok(!imported.some(r=>r.id==='0'||r.id==='danbooru:999'));
assert.deepEqual(plain('migrateBookmarkRecords([],boards,false)'),[],'removed saves must not return from archived collections');
assert.deepEqual(plain("migrateBookmarkRecords([{id:'danbooru:1',savedAt:123},{id:'danbooru:1',savedAt:100},null,{}],[],false)"),[{id:'danbooru:1',savedAt:123}]);
run('S.bookmarks=migrateBookmarkRecords([],boards,true)');
vm.runInContext(app.slice(app.indexOf('function bookmarkRows('),app.indexOf('function bookmarkCardHTML(')),ctx);
assert.deepEqual(plain('bookmarkSourceOptions()'),[{id:'danbooru',name:'Danbooru',count:1},{id:'yandere',name:'yande.re',count:1}]);
assert.deepEqual(plain('visibleBookmarkRows().map(r=>r.id)'),['danbooru:1','yandere:1']);
run("BOOKMARK_VIEW.order='oldest'");assert.deepEqual(plain('visibleBookmarkRows().map(r=>r.id)'),['yandere:1','danbooru:1']);
run("BOOKMARK_VIEW.source='danbooru'");assert.deepEqual(plain('visibleBookmarkRows().map(r=>r.id)'),['danbooru:1']);
run("S.hidden=['danbooru:1']");assert.equal(run('bookmarkSourceOptions().length'),1);
run("S.hidden=[];S.srcs.push('e621')");assert.equal(plain('bookmarkSourceOptions()').find(s=>s.id==='e621').count,1,'missing cached media still represents a saved post');
run("S.srcs=['gelbooru']");assert.equal(run('bookmarkRows().length'),0);assert.equal(run('S.bookmarks.length'),4,'disabling sources never deletes their bookmarks');
run("S.srcs=['danbooru'];S.bookmarks=[{id:'danbooru:1',savedAt:5},{id:'danbooru:2',savedAt:5}];BOOKMARK_VIEW.source='all';BOOKMARK_VIEW.order='newest'");
assert.deepEqual(plain('visibleBookmarkRows().map(r=>r.id)'),['danbooru:1','danbooru:2']);run("BOOKMARK_VIEW.order='oldest'");assert.deepEqual(plain('visibleBookmarkRows().map(r=>r.id)'),['danbooru:2','danbooru:1']);
console.log('PASS: one-time real-save migration, no collection seeds/duplicates/resurrection; enabled/nonempty source counts, save-time order, hidden/uncached records and disabled-source preservation.');

// Keyword search is restricted to saved records, combines with the selected
// source/order, and never changes the source's actual saved-post total.
ctx.allPins=()=>[
 {id:'danbooru:1',src:'danbooru',t:'Sunny Beach',tags:['blue_archive','1girl'],characters:['aris_(blue_archive)'],artists:['c_star'],series:['blue_archive']},
 {id:'yandere:1',src:'yandere',t:'Night Portrait',tags:['original'],artists:['hikari']},
 {id:'danbooru:999',src:'danbooru',t:'only_unsaved_needle'}
];
run("S.srcs=['danbooru','yandere'];S.bookmarks=[{id:'danbooru:1',savedAt:200},{id:'yandere:1',savedAt:100}];BOOKMARK_VIEW.source='all';BOOKMARK_VIEW.order='newest'");
for(const q of ['BLUE ARCHIVE Aris','c_star','1girl','sunny beach','ＢＬＵＥ archive','danbooru:1']){
 ctx.q=q;run('BOOKMARK_VIEW.query=q');assert.deepEqual(plain('visibleBookmarkRows().map(r=>r.id)'),['danbooru:1']);
}
run("BOOKMARK_VIEW.query='hikari'");assert.deepEqual(plain('visibleBookmarkRows().map(r=>r.id)'),['yandere:1']);
run("BOOKMARK_VIEW.source='danbooru'");assert.equal(run('visibleBookmarkRows().length'),0);
run("BOOKMARK_VIEW.source='all';BOOKMARK_VIEW.query='only_unsaved_needle'");assert.equal(run('visibleBookmarkRows().length'),0);
assert.deepEqual(plain('bookmarkSourceOptions().map(s=>s.count)'),[1,1]);
console.log('PASS: bookmark-only metadata search, case/underscore normalization, multiple terms, selected-source intersection and unchanged source totals.');
