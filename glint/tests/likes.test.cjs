const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sources = fs.readFileSync(path.join(root, 'sources.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const storage = {getItem: () => null, setItem() {}};
const transport = vm.createContext({window:{}, localStorage:storage, sessionStorage:storage, URL, URLSearchParams, console, setTimeout, clearTimeout});
vm.runInContext(sources, transport);
vm.runInContext('PB_AUTH.danbooru={login:"tester",apiKey:"test-key"}; PB_AUTH.yandere={login:"tester",passHash:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', transport);
let requests = [];
transport.respond = url => {
  const u = new URL(url); requests.push(u);
  if (u.pathname === '/counts/posts.json') return {counts:{posts:95}};
  if (u.pathname === '/favorites.json') {
    const cursor = u.searchParams.get('page');
    // Real Danbooru ignores search[order] and returns cursor batches DESC.
    const ids = cursor === 'a400' ? [800,600] : cursor === 'a0' ? [400,100] : [9900,9800];
    return ids.map(id=>({id,post:{id:id===100?1:id/100,md5:'12345678',image_width:400,image_height:600}}));
  }
  if (u.hostname === 'yande.re') {
    const page = +u.searchParams.get('page'), limit = +u.searchParams.get('limit');
    return Array.from({length:Math.max(0,Math.min(limit,95-(page-1)*limit))}, (_,i)=>({id:95-(page-1)*limit-i,preview_url:'preview.jpg',width:400,height:600}));
  }
  return [{id:95,md5:'12345678',image_width:400,image_height:600}];
};
vm.runInContext('pbJSONFriendly=async url=>respond(url)', transport);
const run = code => vm.runInContext(code, transport);
(async () => {
  assert.equal(await run('pbLoadFavoriteCount("danbooru")'), 95);
  let pins = await run('pbLoadFavorites("danbooru",{page:1,limit:40,order:"newest"})');
  assert.equal(pins[0].sid,'95');
  assert.equal(requests.at(-1).searchParams.get('tags'),'ordfav:tester');
  pins = await run('pbLoadFavorites("danbooru",{page:1,limit:2,order:"oldest"})');
  assert.equal(pins[0].sid,'1');
  assert.equal(requests.at(-1).pathname,'/favorites.json');
  assert.equal(requests.at(-1).searchParams.get('search[order]'),null);
  assert.equal(requests.at(-1).searchParams.get('page'),'a0');
  assert.equal(pins.nextCursor,'a400');
  assert.equal(pins.hasMore,true);
  assert.deepEqual(Array.from(pins,p=>p.sid),['1','4']);
  pins = await run('pbLoadFavorites("danbooru",{page:2,limit:2,order:"oldest",cursor:"a400"})');
  assert.equal(requests.at(-1).searchParams.get('page'),'a400');
  assert.deepEqual(Array.from(pins,p=>p.sid),['6','8']);
  assert.equal(pins.nextCursor,'a800');
  assert.equal(requests.at(-1).searchParams.get('search[user_name]'),'tester');
  // Oldest must come from the end of the entire collection, including a partial last page.
  for (const [page,start,end] of [[1,1,40],[2,41,80],[3,81,95]]) {
    pins = await run(`pbLoadFavorites("yandere",{page:${page},limit:40,order:"oldest",total:95})`);
    assert.deepEqual(Array.from(pins,p=>+p.sid),Array.from({length:end-start+1},(_,i)=>start+i));
  }
  const ui = vm.createContext({
    window:{pbLikesOk:()=>true,pbHasAuth:()=>true},pbLikesOk:()=>true,pbHasAuth:()=>true,
    S:{src:'danbooru',mode:'live'}, PB_SOURCES:{danbooru:{name:'Danbooru'}},
    BOOKMARK_VIEW:{source:'all',order:'newest'},
    document:{querySelector:()=>null},CAR:null,SPIN:'spinner',SPIN_IDLE:'spinner',
    I:{sort:()=>'<svg></svg>',srch:()=>'<svg></svg>',chev:()=>''},esc:s=>String(s),
    pc:()=>'',masonry:p=>p.map(p=>p.id).join(','),
    normPin:p=>p,toast:()=>{},esc:s=>String(s),setTimeout,clearTimeout,
    pbLoadFavoriteCount:async()=>95,pbLoadFavorites:async()=>[{id:'new'}]
  });
  vm.runInContext(app.slice(app.indexOf('const FAV={}'),app.indexOf('/* Source tabs live')),ui);
  const headerStart=app.indexOf('function glintHeader(view){'),headerEnd=app.indexOf('\nfunction glintSavedSources',headerStart);
  vm.runInContext(app.slice(headerStart,headerEnd),ui);
  const urun = code => vm.runInContext(code,ui);
  assert.equal(urun('favState(S.src).order'),'newest');
  await urun('loadFavorites(true)');
  assert.match(urun('likesPane()'),/95 liked posts/);
  assert.ok(urun('likesPane()').includes('new<div class="loadmore">'), 'render the loaded like and the separate load-more control');
  assert.match(urun("glintHeader('likes')"),/<span>New<\/span>/,'sort action uses compact New label in the Glint header');
  assert.doesNotMatch(urun('likesPane()'),/>Reload</);
  const toggle = app.slice(app.indexOf('case"favsort":'),app.indexOf('case"favmore":'));
  urun('switch("favsort"){'+toggle+'}');
  assert.equal(urun('favState(S.src).order'),'oldest');
  assert.match(urun("glintHeader('likes')"),/<span>Old<\/span>/,'oldest is exposed by the current compact header action');
  await new Promise(resolve=>setImmediate(resolve));
  urun('switch("favsort"){'+toggle+'}');
  assert.equal(urun('favState(S.src).order'),'newest');
  assert.match(urun("glintHeader('likes')"),/<span>New<\/span>/);
  await new Promise(resolve=>setImmediate(resolve));
  // Rapid taps: the earlier request must not overwrite the latest sort.
  const pending=[];ui.pbLoadFavorites=()=>new Promise(resolve=>pending.push(resolve));
  urun('favState(S.src).order="oldest"');const first=urun('loadFavorites(true)');
  urun('favState(S.src).order="newest"');const second=urun('loadFavorites(true)');
  pending[1]([{id:'latest'}]);await second;
  pending[0]([{id:'stale'}]);await first;
  assert.equal(urun('favState(S.src).pins[0].id'),'latest');
  // The app must pass the favourite cursor onward, not restart from a0.
  const options=[];
  ui.pbLoadFavorites=async(id,opts)=>{options.push(opts);return Object.assign([{id:'cursor-'+options.length}],{nextCursor:'a'+options.length*40,hasMore:options.length<2})};
  urun('favState(S.src).order="oldest"');await urun('loadFavorites(true)');await urun('loadFavorites(false)');
  assert.equal(options[0].cursor,null);
  assert.equal(options[1].cursor,'a40');
  assert.equal(urun('favState(S.src).done'),true);
  assert.equal(urun('favState(S.src).pins.length'),2);
  console.log('PASS: real-API-shaped cursor ordering, account total, both toggle directions, pagination, and rapid-tap safety.');
})().catch(e=>{console.error(e);process.exitCode=1});
