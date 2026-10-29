/* The profile tabs depend on the source you are on: "Likes" only appears
   once you have written your details for that source — it then lists the
   favourites your account has on that site. "Bookmarks" is universal. */
const hasLikesTab=()=>!!(window.pbLikesOk&&pbLikesOk(S.src)&&window.pbHasAuth&&pbHasAuth(S.src));
const tabsList=()=>hasLikesTab()?["Likes","Bookmarks","Explore"]:["Bookmarks","Explore"];
const defaultSavedTab=()=>hasLikesTab()?"Likes":"Bookmarks";
const GLINT_TAG_FIELDS=new Map();
function tagField(id){const key=id+(id==="likesSearch"?":"+S.src:"");if(!GLINT_TAG_FIELDS.has(key))GLINT_TAG_FIELDS.set(key,{tags:[],draft:""});return GLINT_TAG_FIELDS.get(key)}
function tagFieldQuery(id){const field=tagField(id);return [...field.tags,field.draft.trim()].filter(Boolean).join(" ")}
function clearTagField(id){const field=tagField(id);field.tags=[];field.draft=""}
let TAB_ANIM=null,PAGER_CLEANUP=null;
/* Glint app — your original UI logic, unchanged except:
   1) an 'Install app' row in Settings, 2) PWA deep-link/share handling at the bottom. */
const SV=(p,s,sw,f)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${f||"none"}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I={
plus:s=>SV('<path d="M12 3v18M3 12h18"/>',s||26,1.7),
chat:()=>SV('<path d="M12 2.8c-5 0-9.2 3.9-9.2 8.8s4.2 8.8 9.2 8.8c.9 0 1.8-.1 2.600-.4l4.600 1.900-1.100-3.700c1.900-1.600 3.100-4 3.100-6.600 0-4.900-4.200-8.800-9.200-8.800z"/><circle cx="8" cy="11.600" r=".9" fill="currentColor"/><circle cx="12" cy="11.600" r=".9" fill="currentColor"/><circle cx="16" cy="11.600" r=".9" fill="currentColor"/>',27,1.9),
gear:()=>SV('<circle cx="12" cy="12" r="3.200"/><path d="M12 2.800l1.600.3.5 2.100 1.500.7 1.900-1.100 2.300 2.300-1.100 1.900.7 1.500 2.100.5v3.200l-2.100.5-.7 1.500 1.100 1.900-2.300 2.300-1.900-1.100-1.500.7-.5 2.100h-3.200l-.5-2.100-1.500-.7-1.900 1.100-2.300-2.300 1.100-1.900-.7-1.500-2.100-.5v-3.200l2.100-.5.7-1.500-1.100-1.900 2.300-2.300 1.900 1.100 1.500-.7.5-2.100z"/>',33,1.9),
srch:s=>SV('<circle cx="10.500" cy="10.500" r="6.800"/><path d="M15.700 15.700L21 21"/>',s||27,2.3),
sort:()=>SV('<path d="M7 20V4M3.500 7.500L7 4l3.500 3.500M17 4v16M13.500 16.500L17 20l3.500-3.500"/>',26,2),
chev:()=>SV('<path d="M5 9l7 7 7-7"/>',17,2.800),
lock:()=>SV('<rect x="5" y="10.500" width="14" height="10" rx="3"/><path d="M8.200 10.500V8a3.800 3.800 0 0 1 7.600 0v2.500"/><path d="M12 14.200v2.600"/>',21,2),
homeF:()=>`<svg width="29" height="29" viewBox="0 0 24 24"><path d="M12 2.400c.6 0 1.100.2 1.600.6l6.600 5.400c.5.4.8 1 .8 1.700V19a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-8.900c0-.7.3-1.300.8-1.700L10.400 3c.5-.4 1-.6 1.600-.6z" fill="currentColor"/><path d="M9 14.600c1.800 1.400 4.200 1.400 6 0" stroke="var(--nav)" stroke-width="1.900" stroke-linecap="round" fill="none"/></svg>`,
homeO:()=>SV('<path d="M4 10.400l8-6.600 8 6.600V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',29,2),
back:()=>SV('<path d="M15 5l-7 7 7 7"/>',28,2.300),
heart:f=>SV('<path d="M12 20.500s-8-4.900-8-11A4.500 4.500 0 0 1 12 6.700 4.500 4.500 0 0 1 20 9.500c0 6.100-8 11-8 11z"/>',27,2,f?"currentColor":"none"),
share:()=>SV('<path d="M12 15V3M7.500 7.500L12 3l4.500 4.500M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',26,2),
dots:()=>`<svg width="24" height="7" viewBox="0 0 24 7" fill="currentColor"><circle cx="3.500" cy="3.500" r="2.800"/><circle cx="12" cy="3.500" r="2.800"/><circle cx="20.500" cy="3.500" r="2.800"/></svg>`,
edit:()=>SV('<path d="M17.200 3.500a2.121 2.121 0 0 1 3 3L8.700 18 4 19l1-4.700L17.200 3.500z"/><path d="M14.800 6.400l2.800 2.800"/>',27,1.700),
editPage:()=>SV('<rect x="3.200" y="3.200" width="17.600" height="17.600" rx="4.200"/><path d="M9.400 15.600l.500-2.300 4.900-4.900a1.500 1.500 0 0 1 2.200 2.200l-4.900 4.900-2.700.100z"/>',27,1.600)};
I.x=(s,f)=>SV('<path d="M5 5l14 14M19 5L5 19"/>',s,2,f||"currentColor");
I.bookmark=f=>SV('<path d="M6 3.5h12v17l-6-4-6 4z"/>',27,1.9,f?"currentColor":"none");
/* Corner marks reuse the same shapes, but nudged so the drawn outline is
   exactly centred in its 24x24 box: the heart's lobes sit lower than its tip,
   which pushed the small glyph 0.32px below the middle of the badge. */
I.markHeart=()=>SV('<path transform="translate(0 -0.764)" d="M12 20.500s-8-4.900-8-11A4.500 4.500 0 0 1 12 6.700 4.500 4.500 0 0 1 20 9.500c0 6.100-8 11-8 11z"/>',24,2,'currentColor');
I.markBookmark=()=>SV('<path d="M6 3.5h12v17l-6-4-6 4z"/>',24,1.9,'currentColor');
/* Row controls for a source: pencil = edit, bin = delete/remove. */
I.rowEdit=()=>SV('<path d="M17.200 3.500a2.121 2.121 0 0 1 3 3L8.700 18 4 19l1-4.700L17.200 3.500z"/><path d="M14.800 6.400l2.800 2.800"/>',24,1.800);
I.rowDelete=()=>SV('<path d="M4 7h16M9.500 7V5.200A1.200 1.200 0 0 1 10.700 4h2.600a1.200 1.200 0 0 1 1.200 1.200V7M6.500 7l.800 12.100A1.900 1.900 0 0 0 9.200 21h5.600a1.900 1.900 0 0 0 1.900-1.900L17.500 7M10 11v6M14 11v6"/>',24,1.800);
I.download=()=>SV('<path d="M12 3v12m-5-5 5 5 5-5M4.5 16v4h15v-4"/>',27,1.9);
const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const av=s=>`<svg class="av" width="${s}" height="${s}" viewBox="0 0 40 40"><rect width="40" height="40" fill="#f6a8c4"/><circle cx="31" cy="9" r="5" fill="#8fb8ff"/><circle cx="7" cy="32" r="4" fill="#fff"/><circle cx="20" cy="22" r="14" fill="#ee6c9a"/><ellipse cx="20" cy="24" rx="9" ry="10" fill="#ffe3d3"/><path d="M10 21c1-9 6-12 10-12s9 3 10 12c-4-5-7-7-10-7s-6 2-10 7z" fill="#ee6c9a"/><circle cx="16.500" cy="25" r="1.300" fill="#6a3b8c"/><circle cx="23.500" cy="25" r="1.300" fill="#6a3b8c"/></svg>`;
const CATS=["Anime Art","Aesthetic","Games","Travel","Lights","Gifs"];
const T=["Soft pastel portrait","Neon alley","Retro console","Cherry blossom tower","Warm lamp glow","Rainy window","Pixel sunset","Mountain railway","Winter lights","Cozy bedroom","Dreamy clouds","Night market","Floral crown","Old arcade","Misty forest","City rooftop","Paper lanterns","Coastal drive","Velvet curtains","Snowy street"];
let sd=7;const R=()=>(sd=(sd*16807)%2147483647)/2147483647;
const PINS=Array.from({length:48},(_,i)=>{const h=Math.floor(R()*360);return{id:i,t:T[i%T.length],c:CATS[i%CATS.length],h,h2:(h+50+Math.floor(R()*80))%360,r:[1.3,1.05,1.5,.9,1.4][i%5],x:Math.floor(R()*50)+15}});
const ids=(c,n,rev)=>{let a=PINS.filter(p=>p.c===c).map(p=>p.id);if(rev)a.reverse();return a.slice(0,n)};
const H=36e5,D=24*H;
const DEF={boards:[
{id:1,n:"Ai news Art",p:0,g:0,n0:12,d:Date.now()-270*D,seed:ids("Anime Art",3,1)},
{id:2,n:"Anime Waifus",p:0,g:1,n0:1553,d:Date.now()-42*6e4,seed:ids("Anime Art",8)},
{id:3,n:"icon",p:1,g:0,n0:94,d:Date.now()-20*D,seed:ids("Aesthetic",6)},
{id:4,n:"My Saves",p:1,g:0,n0:210,d:Date.now()-3*D,seed:ids("Gifs",8,1)},
{id:5,n:"Beloved dolls",p:1,g:0,n0:78,d:Date.now()-7*D,seed:ids("Aesthetic",8,1)},
{id:6,n:"Christmas lights outside",p:1,g:0,n0:148,d:Date.now()-180*D,seed:ids("Lights",8)},
{id:7,n:"Genshin Impact",p:1,g:0,n0:603,d:Date.now()-120*D,seed:ids("Anime Art",8,1).reverse()},
{id:8,n:"Extras",p:1,g:0,n0:0,d:Date.now()-365*D,seed:[]},
{id:9,n:"Girl",p:1,g:0,n0:660,d:Date.now()-D,seed:ids("Aesthetic",8)},
{id:10,n:"Gifs",p:1,g:0,n0:35,d:Date.now()-120*D,seed:ids("Gifs",8)}],
bookmarks:[],bookmarkVersion:0,bmDeleted:{},likes:[],hidden:[],tab:"All",screen:"home",cols:2,theme:"dark",pf:"all",sort:"custom",bt:"Bookmarks",lv:"liked",sw:"left",q:"",bq:"",open:null,custom:[],pinCache:{},
src:"danbooru",mode:"live",live:{},lpage:{},ltags:"",proxy:"./api/proxy",
srcs:["danbooru","yandere"],forder:{},explore:[],expage:{},exdone:{},stags:{},
iq:{feed:"thumb",detail:"sample",viewer:"orig"},
driveOn:false,driveAuto:true,driveClientId:"",driveFileId:"",driveMod:"",driveDirty:false,driveEmail:"",lastSync:0,syncKeys:false,setAt:0};
for(const b of DEF.boards)b.pins=[];
let S=PB_RUNTIME.load(DEF,PB_SOURCES);
if(!window.PB_SRC_ORDER.includes(S.src))S.src="danbooru";
if(!["live","demo"].includes(S.mode))S.mode="live";
S.live=S.live||{};S.lpage=S.lpage||{};S.pinCache=S.pinCache||{};
S.srcs=Array.isArray(S.srcs)&&S.srcs.length?S.srcs.filter(x=>window.PB_SOURCES[x]):["danbooru","yandere"];
S.explore=Array.isArray(S.explore)?S.explore:[];S.expage=S.expage||{};S.exdone=S.exdone||{};S.stags=S.stags||{};
if(S.ltags&&!S.stags[S.src])S.stags[S.src]=S.ltags;
if(!S.srcs.includes(S.src))S.src=S.srcs[0];S.likes=(S.likes||[]).map(String);
S.iq=Object.assign({feed:"thumb",detail:"sample",viewer:"orig"},S.iq&&typeof S.iq==="object"?S.iq:{});S.hidden=(S.hidden||[]).map(String);
S.boards.forEach(b=>{b.pins=(b.pins||[]).map(String);b.seed=(b.seed||[]).map(String)});
if(S.bt==="Pins")S.bt="Likes";if(S.bt==="Boards")S.bt="Bookmarks";if(S.bt==="Collages")S.bt="Explore";if(!["Likes","Bookmarks","Explore"].includes(S.bt))S.bt="Bookmarks";if(!["liked","saved"].includes(S.lv))S.lv="liked";if(!["left","right"].includes(S.sw))S.sw="left";
// Import actual user saves once, not the sample collection covers/seeds.
// Keep legacy collections in storage as an archive; they are no longer a
// bookmark UI or save destination, and removing a bookmark cannot re-import it.
function migrateBookmarkRecords(records,boards,importLegacy){
  const saved=new Map();
  const add=(value,time)=>{
    const id=typeof value==="string"||typeof value==="number"?String(value).trim():"";
    if(!id)return;
    const stamp=Number(time),savedAt=Number.isFinite(stamp)&&stamp>0?stamp:0;
    if(!saved.has(id)||savedAt>saved.get(id).savedAt)saved.set(id,{id,savedAt});
  };
  for(const record of Array.isArray(records)?records:[]){
    if(record&&typeof record==="object")add(record.id,record.savedAt);else add(record,0);
  }
  if(importLegacy)for(const board of Array.isArray(boards)?boards:[]){
    const stamp=Number(board.d)||0;
    (Array.isArray(board.pins)?board.pins:[]).forEach((id,i)=>add(id,Math.max(0,stamp-i)));
  }
  return [...saved.values()].sort((a,b)=>b.savedAt-a.savedAt);
}
S.bookmarks=migrateBookmarkRecords(S.bookmarks,S.boards,S.bookmarkVersion!==1);
S.bookmarkVersion=1;S.open=null;
/* drive.js (Google Drive sync) works on this same state. `const` bindings are not
   properties of window, so the state is handed over explicitly; the functions it
   needs are declarations and already global. */
window.S=S;
const BOOKMARK_VIEW={source:"all",order:"newest",query:""};
/* Writing the whole state to localStorage is synchronous and shows up as jank
   in a scroll. Coalesce bursts into one write on the next idle moment, and
   flush immediately for the things that must survive a crash (bookmarks,
   accounts, settings, page hide). */
let SAVE_TIMER=null,SAVE_PENDING=false;
function writeState(){return PB_RUNTIME.persist(S)}
function flushSave(){clearTimeout(SAVE_TIMER);SAVE_TIMER=null;if(!SAVE_PENDING)return true;SAVE_PENDING=false;return writeState()}
function save(now){
  if(now)return writeState();            // caller needs the result now
  SAVE_PENDING=true;
  if(SAVE_TIMER)return true;
  const write=()=>{SAVE_TIMER=null;flushSave()};
  SAVE_TIMER=typeof requestIdleCallback==="function"?requestIdleCallback(write,{timeout:600}):setTimeout(write,120);
  return true;
}
addEventListener("pagehide",flushSave);addEventListener("beforeunload",flushSave);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushSave()});
const $=s=>document.querySelector(s),app=$("#app");
const eqId=(a,b)=>String(a)===String(b);
const hasId=(arr,id)=>arr.some(x=>String(x)===String(id));
const livePins=()=>S.live[S.src]||[];
/* Posts shown in Explore sections / its full view are real app pins too, so
   tapping one opens it instead of reporting it as missing. */
function explorePins(){
  const out=[];
  try{for(const st of EX_DATA.values())out.push(...st.pins);for(const f of EX_FEEDS.values())out.push(...f.pins)}catch(e){}
  return out;
}
const allPins=()=>S.custom.concat(PINS).concat(Object.values(S.live).flat()).concat(S.explore||[]).concat(Object.values(FAV).flatMap(f=>f.pins)).concat(SRES||[]).concat(Object.values(S.pinCache)).concat(relatedPins()).concat(tagFeedPins()).concat(explorePins());
const pin=id=>allPins().find(p=>eqId(p.id,id));
const bpins=b=>b.pins.concat(b.seed).filter((v,i,a)=>a.indexOf(v)===i);
const PORT=["Anime Art","Aesthetic","Gifs"];
/* Image quality: the feed, the post page and the full-screen viewer each pick
   their own file from the three the source gave us. "Fast" is the small
   preview, "Sharp"/"Original" the larger ones; a missing file falls back. */
const IQ_CHOICES={feed:["thumb","sharp"],detail:["sample","orig"],viewer:["sample","orig"]};
const IQ_FALLBACK={feed:{thumb:["grid","sample","orig"],sharp:["sample","orig","grid"]},detail:{sample:["sample","orig","grid"],orig:["orig","sample","grid"]},viewer:{sample:["sample","orig","grid"],orig:["orig","sample","grid"]}};
function iqValue(kind){const v=S.iq&&S.iq[kind];return (IQ_CHOICES[kind]||[]).includes(v)?v:Object.keys(IQ_FALLBACK[kind]||{})[0]}
function iqURL(p,kind){if(!p)return"";const order=(IQ_FALLBACK[kind]||{})[iqValue(kind)]||[];for(const k of order){if(p[k])return p[k]}return p.grid||p.sample||p.orig||""}
/* The first screenful is fetched at high priority and eagerly; everything below
   stays lazy, so a long feed never competes with what the user is looking at. */
let ART_PRIO=0;
function art(p,x,full){
const video=!!p&&isVideoPin(p),posters=video?videoPosterSources(p):[];
if(p&&(p.grid||video)){
const src=video?(posters[0]||""):(full?(p.sample||p.orig||p.grid):iqURL(p,"feed"));
if(video&&!src)return `<div class="art live video-no-poster${full?" full":""}" style="aspect-ratio:1/${masonryRatio(p)}">${x||""}</div>`;
const eager=full||ART_PRIO++<6,prio=full||eager&&ART_PRIO<=6?"high":"low",fallbacks=video&&posters.length>1?` data-poster-fallback="${esc(JSON.stringify(posters.slice(1)))}"`:"";
return `<div class="art live${full?" full":""}" style="aspect-ratio:1/${masonryRatio(p)}">${x||""}<img src="${esc(PB_RUNTIME.mediaURL(src))}"${fallbacks} alt="" loading="${eager?"eager":"lazy"}" decoding="async" fetchpriority="${prio}" referrerpolicy="no-referrer"></div>`;}
p={...p,r:masonryRatio(p),h:Number(p.h)||0,h2:Number(p.h2)||0,x:Number(p.x)||0};const W=100,Hh=Math.round(100*p.r),sk=`hsl(28 70% 88%)`,hair=`hsl(${p.h2} 35% ${p.id%2?20:68}%)`,cl=`hsl(${p.h} 55% ${p.id%3?86:38}%)`;let g;
if(PORT.includes(p.c)){const o=Hh-130;g=`<g transform="translate(${(p.x-50)/8} ${o})"><path d="M24 52C20 22 36 8 50 8s30 14 26 44c-2 22 8 34 6 60H18c-2-26 8-38 6-60z" fill="${hair}"/><path d="M6 130c2-30 22-42 44-42s42 12 44 42z" fill="${cl}"/><ellipse cx="50" cy="58" rx="17" ry="21" fill="${sk}"/><path d="M33 54c2-18 12-24 17-24s15 6 17 24c-6-9-12-13-17-13s-11 4-17 13z" fill="${hair}"/><ellipse cx="43" cy="62" rx="2.200" ry="3.200" fill="hsl(${p.h} 60% 30%)"/><ellipse cx="57" cy="62" rx="2.200" ry="3.200" fill="hsl(${p.h} 60% 30%)"/></g>`}
else g=`<circle cx="${p.x+10}" cy="${Hh*.28}" r="13" fill="hsl(${p.h2} 90% 88%)"/><path d="M0 ${Hh} L0 ${Hh*.7} L28 ${Hh*.5} L52 ${Hh*.72} L76 ${Hh*.45} L100 ${Hh*.68} V${Hh}z" fill="hsl(${p.h2} 45% 35%)"/><path d="M0 ${Hh} L0 ${Hh*.85} L35 ${Hh*.68} L70 ${Hh*.86} L100 ${Hh*.75} V${Hh}z" fill="hsl(${p.h} 40% 22%)"/>`;
return `<div class="art" style="aspect-ratio:1/${p.r};background:linear-gradient(${150+p.h%50}deg,hsl(${p.h} 60% 82%),hsl(${p.h2} 55% 58%))"><svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="xMidYMax slice">${g}</svg>${x||""}</div>`}
/* ── live booru feed ─────────────────────────────────────────────────── */
let LOADING=false,MORE=true,SRES=null,STIMER=null;
/* Set while a source switch is in flight: every render keeps the feed at the
   top, so the new source never inherits the scroll offset of the old one. */
let WANT_TOP=false;
/* A source switch that lands while another load is still running is parked
   here and picked up the moment that load finishes. */
let PEND=null;
/* Safety net: if a switch never reaches loadLive (e.g. the search screen),
   the "stay on top" flag must not stay on forever. */
let TOPTO=null;
function pinTop(){WANT_TOP=true;clearTimeout(TOPTO);TOPTO=setTimeout(()=>{WANT_TOP=false},2600);}
/* A single spinning circle replaces every "Loading…/Load more" label. */
const SPIN='<span class="spin" role="status" aria-label="Loading"></span>';
const SPIN_IDLE='<span class="spin idle" aria-hidden="true"></span>';
function normPin(p,srcId){
  const s=PB_SOURCES[srcId];
  return {id:srcId+":"+p.sid,src:srcId,sid:p.sid,t:p.title||"",c:s?s.short:srcId,
    r:p.ar||1.2,h:0,h2:0,x:50,grid:p.grid,sample:p.sample,orig:p.orig,
    tags:p.tags||[],rating:p.rating||"s",score:p.score||0,author:p.author||"",
    date:p.date||Date.now(),srcName:s?s.name:srcId,width:p.w||0,height:p.h||0,...pbPostMetadata(p,srcId),...pbPostFileInfo(p),...pbPostSourceInfo(p),...pbPostUploadInfo(p)};
}
/* ── Explore ────────────────────────────────────────────────────────────
   A mixed feed drawn from every source in your tab row, interleaved so no
   single site can take over the grid. Each source keeps its own page
   counter and is dropped once it runs out of posts.                        */
let EXBUSY=false,EXDONE="",EX_SRC="",EX_SEC=[];
const EX_DATA=new Map();            // section key -> its state (period included)
const EX_FEEDS=new Map();           // full-view sheet state
const exploreKey=()=>S.src;
const exploreIds=()=>[S.src].filter(id=>window.PB_SOURCES[id]&&!window.PB_SOURCES[id].off);
// One state per section: the period is a property of that view, not a new key.
const exKey=sec=>sec.key;
function exploreMore(){return EX_SEC.some(sec=>{const st=EX_DATA.get(exKey(sec));return !!st&&!st.done})}
function exBusy(){EXBUSY=[...EX_DATA.values()].some(st=>st.busy);EXDONE=EXBUSY?"":exploreKey()}
function cancelExplore(){for(const st of EX_DATA.values()){st.controller?.abort();st.controller=null}EXBUSY=false;EXDONE=""}
function exploreReset(src){cancelExplore();EX_SRC=src;EX_SEC=src?pbExploreSections(src):[];EX_DATA.clear();EX_FEEDS.clear();EXDONE=""}
function exState(sec,scale){const key=exKey(sec);let st=EX_DATA.get(key);
  if(!st){st={key,section:sec,kind:sec.key,scale:scale||sec.def||"",pins:[],tags:[],page:0,loaded:false,started:false,busy:false,done:false,error:"",request:0,controller:null};EX_DATA.set(key,st)}
  else if(scale)st.scale=scale;
  return st}
/* A video post gets a play mark on its thumbnail, wherever the card is drawn. */
const VIDEO_TYPES=/^(?:mp4|webm|mov|mkv|m4v)$/i;
function isVideoPin(p){
  if(!p)return false;
  if(VIDEO_TYPES.test(String(p.fileType||"").trim()))return true;
  if(VIDEO_TYPES.test(String(p.meta?.file_ext||p.meta?.file?.ext||"").trim()))return true;
  return [p.orig,p.sample,p.grid].some(isVideoURL);
}
function isVideoURL(u){
  let value=String(u||"").trim();if(!value)return false;
  try{const parsed=new URL(value,location.href);if(parsed.pathname.endsWith("/api/proxy")){const target=parsed.searchParams.get("u");if(target&&target!==value)return isVideoURL(target)}value=parsed.pathname}
  catch(e){value=value.split(/[?#]/,1)[0]}
  return VIDEO_TYPES.test(value.split("/").pop()?.split(".").pop()||"");
}
/* The file that actually plays: the source's own upload first, then whatever
   other URL is a video. Poster is any still we have for it. */
function videoURL(p){
  if(!p||!isVideoPin(p))return "";
  const video=[p.orig,p.sample,p.grid].find(u=>u&&isVideoURL(u));
  return PB_RUNTIME.mediaURL(video||p.orig||p.sample||"");
}
/* Play the file straight from the site's own CDN: the browser then streams it
   with real Range requests, so playback starts at once and seeking works. The
   proxied copy stays as a declared fallback if the CDN refuses the request. */
function videoPlayback(p){
  const src=videoURL(p);if(!src)return null;
  let direct=src,fallback="";
  try{
    const u=new URL(src,location.href);
    if(u.pathname.endsWith('/api/proxy')&&u.searchParams.get('u')){direct=PB_RUNTIME.mediaURL(u.searchParams.get('u'))||src;fallback=direct===src?'':src}
    else if(u.origin!==location.origin&&u.protocol==='https:'){fallback=new URL('./api/proxy',location.href).href+'?u='+encodeURIComponent(u.href)}
  }catch(e){}
  return {src:direct||src,fallback};
}
function videoPosterSources(p){
  if(!p)return [];
  const seen=new Set(),out=[];
  for(const raw of [p.grid,p.sample,p.orig]){if(!raw||isVideoURL(raw))continue;const url=PB_RUNTIME.mediaURL(raw);if(url&&!seen.has(url)){seen.add(url);out.push(url)}}
  return out;
}
function videoPoster(p){return videoPosterSources(p)[0]||""}
const PLAY_BADGE=`<span class="vidb" role="img" aria-label="Video">${SV('<circle cx="12" cy="12" r="9.5" fill="rgba(0,0,0,.55)" stroke="rgba(255,255,255,.92)" stroke-width="1.6"/><path d="M10 8.2l6 3.8-6 3.8z" fill="#fff" stroke="none"/>',22,1.6)}</span>`;
/* ── Explore ─────────────────────────────────────────────────────────────
   Explore mirrors each site's own explore views for the source selected on
   Home (as Boorusama does per booru):
     • Danbooru   – Popular (day/week/month, by date), Hot (order:rank),
                    Most viewed (by date), Popular searches
     • Moebooru   – Popular recent/day/week/month (yande.re, Konachan, Sakuga)
     • e621/e926  – Popular (day/week/month)
     • Philomena / Gelbooru – no explore page of their own; only the global
                    top-score order, labelled honestly as that.
   Every view loads separately, so one failing view never blanks the others,
   and each keeps its own Retry and period choice.                          */
/* Does this view have another page? The endpoints that state it win; the ones
   that stay quiet are paged only where the site really pages (sec.paged), and
   only while pages keep bringing something new. */
function exHasMore(sec,posts,added,page){
  if(typeof posts?.hasMore==="boolean")return posts.hasMore;
  if(sec.paged===false)return false;
  return !!added&&page<60;
}
async function exploreLoad(sec,{scale=null,reset=false,more=false}={}){
  if(!sec||!PB_SOURCES[S.src])return;
  const st=exState(sec,scale);
  if(st.busy)return;
  if(!reset&&!more&&st.loaded)return;          // a section strip is one page
  if(!reset&&more&&(st.done||!st.loaded))return;
  if(reset){st.controller?.abort();st.pins=[];st.tags=[];st.page=0;st.loaded=false;st.done=false;st.error="";st.didReveal=false}
  const src=S.src,request=++st.request,controller=new AbortController(),version=sourceAuthVersion(src);
  st.controller=controller;st.busy=true;st.started=true;exBusy();refreshExplore();
  let timer,timedOut=false;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error("This explore view took too long. Tap Retry."))},18000)});
  try{
    if(sec.tags){
      const list=await Promise.race([pbLoadExplore(src,{kind:"searches",signal:controller.signal}),deadline]);
      if(request!==st.request)return;
      st.tags=list;st.pins=[];st.done=true;st.loaded=true;
    }else{
      const page=st.page+1;
      const posts=await Promise.race([pbLoadExplore(src,{kind:sec.key,scale:st.scale,page,limit:24,signal:controller.signal}),deadline]);
      if(request!==st.request||version!==sourceAuthVersion(src))return;
      const seen=new Set(st.pins.map(p=>String(p.id))),before=st.pins.length;
      for(const raw of posts){const p=normPin(raw,src);if(!seen.has(String(p.id))){seen.add(String(p.id));st.pins.push(p)}}
      if(st.pins.length>240)st.pins=st.pins.slice(-240);
      st.page=page;st.loaded=true;st.done=st.pins.length<=before||!exHasMore(sec,posts,st.pins.length>before,page);
    }
  }catch(e){
    if(request!==st.request)return;
    if(controller.signal.aborted&&!timedOut)return;   // superseded, not failed
    st.error=pbRedactSecrets(e?.message||"Could not load this explore view.");st.loaded=true;
  }finally{
    clearTimeout(timer);
    if(request===st.request){st.controller=null;st.busy=false;st.loaded=true;exBusy();refreshExplore()}
  }
}
/* Load (or reload) every view for the source selected on Home. */
/* The pane asks for its own data: waiting for an idle callback starved on
   slow devices, which left Explore empty until something was touched. */
let EX_SCHEDULE=null;
/* Only schedule work that is actually outstanding: the pane is redrawn every
   time a view finishes, so an unconditional timer would re-render forever. */
function exploreNeedsLoad(){
  if(EX_SRC!==S.src||!EX_SEC.length)return true;
  const secs=pbExploreSections(S.src);
  if(secs.length!==EX_SEC.length)return true;
  return secs.some(sec=>{const st=EX_DATA.get(exKey(sec));return !st||(!st.loaded&&!st.busy)});
}
function scheduleExplore(){
  if(EX_SCHEDULE||!exploreNeedsLoad())return;
  EX_SCHEDULE=setTimeout(()=>{EX_SCHEDULE=null;exploreEnsure()},0);
}
function exploreEnsure(force=false){
  // Only a source change may drop the cache: clearing on every render would
  // throw away requests that are already in flight.
  let touched=false;
  if(EX_SRC!==S.src){exploreReset(S.src);touched=true}
  EX_SEC=pbExploreSections(S.src);
  EX_SEC.forEach(sec=>{const st=EX_DATA.get(exKey(sec));if(force||!st||!st.started){touched=true;exploreLoad(sec,{reset:true})}});
  if(touched)refreshExplore();
}
function loadExplore(retry=false){exploreEnsure(retry)}
/* The one-view Explore is a real feed: it loads the next page when you get
   near the bottom instead of offering a See more button. */
function exploreScrollMore(){
  if(S.screen!=="profile"||S.bt!=="Explore"||EX_SEC.length!==1||$("#ov").classList.contains("show"))return;
  const sec=EX_SEC[0],st=EX_DATA.get(exKey(sec));
  if(!st||!st.loaded||st.busy||st.done||st.error)return;
  if(scrollY+innerHeight>document.body.scrollHeight-800)exploreLoad(sec,{more:true});
}
function trimLive(id){
  const a=S.live[id];if(!a)return;
  if(a.length>240){a.splice(0,a.length-240)}
}
let LIVE_REQUEST=null,LIVE_SERIAL=0;
/* Feed order is per source and persisted. "Newest" is the source default and
   adds no sort token; "Popular" is only offered where the source supports a
   real server-side popularity order. */
function feedOrderFor(id){return S.forder?.[id]==="popularity"&&pbPostPopularitySupported(id)?"popularity":"newest"}
function feedOrderLabel(order){return order==="popularity"?"Popular":"Newest"}
function feedOrderTitle(id,order){
  if(!pbPostPopularitySupported(id))return "Popular sorting is not available for this source.";
  return order==="popularity"?"Sorted by the source's own score/ranking. Tap for newest uploads.":"Newest uploads first. Tap to sort by popularity.";
}
function feedSortHTML(id,kind="feedsort",live=true){
  const order=feedOrderFor(id),supported=live&&pbPostPopularitySupported(id),title=live?feedOrderTitle(id,order):"Live posts only";
  return `<button type="button" class="chip feed-sort" data-a="${kind}" data-order="${order}" aria-pressed="${order==="popularity"}" aria-label="${esc(title)}" title="${esc(title)}" ${supported?"":"disabled"}>${I.sort()}<span>${live?feedOrderLabel(order):"Newest"}</span></button>`;
}
/* Fills the offline cache on the first visit: once the service worker controls
   this page, the screen is drawn once more so its data and pictures are kept
   for offline use. Runs at most once per session. */
window.addEventListener?.("pb-shell-ready",()=>{
  try{
    if(S.screen==="home"&&S.mode==="live")loadLive(true);
    else if(S.screen==="profile"&&S.bt==="Explore")exploreEnsure(true);
    else if(S.screen==="profile"&&S.bt==="Likes")loadFavorites(true);
  }catch(e){}
});
const LIVE_STATUS=Object.create(null),LIVE_TIMEOUT=18000;
/* A switch load is parked for a moment so that tapping three sources in a row
   only ever fetches the one you stopped on. */
let SRC_LOAD_TIMER=null;
function queueLive(reset){
  clearTimeout(SRC_LOAD_TIMER);
  SRC_LOAD_TIMER=setTimeout(()=>{SRC_LOAD_TIMER=null;loadLive(reset)},150);
}
function cancelLive(){clearTimeout(SRC_LOAD_TIMER);SRC_LOAD_TIMER=null;if(LIVE_REQUEST){LIVE_REQUEST.controller.abort();LIVE_REQUEST=null}LOADING=false;LIVE_SERIAL++;PEND=null}
async function loadLive(reset){
  // Home is deliberately control-free: it always shows the source's own newest
  // uploads. Order is chosen on the tag feed / related art, never here.
  const id=S.src,tags=S.stags[id]||"",order="newest",auth=typeof pbAuthVersion==="function"?pbAuthVersion(id):0;
  if(LOADING&&LIVE_REQUEST?.source===id&&LIVE_REQUEST.tags===tags&&LIVE_REQUEST.order===order&&!reset)return;
  if(LIVE_REQUEST)cancelLive();
  if(reset){S.lpage[id]=1;S.live[id]=[];LIVE_STATUS[id]={more:true,error:""}}
  const status=LIVE_STATUS[id]||(LIVE_STATUS[id]={more:true,error:""});MORE=status.more;
  if(!MORE&&!reset)return;
  const controller=new AbortController(),request={source:id,tags,order,controller,serial:++LIVE_SERIAL},page=S.lpage[id]||1;LIVE_REQUEST=request;
  const current=()=>LIVE_REQUEST===request&&request.serial===LIVE_SERIAL&&S.src===id&&(S.stags[id]||"")===tags&&auth===(typeof pbAuthVersion==="function"?pbAuthVersion(id):0);
  let timedOut=false,timer;LOADING=true;status.error="";
  // A spinner on the tail is all that changed: re-rendering the whole feed here
  // would rebuild every card (and every decoded picture) for nothing.
  if(S.screen==="home"&&!feedTailBusy())render();
  try{
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error("Loading took too long. Tap Retry."))},LIVE_TIMEOUT)});
    const ps=await Promise.race([pbLoadPosts(id,{tags,page,limit:40,order,signal:controller.signal}),deadline]);if(!current())return;
    const arr=S.live[id]||(S.live[id]=[]),seen=new Set(arr.map(x=>String(x.id)));
    ps.forEach(p=>{const n=normPin(p,id);if(!seen.has(String(n.id))){seen.add(String(n.id));arr.push(n)}});
    status.more=typeof ps.hasMore==="boolean"?ps.hasMore:((Number.isSafeInteger(ps.rawCount)?ps.rawCount:ps.length)>=40);
    MORE=status.more;S.lpage[id]=page+1;trimLive(id);
  }catch(e){if(!current())return;
    let message=timedOut?"Loading took too long. Tap Retry.":e?.name==="AbortError"?"Loading was interrupted. Tap Retry.":(!navigator.onLine?"You're offline — showing what is already saved on this device.":pbRedactSecrets(e?.message||"Could not load this source."));
    status.error=message;status.more=true;MORE=true}
  finally{clearTimeout(timer);if(LIVE_REQUEST===request){LIVE_REQUEST=null;LOADING=false;WANT_TOP=false;
    // Extending the feed keeps every existing card; only a real change of
    // screen, source or order needs the full render.
    const extended=S.screen==="home"&&!reset&&appendToFeed(livePins().filter(p=>!p.src||p.src===S.src).filter(p=>!hasId(S.hidden,p.id)));
    if(!extended&&S.screen==="home")render()}}
}
// Search uses the selected source's native tag query, not title matching.
// Update only results/suggestions while typing so the input and caret survive.
let SEARCH=null,SEARCH_SERIAL=0,SEARCH_AUTO_TIMER=null;
const SEARCH_LIMIT=40,SEARCH_TIMEOUT=15000;
let SEARCH_TAGS={serial:0,items:[],active:-1,token:null,controller:null},SEARCH_TAG_TIMER=null;
const searchQuery=value=>String(value||"").trim().replace(/\s+/g," ");
function searchTagToken(value,caret){
  value=String(value||"");caret=Math.max(0,Math.min(value.length,caret??value.length));
  let start=caret,end=caret;while(start>0&&!/\s/.test(value[start-1]))start--;while(end<value.length&&!/\s/.test(value[end]))end++;
  const raw=value.slice(start,caret),prefix=/^[-~]/.test(raw)?raw[0]:"",term=raw.slice(prefix.length);
  return term.length>=2&&!/[\s:*?"'|<>]/.test(term)?{start,end,prefix,term:term.toLowerCase(),caret}:null;
}
// A small, source-scoped search history, stored only on this device. Keep it
// separate from pb2 so clearing recents cannot touch bookmarks or accounts.
const SEARCH_HISTORY_KEY="pb-search-history-v1",SEARCH_HISTORY_LIMIT=20;
function normalizeSearchHistory(records){
  const seen=new Set(),counts=new Map();
  return (Array.isArray(records)?records:[]).filter(r=>r&&typeof r.query==="string"&&typeof r.source==="string"&&Object.hasOwn(PB_SOURCES,r.source)&&searchQuery(r.query)&&r.query.length<=2048)
    .map(r=>({query:searchQuery(r.query),source:r.source,searchedAt:Number.isSafeInteger(r.searchedAt)&&r.searchedAt>0?r.searchedAt:0}))
    .sort((a,b)=>b.searchedAt-a.searchedAt).filter(r=>{const key=JSON.stringify([r.source,r.query]),n=counts.get(r.source)||0;if(seen.has(key)||n>=SEARCH_HISTORY_LIMIT)return false;seen.add(key);counts.set(r.source,n+1);return true}).slice(0,200);
}
function readSearchHistory(value){
  try{return normalizeSearchHistory(JSON.parse(value===undefined?localStorage.getItem(SEARCH_HISTORY_KEY)||"[]":value||"[]"))}catch(e){return []}
}
let RECENT_SEARCHES=readSearchHistory(),SEARCH_COMPOSING=false;
function persistSearchHistory(){try{localStorage.setItem(SEARCH_HISTORY_KEY,JSON.stringify(RECENT_SEARCHES))}catch(e){}}
function recentSearches(){return RECENT_SEARCHES.filter(r=>r.source===S.src)}
function rememberSearch(value,source=S.src){
  if(S.mode!=="live")return;
  const query=searchQuery(value);if(!query||query.length>2048)return;
  RECENT_SEARCHES=normalizeSearchHistory([{query,source,searchedAt:Date.now()},...RECENT_SEARCHES.filter(r=>r.source!==source||r.query!==query)]);persistSearchHistory();
}
function rememberFinishedSearch(){
  const f=SEARCH;if(f&&f.source===S.src&&f.serial===SEARCH_SERIAL&&!f.busy&&!f.error&&f.page>0)rememberSearch(f.query,f.source);
}
function recentSearchesHTML(){
  const records=recentSearches(),source=PB_SOURCES[S.src]?.name||S.src;
  return `<section class="search-recents" aria-labelledby="recent-searches-title"><div class="recent-heading"><h2 id="recent-searches-title" tabindex="-1">Recent searches</h2>${records.length?`<button type="button" class="recent-clear" data-a="recentclear" aria-label="Clear recent searches for ${esc(source)}">Clear</button>`:""}</div>
  ${records.length?`<ul class="recent-list">${records.map(r=>`<li><button type="button" class="recent-run" data-a="recentsearch" data-v="${esc(r.query)}" aria-label="Search for ${esc(r.query)}" title="${esc(r.query)}">${SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',20,1.7)}<span>${esc(r.query)}</span></button><button type="button" class="recent-remove" data-a="recentremove" data-v="${esc(r.query)}" aria-label="Remove ${esc(r.query)} from recent searches">${I.x(15,"none")}</button></li>`).join("")}</ul>`:`<div class="recent-empty"><p>No recent searches yet.</p><p>Search by tag and press Enter. Your recent searches will appear here.</p><p class="recent-help">Separate tags with spaces. Use underscores within a tag. Exclude a tag with a minus sign.</p></div>`}</section>`;
}
function removeRecentSearch(query){
  const index=recentSearches().findIndex(r=>r.query===query);
  RECENT_SEARCHES=RECENT_SEARCHES.filter(r=>r.source!==S.src||r.query!==query);persistSearchHistory();renderSearchResults();
  const buttons=document.querySelectorAll(".recent-remove");(buttons[Math.min(Math.max(0,index),buttons.length-1)]||document.getElementById("recent-searches-title"))?.focus({preventScroll:true});
}
function clearRecentSearches(){
  RECENT_SEARCHES=RECENT_SEARCHES.filter(r=>r.source!==S.src);persistSearchHistory();renderSearchResults();document.getElementById("recent-searches-title")?.focus({preventScroll:true});
}
function submitSearch(value){
  const input=document.getElementById("q");value=searchQuery(value===undefined?input?.value??S.q:value);
  if(input)input.value=value;
  closeSearchTags();rememberSearch(value);doSearch(value,true);save();input?.blur();scrollTo(0,0);
}
/* Nothing searches while you type: the text waits in the box until Enter (or an
   explicit action such as dropping a chip, picking a suggestion or hitting the
   search button). `searchDraft()` is the text in the box, `S.q` is the query
   that is actually applied, and the accent ring shows when they differ. */
const searchDraft=()=>{const input=document.getElementById("q");return input?input.value:S.q};
// Re-renders of the Search tab keep whatever is still unsubmitted in the box.
const searchDraftValue=()=>{if(S.screen!=="search")return S.q;const input=document.getElementById("q");return input?input.value:S.q};
const searchTokens=(query=undefined)=>searchQuery(query===undefined?searchDraft():query).split(" ").filter(Boolean);
/* Committed chip fields work the same way: a half-typed token is a draft and
   waits, committing it with space or Enter applies it. */
const draftPending=value=>!!String(value||"")&&!/\s$/.test(String(value));
function markSearchPending(){
  const input=document.getElementById("q");if(!input)return;
  input.closest(".search-tag-field")?.classList.toggle("glint-search-pending",searchQuery(input.value)!==searchQuery(S.q));
}
function markFieldPending(input){
  if(!input)return;
  (input.closest(".search,.bookmark-search,.glint-likes-search")||input.parentElement)?.classList.toggle("glint-search-pending",draftPending(input.value));
}
/* The Search tab also shows the query as removable tag chips, so a long query
   can be pruned one token at a time instead of being retyped. The box stays the
   source of truth: the chips mirror it, and dropping a chip applies it at once. */
function renderSearchChips(){
  const host=document.getElementById("search-tag-chips");if(!host)return;
  const tokens=searchTokens();
  if(!tokens.length){host.style.display="none";if(host._tagMarkup){host._tagMarkup="";host.innerHTML=""}return}
  const label=tag=>tag.replace(/_/g," ");
  const html=tokens.map(tag=>`<button type="button" data-a="searchchipremove" data-v="${esc(tag)}" aria-label="Remove ${esc(label(tag))} from the search"><span>${esc(label(tag))}</span><span aria-hidden="true">×</span></button>`).join("")+
    (tokens.length>1?`<button type="button" class="search-chip-clear" data-a="searchchipclear" aria-label="Clear the whole search">Clear all</button>`:"");
  host.style.display="";
  if(host._tagMarkup!==html){host._tagMarkup=html;host.innerHTML=html}
}
function applySearchQuery(value,focus="input"){
  const input=document.getElementById("q");
  S.q=searchQuery(value);
  if(input)input.value=S.q;
  closeSearchTags();renderSearchChips();markSearchPending();doSearch(S.q,true);save();
  const target=focus==="chips"?document.querySelector("#search-tag-chips [data-a=\"searchchipremove\"]")||input:input;
  target?.focus?.({preventScroll:true});
  if(target===input&&input&&document.activeElement===input){const end=input.value.length;try{input.setSelectionRange(end,end)}catch(e){}}
}
function removeSearchChip(tag){
  const tokens=searchTokens(),index=tokens.indexOf(String(tag||""));if(index<0)return;
  tokens.splice(index,1);applySearchQuery(tokens.join(" "),"chips");
}

// The Search source is the one selected on Home. Counts are for the entire
// native tag intersection, never a tag-suggestion count or loaded-page size.
const SEARCH_VIEW={order:"newest"};
let SEARCH_COUNT=null,SEARCH_COUNT_SERIAL=0,SEARCH_COUNT_TIMER=null;
const searchFilterQuery=query=>searchQuery(query).split(" ").filter(tag=>! /^(?:order|sort):/i.test(tag)).join(" ");
function searchOrderForQuery(query=S.q){
  const token=searchQuery(query).split(" ").filter(tag=>/^(?:order|sort):/i.test(tag)).at(-1)?.toLowerCase();
  if(token){
    if(/^(?:order:score(?:_desc)?|sort:score(?::desc)?)$/.test(token))return "popularity";
    if(/^(?:order:id_desc|sort:id:desc)$/.test(token))return "newest";
    return "custom";
  }
  return S.mode==="live"&&pbPostPopularitySupported(S.src)?SEARCH_VIEW.order:"newest";
}
function searchCountIsCurrent(c){return !!c&&SEARCH_COUNT===c&&c.serial===SEARCH_COUNT_SERIAL&&S.screen==="search"&&S.mode==="live"&&S.src===c.source&&searchFilterQuery(S.q)===c.query}
function cancelSearchCount(){
  clearTimeout(SEARCH_COUNT_TIMER);SEARCH_COUNT_SERIAL++;SEARCH_COUNT?.controller?.abort();SEARCH_COUNT=null;
}
function searchHeaderState(){
  const order=searchOrderForQuery(),count=searchCountIsCurrent(SEARCH_COUNT)?SEARCH_COUNT:null;
  const total=count?.total,known=Number.isSafeInteger(total)&&total>=0;
  let text=known?total.toLocaleString()+" "+(total===1?"post":"posts"):!count||count.busy?"… posts":"Total unavailable";
  const online=S.mode==="live";
  if(!online){const q=searchQuery(S.q).toLowerCase().replace(/_/g," ").split(" ").filter(Boolean),n=allPins().filter(p=>!p.grid&&!hasId(S.hidden,p.id)&&q.every(t=>(p.t+" "+p.c).toLowerCase().includes(t))).length;text=n.toLocaleString()+" "+(n===1?"post":"posts")}
  const supported=online&&pbPostPopularitySupported(S.src),label=order==="popularity"?"Popularity":order==="custom"?"Custom":"Newest";
  return {order,text,label,supported,source:"Searching on "+(online?PB_SOURCES[S.src]?.name||S.src:"demo artwork"),title:supported?(order==="newest"?"Sort by popularity (highest source score first)":"Sort by newest uploads"):"Popularity sorting is not available for this source."};
}
function searchSummaryHTML(){
  const h=searchHeaderState();
  return `<div class="search-summary"><div class="search-count"><b aria-live="polite">${esc(h.text)}</b><span class="search-source">${esc(h.source)}</span></div><button type="button" class="chip search-sort" data-a="searchsort" data-order="${h.order}" aria-pressed="${h.order==="popularity"}" aria-label="${esc(h.label+". "+h.title)}" title="${esc(h.title)}" ${h.supported?"":"disabled"}>${I.sort()}<span>${h.label}</span></button></div>`;
}
function updateSearchHeader(){
  const row=document.querySelector(".search-summary");if(S.screen!=="search"||!row)return;
  const h=searchHeaderState(),button=row.querySelector(".search-sort");row.querySelector(".search-count b").textContent=h.text;row.querySelector(".search-source").textContent=h.source;
  button.querySelector("span").textContent=h.label;button.disabled=!h.supported;button.dataset.order=h.order;button.setAttribute("aria-pressed",String(h.order==="popularity"));button.setAttribute("aria-label",h.label+". "+h.title);button.title=h.title;
}
function ensureSearchCount(immediate=false,retry=false){
  if(S.screen!=="search")return;
  if(S.mode!=="live"){cancelSearchCount();updateSearchHeader();return}
  const query=searchFilterQuery(S.q),source=S.src,c=SEARCH_COUNT;
  if(c&&c.source===source&&c.query===query&&!(retry&&c.error)){
    if(immediate&&c.busy&&!c.running){clearTimeout(SEARCH_COUNT_TIMER);SEARCH_COUNT_TIMER=setTimeout(()=>loadSearchCount(c),0)}
    updateSearchHeader();return;
  }
  cancelSearchCount();
  const next=SEARCH_COUNT={source,query,serial:SEARCH_COUNT_SERIAL,total:null,busy:true,running:false,error:false,controller:null};
  updateSearchHeader();SEARCH_COUNT_TIMER=setTimeout(()=>loadSearchCount(next),immediate?0:350);
}
async function loadSearchCount(c){
  if(!searchCountIsCurrent(c)||c.running)return;
  c.running=true;const controller=new AbortController();c.controller=controller;let timer;
  const deadline=new Promise((_,reject)=>{
    controller.signal.addEventListener("abort",()=>reject(new Error("Count cancelled")),{once:true});
    timer=setTimeout(()=>{controller.abort();reject(new Error("Count timed out"))},SEARCH_TIMEOUT);
  });
  try{
    const total=await Promise.race([pbLoadPostCount(c.source,{tags:c.query,signal:controller.signal}),deadline]);
    if(searchCountIsCurrent(c))c.total=Number.isSafeInteger(total)&&total>=0?total:null;
  }catch(e){if(searchCountIsCurrent(c))c.error=true}
  finally{clearTimeout(timer);if(SEARCH_COUNT===c){c.busy=false;c.running=false;c.controller=null;updateSearchHeader()}}
}
function sortSearch(){
  if(S.mode!=="live"||!pbPostPopularitySupported(S.src))return;
  const order=searchOrderForQuery();SEARCH_VIEW.order=order==="newest"?"popularity":"newest";
  // Clicking the sort control intentionally replaces any query-level order;
  // all tag, exclusion, rating and score filters remain unchanged.
  const value=searchFilterQuery(S.q),input=document.getElementById("q");S.q=value;if(input)input.value=value;
  closeSearchTags();doSearch(value,true);updateSearchHeader();
}

function cancelSearch(){
  clearTimeout(STIMER);clearTimeout(SEARCH_AUTO_TIMER);SEARCH_SERIAL++;
  if(SEARCH?.controller)SEARCH.controller.abort();SEARCH=null;SRES=null;closeSearchTags();
}
function searchErrorMessage(error){
  try{const body=JSON.parse(error.body||"{}"),message=body.message||body.reason||(typeof body.error==="string"?body.error:"");if(typeof message==="string"&&message.trim()){
    const text=message.trim().slice(0,500);
    if(SEARCH?.order==="popularity"&&/(more than \d+ tags|too many tags|tag limit)/i.test(text))return text+" Popularity sorting uses an additional sort token on this source; Newest does not.";
    return text;
  }}catch(e){}
  return error?.status===429?"Too many requests. Wait a moment, then retry.":error?.message||"Could not search this source.";
}
function searchIsCurrent(f){return SEARCH===f&&f.serial===SEARCH_SERIAL&&S.screen==="search"&&S.mode==="live"&&S.src===f.source&&searchQuery(S.q)===f.query}
function searchResultsHTML(){
  const query=searchQuery(S.q);
  if(S.mode!=="live"){
    const terms=query.toLowerCase().replace(/_/g," ").split(" ").filter(Boolean);
    const pins=allPins().filter(p=>!p.grid&&!hasId(S.hidden,p.id)&&terms.every(t=>(p.t+" "+p.c).toLowerCase().includes(t)));
    return pins.length?masonry(pins):'<div class="empty">No pins match that search.</div>';
  }
  if(!query)return recentSearchesHTML();
  const f=SEARCH&&SEARCH.source===S.src&&SEARCH.query===query?SEARCH:null;
  if(!f)return `<div class="empty">${SPIN}</div>`;
  let html=f.pins.length?masonry(f.pins,pcN,0):"";
  if(f.busy)return html+`<div class="search-pagination" role="status">${SPIN}<span class="sr-only">Searching</span></div>`;
  if(f.error)return html+`<div class="empty search-error" role="status">${esc(f.error)}<br><button type="button" class="chip" data-a="searchretry">Retry search</button></div>`;
  if(!f.pins.length)html+=`<div class="empty" role="status">${f.hasMore?"No displayable posts on this page.":"No posts match these tags."}</div>`;
  if(f.hasMore)html+='<div class="search-pagination"><button type="button" class="chip" data-a="searchmore">Load more results</button></div>';
  return html;
}
function renderSearchResults(){
  const box=document.getElementById("sres");if(S.screen!=="search"||!box)return;
  updateSearchHeader();renderSearchChips();markSearchPending();box.innerHTML=searchResultsHTML();
  const f=SEARCH;if(f&&searchIsCurrent(f)&&!f.busy&&!f.error&&!f.autoPaused&&f.hasMore)requestAnimationFrame(maybeLoadSearch);
}
function doSearch(q,immediate=false){
  if(!searchQuery(q))rememberFinishedSearch();
  S.q=String(q||"");const query=searchQuery(S.q),source=S.src;
  ensureSearchCount(immediate,immediate&&!!SEARCH_COUNT?.error);
  if(!query||S.mode!=="live"){cancelSearch();renderSearchResults();save();return}
  if(!immediate&&SEARCH&&SEARCH.source===source&&SEARCH.query===query&&!SEARCH.error)return;
  cancelSearch();
  const f=SEARCH={source,query,order:searchOrderForQuery(query),serial:SEARCH_SERIAL,pins:[],page:0,cursor:null,hasMore:true,busy:true,running:false,error:"",controller:null,lastBatch:"",autoPaused:false};SRES=f.pins;
  renderSearchResults();STIMER=setTimeout(()=>loadSearchMore(f),immediate?0:350);
}
async function loadSearchMore(f=SEARCH){
  if(!f||!searchIsCurrent(f)||f.running||!f.hasMore)return;
  clearTimeout(STIMER);f.busy=true;f.running=true;f.error="";f.autoPaused=false;
  const controller=new AbortController();f.controller=controller;let timer,timedOut=false;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error("Search took too long. Please try again."))},SEARCH_TIMEOUT)});
  renderSearchResults();const before=f.pins.length;
  try{
    for(let attempt=0;attempt<3;attempt++){
      const page=f.page+1,posts=await Promise.race([pbLoadPosts(f.source,{tags:f.query,page:f.cursor||page,limit:SEARCH_LIMIT,order:f.order,preserveQueryOrder:true,signal:controller.signal}),deadline]);
      if(!searchIsCurrent(f))return;
      const batch=posts.batchKey||posts.map(p=>String(p.sid)).join(",");
      if(batch&&batch===f.lastBatch){f.hasMore=false;throw new Error("This source repeated a page. Retry the search to refresh it.")}
      f.lastBatch=batch;f.page=page;f.cursor=posts.nextCursor||null;
      f.hasMore=posts.endConfirmed?false:typeof posts.hasMore==="boolean"?posts.hasMore:(posts.rawCount??posts.length)>=SEARCH_LIMIT;
      const seen=new Set(f.pins.map(p=>p.id));
      for(const raw of posts){const p=normPin(raw,f.source);if(!seen.has(p.id)&&!hasId(S.hidden,p.id)){seen.add(p.id);f.pins.push(p)}}
      if(f.pins.length>before||!f.hasMore)break;
    }
    f.autoPaused=f.hasMore&&f.pins.length===before;
  }catch(e){
    if(!searchIsCurrent(f))return;
    if(!controller.signal.aborted||timedOut)f.error=timedOut?"Search took too long. Please try again.":searchErrorMessage(e);
  }finally{
    clearTimeout(timer);
    if(SEARCH===f){f.controller=null;f.busy=false;f.running=false;if(searchIsCurrent(f)){renderSearchResults();save()}}
  }
}
function maybeLoadSearch(){
  const f=SEARCH;if(!f||!searchIsCurrent(f)||f.busy||f.error||!f.hasMore||f.autoPaused)return;
  const box=document.getElementById("sres");if(box&&box.getBoundingClientRect().bottom<innerHeight+550)loadSearchMore(f);
}
function closeSearchTags(){
  clearTimeout(SEARCH_TAG_TIMER);SEARCH_TAGS.serial++;SEARCH_TAGS.controller?.abort();SEARCH_TAGS.controller=null;SEARCH_TAGS.items=[];SEARCH_TAGS.active=-1;SEARCH_TAGS.token=null;
  const menu=document.getElementById("search-tag-options"),input=document.getElementById("q");
  if(menu){menu.hidden=true;menu.innerHTML=""}if(input){input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant")}
}
function cachedSearchTags(source,term){
  const found=new Set();for(const p of allPins())if(p.src===source)for(const tag of Array.isArray(p.tags)?p.tags:[])if(typeof tag==="string"&&tag.toLowerCase().startsWith(term))found.add(tag);
  return [...found].sort().slice(0,8).map(name=>({name,count:null}));
}
function renderSearchTags(){
  const menu=document.getElementById("search-tag-options"),input=document.getElementById("q");if(!menu||!input)return;
  const {items,active}=SEARCH_TAGS;menu.hidden=!items.length;input.setAttribute("aria-expanded",String(!!items.length));
  menu.innerHTML=items.map((tag,i)=>`<button type="button" id="search-tag-${i}" role="option" aria-selected="${i===active}" tabindex="-1" data-a="searchtag" data-v="${i}"><span>${esc(tag.name)}</span>${tag.count===null||tag.count===undefined?"":`<small>${Number(tag.count).toLocaleString()}</small>`}</button>`).join("");
  if(active>=0){input.setAttribute("aria-activedescendant","search-tag-"+active);menu.children[active]?.scrollIntoView({block:"nearest"})}else input.removeAttribute("aria-activedescendant");
}
function requestSearchTags(){
  const input=document.getElementById("q");closeSearchTags();
  if(!input||document.activeElement!==input||S.screen!=="search"||S.mode!=="live")return;
  const token=searchTagToken(input.value,input.selectionStart);if(!token)return;
  const source=S.src,serial=SEARCH_TAGS.serial,typed=input.value;SEARCH_TAGS.token=token;
  SEARCH_TAG_TIMER=setTimeout(async()=>{
    const controller=new AbortController();SEARCH_TAGS.controller=controller;const timeout=setTimeout(()=>controller.abort(),5000);
    try{
      const remote=await pbAutocomplete(source,token.term,{signal:controller.signal});
      if(serial!==SEARCH_TAGS.serial||S.src!==source||S.screen!=="search"||document.activeElement!==input||input.value!==typed||input.selectionStart!==token.caret)return;
      const seen=new Set();SEARCH_TAGS.items=[...remote,...cachedSearchTags(source,token.term)].filter(tag=>tag.name&&!seen.has(tag.name)&&seen.add(tag.name)).slice(0,8);SEARCH_TAGS.active=-1;renderSearchTags();
    }catch(e){}finally{clearTimeout(timeout);if(SEARCH_TAGS.controller===controller)SEARCH_TAGS.controller=null}
  },220);
}
function pickSearchTag(index,submit=false){
  const input=document.getElementById("q"),tag=SEARCH_TAGS.items[Number(index)],token=SEARCH_TAGS.token;if(!input||!tag||!token)return;
  const tail=input.value.slice(token.end),separator=/^\s/.test(tail)?"":" ";
  const value=input.value.slice(0,token.start)+token.prefix+tag.name+separator+tail,caret=token.start+token.prefix.length+tag.name.length+1;
  closeSearchTags();S.q=value;input.value=value;input.focus({preventScroll:true});input.setSelectionRange(caret,caret);if(submit)submitSearch(value);else{rememberSearch(value);doSearch(value,true)}
}
function searchKeydown(event){
  if(SEARCH_COMPOSING||event.isComposing||event.keyCode===229)return false;
  if((event.key==="ArrowDown"||event.key==="ArrowUp")&&SEARCH_TAGS.items.length){
    event.preventDefault();const n=SEARCH_TAGS.items.length;SEARCH_TAGS.active=(SEARCH_TAGS.active+(event.key==="ArrowDown"?1:SEARCH_TAGS.active<0?0:-1)+n)%n;renderSearchTags();return true;
  }
  if(event.key==="Enter"){event.preventDefault();if(!event.repeat){if(SEARCH_TAGS.active>=0)pickSearchTag(SEARCH_TAGS.active,true);else submitSearch()}return true}
  if(event.key==="Escape"&&SEARCH_TAGS.items.length){event.preventDefault();closeSearchTags();return true}
  if(event.key==="Tab")closeSearchTags();
  if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key))setTimeout(requestSearchTags,0);
  return false;
}

function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),1600)}
function ago(d){const m=(Date.now()-d)/6e4;return m<60?Math.max(1,Math.round(m))+"m":m<1440?Math.round(m/60)+"h":m<10080?Math.round(m/1440)+"d":m<43200?Math.round(m/10080)+"w":m<525600?Math.round(m/43200)+"mo":Math.round(m/525600)+"y"}
// Layout may receive a post or a saved-record wrapper. Never let a missing,
// string, NaN or infinite ratio poison column heights and fill only column 1.
function masonryRatio(item){
  const image=item&&item.p||item||{};
  const width=Number(image.width||image.w),height=Number(image.height||image.h);
  const dimensions=width>0&&height>0?height/width:null;
  for(const value of [item&&item.r,image.r,image.ar,dimensions]){
    const ratio=Number(value);
    if(Number.isFinite(ratio)&&ratio>0)return Math.max(.05,Math.min(20,ratio));
  }
  return 4/3;
}
function masonryPlan(list,columns,ex,start){
  const c=start||Array.from({length:columns},()=>({h:0,a:[]})),add=Number.isFinite(Number(ex))?Number(ex):0;
  for(const p of list){const k=c.reduce((a,b)=>b.h<a.h?b:a);k.a.push(p);k.h+=masonryRatio(p)+add}
  return c;
}
function masonry(list,fn,ex){
  const columns=[1,2,3].includes(Number(S.cols))?Number(S.cols):2,c=masonryPlan(list,columns,ex);
  const card=fn||pc;
  return `<div class="grid">${c.map(k=>`<div class="col">${k.a.map(card).join("")}</div>`).join("")}</div>`};
/* Growing a feed must not throw the screen away. Every card, picture and
   decoded bitmap is kept: new posts go into the columns the same masonry rule
   would pick, and the scroll position never moves. Shared by Home and the
   Explore feed pages. */
const MASONRY_VIEW=new WeakMap();
function masonryBind(gridEl,list,ex,card){
  if(!gridEl)return false;
  const cols=[...gridEl.querySelectorAll(":scope > .col")];
  if(!cols.length)return false;
  const add=Number.isFinite(Number(ex))?Number(ex):0,plan=masonryPlan(list,cols.length,add);
  for(let i=0;i<cols.length;i++)if(cols[i].children.length!==plan[i].a.length)return false;
  MASONRY_VIEW.set(gridEl,{ids:list.map(p=>String(p.id)),heights:plan.map(k=>k.h),ex:add,columns:cols.length,card:card||null});
  return true;
}
function masonryAppend(gridEl,list,ex){
  const st=gridEl&&MASONRY_VIEW.get(gridEl);
  if(!st||list.length<=st.ids.length)return false;
  for(let i=0;i<st.ids.length;i++)if(String(list[i].id)!==st.ids[i])return false;   // not a pure append
  const cols=[...gridEl.querySelectorAll(":scope > .col")];
  if(cols.length!==st.columns)return false;
  const heights=st.heights.slice(),adds=new Map(cols.map((_,i)=>[i,[]]));
  for(const p of list.slice(st.ids.length)){
    let k=0;for(let i=1;i<heights.length;i++)if(heights[i]<heights[k])k=i;
    heights[k]+=masonryRatio(p)+st.ex;adds.get(k).push(p);
  }
  const card=st.card||pcN;
  for(const [i,rows] of adds)if(rows.length)cols[i].insertAdjacentHTML("beforeend",rows.map(card).join(""));
  MASONRY_VIEW.set(gridEl,{ids:list.map(p=>String(p.id)),heights,ex:st.ex,columns:cols.length,card:st.card||null});
  PB_RUNTIME.enhance(app);
  return true;
}
/* Show the busy state in place, so the feed below the finger is untouched. */
function feedTailBusy(){
  const wrap=document.querySelector(".feedwrap");
  if(!wrap||!wrap.querySelector(".grid"))return false;
  const tail=wrap.querySelector(".loadmore");
  if(tail)tail.innerHTML=SPIN;
  else wrap.insertAdjacentHTML("beforeend",`<div class="loadmore">${SPIN}</div>`);
  return true;
}
let HOME_LIST=null,FEED_VIEW=null;
function rememberFeedView(list){FEED_VIEW={src:S.src,mode:S.mode,list}}
function appendToFeed(list){
  const view=FEED_VIEW;
  if(!view||S.screen!=="home"||S.mode!=="live"||view.mode!=="live"||view.src!==S.src)return false;
  const grid=app.querySelector(".feedwrap .grid");
  if(!grid||!masonryAppend(grid,list,0))return false;
  view.list=list;
  const mark=`<div class="loadmore">${LOADING?SPIN:`<button class="spinbtn" data-a="more" aria-label="Load more posts">${SPIN_IDLE}</button>`}</div>`;
  const tail=document.querySelector(".feedwrap .loadmore");
  if(tail){if(LOADING||MORE)tail.outerHTML=mark;else tail.remove()}
  else if(!LIVE_STATUS[S.src]?.error&&(LOADING||MORE))document.querySelector(".feedwrap")?.insertAdjacentHTML("beforeend",mark);
  return true;
}
// Tiny, non-interactive image markers: a source-confirmed heart and a local
// bookmark are independent. Unknown source-Like state is never guessed.
function thumbnailStatus(p){return {liked:!!p&&isRemoteLiked(p),saved:!!p&&bookmarked(p.id)}}
function thumbnailStatusKey(status){return (status.liked?1:0)+(status.saved?2:0)}
function thumbnailStatusLabel(base,status){
 const labels=[];if(status.liked)labels.push('Liked on source');if(status.saved)labels.push('Bookmarked');
 return base+(labels.length?' — '+labels.join(', '):'');
}
function thumbnailStatusHTML(status){
 const key=thumbnailStatusKey(status);if(!key)return '';
 return `<span class="glint-card-status" data-state="${key}" aria-hidden="true">${status.liked?`<span class="glint-status-icon glint-status-like">${I.markHeart()}</span>`:''}${status.saved?`<span class="glint-status-icon glint-status-bookmark">${I.markBookmark()}</span>`:''}</span>`;
}
function thumbnailStatusAttrs(p,base,status){
 return `data-card-label="${esc(base)}" data-card-source="${esc(p.src||'')}" data-card-sid="${esc(p.sid??'')}" aria-label="${esc(thumbnailStatusLabel(base,status))}"`;
}
// Update existing cards in place after a confirmed Like, bookmark change, or
// Drive merge. Batched writes preserve the image nodes and carousel positions.
const THUMB_STATUS_IDS=new Set();let THUMB_STATUS_ALL=false,THUMB_STATUS_FRAME=0;
function queueThumbnailStatus(id){
 if(id===undefined||id===null)THUMB_STATUS_ALL=true;else THUMB_STATUS_IDS.add(String(id));
 if(!THUMB_STATUS_FRAME)THUMB_STATUS_FRAME=requestAnimationFrame(paintThumbnailStatuses);
}
function paintThumbnailStatuses(){
 THUMB_STATUS_FRAME=0;const all=THUMB_STATUS_ALL,ids=new Set(THUMB_STATUS_IDS);THUMB_STATUS_ALL=false;THUMB_STATUS_IDS.clear();
 document.querySelectorAll('[data-card-label][data-id]').forEach(host=>{
  const id=host.dataset.id;if(!all&&!ids.has(id))return;
  const image=host.classList.contains('related-card')?host:host.querySelector(':scope > .art');if(!image)return;
  const status=thumbnailStatus({id,src:host.dataset.cardSource,sid:host.dataset.cardSid}),key=thumbnailStatusKey(status),current=image.querySelector(':scope > .glint-card-status');
  if(current&&Number(current.dataset.state)!==key)current.remove();
  if(key&&(!current||Number(current.dataset.state)!==key))image.insertAdjacentHTML('beforeend',thumbnailStatusHTML(status));
  const label=thumbnailStatusLabel(host.dataset.cardLabel,status);if(host.getAttribute('aria-label')!==label)host.setAttribute('aria-label',label);
 });
}
function pcx(p){const src=p.c||"",status=thumbnailStatus(p),base='View '+(p.t||'post');
 const ov=(isVideoPin(p)?PLAY_BADGE:"")+`<span class="srcb">${esc(src)}</span>`+thumbnailStatusHTML(status);
 return `<div><div data-a="open" data-id="${esc(p.id)}" role="button" tabindex="0" ${thumbnailStatusAttrs(p,base,status)}>${art(p,ov)}</div></div>`
}
/* Re-render just the Explore pane. Sections arrive before OR after the swipe
   that revealed them, so we never rely on a full re-render to pick them up —
   that would also throw away the carousel state. */
function refreshExplore(){
 const pane=document.querySelector('.tabpane[data-tab="Explore"]');if(!pane||CAR)return;
 const strips=new Map([...pane.querySelectorAll('.ex-section')].map(section=>[section.dataset.ex,{scale:section.dataset.exScale,node:section.querySelector('.ex-strip'),scroll:section.querySelector('.ex-strip')?.scrollLeft||0}]));
 const focus=document.activeElement?.closest('.ex-scales button'),focusKey=focus?{section:focus.dataset.v,scale:focus.dataset.id}:null;
 pane.innerHTML=explorePane();pane.dataset.built='1';
 const restore=[];
 pane.querySelectorAll('.ex-section').forEach(section=>{const old=strips.get(section.dataset.ex),fresh=section.querySelector('.ex-strip');if(!old||old.scale!==section.dataset.exScale||!fresh)return;const ids=node=>[...node.querySelectorAll('[data-a="open"]')].map(n=>n.dataset.id).join('|');let strip=fresh;if(old.node&&ids(old.node)===ids(fresh)){strip=old.node;fresh.replaceWith(strip)}strip.style.scrollSnapType='none';strip.scrollLeft=old.scroll;restore.push([strip,old.scroll])});
 requestAnimationFrame(()=>requestAnimationFrame(()=>{for(const [strip,scroll] of restore){if(!strip.isConnected)continue;strip.scrollLeft=scroll;strip.style.scrollSnapType=''}}));
 if(focusKey)pane.querySelector(`.ex-scales button[data-v="${CSS.escape(focusKey.section)}"][data-id="${CSS.escape(focusKey.scale)}"]`)?.focus({preventScroll:true});
}

const exScaleLabel=v=>(typeof PB_EX_SCALE_LABEL!=="undefined"&&PB_EX_SCALE_LABEL[v])||v;
function exScaleRow(sec,st){
  if(!sec.scales.length)return "";
  return `<div class="ex-scales" role="group" aria-label="${esc(sec.title)} period">${sec.scales.map(v=>`<button type="button" class="chip ex-scale${v===st.scale?" on":""}" data-a="exscale" data-v="${esc(sec.key)}" data-id="${v}" aria-pressed="${v===st.scale}">${esc(exScaleLabel(v))}</button>`).join("")}</div>`;
}
/* A source with a single explore view is not a "section" at all: it opens
   straight into the feed itself — two posts per row, growing as you scroll. */
const exOnlyView=()=>EX_SEC.length===1;
function exGridHTML(pins){
  return masonry(pins,pcN,0).replace('class="grid"','class="grid ex-grid"');
}
function exSectionHTML(sec){
  const st=EX_DATA.get(exKey(sec))||exState(sec,sec.def),loading=!st.loaded||st.busy,single=exOnlyView(),reveal=st.loaded&&!st.didReveal;if(reveal)st.didReveal=true;
  let body;
  if(st.error)body=`<div class="ex-error" role="status"><p>${esc(st.error)}</p><button class="btn alt" data-a="exretry" data-v="${esc(sec.key)}" data-id="${esc(st.scale)}">Retry</button></div>`;
  else if(sec.tags)body=st.tags.length?`<div class="ex-tagrow">${st.tags.map(t=>`<button type="button" class="chip ex-tag" data-a="extag" data-v="${esc(t.name)}" aria-label="Search ${esc(displayName(t.name))}">${esc(displayName(t.name))}</button>`).join("")}</div>`
    :loading?`<div class="ex-skel-row" aria-hidden="true">${"<span></span>".repeat(4)}</div>`
    :`<p class="ex-none">No popular searches were reported for this period.</p>`;
  else if(st.pins.length)body= single?exGridHTML(st.pins)+`<div class="ex-tail">${st.busy?SPIN:st.done?`<span class="tag-feed-end" role="status">End of results</span>`:`<span class="ex-hint">Scroll for more</span>`}</div>`
    :`<div class="ex-strip" role="list" aria-label="${esc(sec.title)} previews">${st.pins.slice(0,12).map(p=>`<div class="ex-cell" role="listitem">${pcN(p)}</div>`).join("")}</div>`;
  else body=loading? (single?`<div class="ex-skel-grid" aria-hidden="true">${"<span></span>".repeat(4)}</div>`:`<div class="ex-skel-row" aria-hidden="true">${"<span></span>".repeat(4)}</div>`)
    :`<p class="ex-none">Nothing in this view right now.</p>`;
  const more=st.pins.length&&!single?`<button type="button" class="ex-more" data-a="exopen" data-v="${esc(sec.key)}" data-id="${esc(st.scale)}" aria-label="See every ${esc(sec.title)} post">View all <span aria-hidden="true">↗</span></button>`:"";
  const detail=({popular:{eyebrow:"In the spotlight",note:"The source’s popular picks, by period."},hot:{eyebrow:"Right now",note:"What’s rising on this source."},viewed:{eyebrow:"Catching eyes",note:"The source’s most-viewed artwork."},score:{eyebrow:"Highly rated",note:"Browse the source’s top-scored uploads."}})[sec.key]||{eyebrow:"Discover",note:"A different way into the collection."};
  return `<section class="ex-section${reveal?" ex-motion-in":""}" data-ex="${esc(sec.key)}" data-ex-scale="${esc(st.scale)}" aria-label="${esc(sec.title)}"><header class="ex-head"><div><h2>${esc(sec.title)}</h2><p class="ex-note">${esc(sec.note||detail.note)}</p></div>${more}${st.busy?`<span class="ex-busy" role="status" aria-label="Loading">${SPIN}</span>`:""}</header>${exScaleRow(sec,st)}${body}</section>`;
}
function explorePane(){
 const source=PB_SOURCES[S.src];EX_SEC=pbExploreSections(S.src);
 const sections=EX_SEC.length?EX_SEC.map(exSectionHTML).join(""):`<div class="glint-ex-empty"><h2>A quieter corner.</h2><p>${esc(source?.name||"This source")} doesn’t offer an Explore feed. Try another source to discover more.</p><button class="btn alt" data-a="srcsheet">Choose a source</button></div>`;
 scheduleExplore();
 return `<div class="glint-explore"><div class="ex-sections">${sections}</div></div>`;
}

/* "See more" opens the whole view. Danbooru's popular/hot views page; the
   fixed top-N views on the other sites honestly do not. */
function exFeedBody(f){
  if(f.error)return `<div class="ex-error" role="status"><p>${esc(f.error)}</p><button class="btn alt" data-a="exfeedretry">Retry</button></div>`;
  if(!f.pins.length)return `<div class="empty">${f.busy?SPIN:"Nothing in this view right now."}</div>`;
  return masonry(f.pins,pcN)+(f.busy?`<div class="loadmore">${SPIN}</div>`:f.done?`<div class="tag-feed-end" role="status">End of results</div>`:`<div class="loadmore"><button class="chip tag-feed-load" data-a="exfeedmore" aria-label="Load more posts">Load more</button></div>`);
}
function renderExFeed(f){const body=$("#exfeed");if(!body||!f)return;const scroll=$("#sheet").scrollTop;body.innerHTML=exFeedBody(f);$("#sheet").scrollTop=scroll;
  masonryBind(body.querySelector(".grid"),f.pins,0)}
/* Loading more keeps the cards that are already there (and their pictures). */
function exFeedBusy(f){
  const body=$("#exfeed");if(!body||!body.querySelector(".grid"))return false;
  const tail=body.querySelector(".loadmore,.tag-feed-end");
  if(tail)tail.outerHTML=`<div class="loadmore">${SPIN}</div>`;
  else body.insertAdjacentHTML("beforeend",`<div class="loadmore">${SPIN}</div>`);
  return true;
}
function exFeedAppend(f){
  const body=$("#exfeed"),grid=body&&body.querySelector(".grid");
  if(!grid||!masonryAppend(grid,f.pins,0))return false;
  const tail=body.querySelector(".loadmore,.tag-feed-end");
  const mark=f.busy?`<div class="loadmore">${SPIN}</div>`:f.done?`<div class="tag-feed-end" role="status">End of results</div>`:`<div class="loadmore"><button class="chip tag-feed-load" data-a="exfeedmore" aria-label="Load more posts">Load more</button></div>`;
  if(tail)tail.outerHTML=mark;else body.insertAdjacentHTML("beforeend",mark);
  return true;
}
async function exFeedLoad(f,reset=false){
  if(!f||f.busy)return;
  if(!reset&&(f.done||!f.pins.length))return;
  if(reset){f.controller?.abort();f.pins=[];f.page=0;f.done=false;f.error=""}
  const request=++f.request,controller=new AbortController();f.controller=controller;f.busy=true;
  if(!exFeedBusy(f))renderExFeed(f);
  let timer,timedOut=false;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error("Loading took too long. Tap Retry."))},18000)});
  try{
    const page=f.page+1;
    const posts=await Promise.race([pbLoadExplore(S.src,{kind:f.section.key,scale:f.scale,page,limit:30,signal:controller.signal}),deadline]);
    if(request!==f.request)return;
    const seen=new Set(f.pins.map(p=>String(p.id))),before=f.pins.length;
    for(const raw of posts){const p=normPin(raw,S.src);if(!seen.has(String(p.id))){seen.add(String(p.id));f.pins.push(p)}}
    f.page=page;f.done=f.pins.length<=before||!exHasMore(f.section,posts,f.pins.length>before,page);
  }catch(e){
    if(request!==f.request)return;
    if(controller.signal.aborted&&!timedOut)return;
    f.error=pbRedactSecrets(e?.message||"Could not load this view.");
  }finally{clearTimeout(timer);if(request===f.request){f.controller=null;f.busy=false;if(!exFeedAppend(f))renderExFeed(f)}}
}
let EX_FEED_KEY="",EX_SCROLL_T=null,EX_FEED_RETURN_TAB="Explore";
function exploreFeedPage(secKey,scale){
  const sec=EX_SEC.find(x=>x.key===secKey)||pbExploreSections(S.src).find(x=>x.key===secKey);
  if(!sec)return;
  const sc=scale||sec.def||"",key=`${S.src}:${sec.key}:${sc}`,source=PB_SOURCES[S.src];
  let f=EX_FEEDS.get(key);
  if(!f){f={key,section:sec,scale:sc,pins:[],page:0,busy:false,done:false,error:"",request:0,controller:null};EX_FEEDS.set(key,f)}
  EX_FEED_KEY=key;EX_FEED_RETURN_TAB=S.bt;
  document.querySelectorAll('.glint-related-backdrop').forEach(node=>node.remove());
  sheet(`<div class="ex-feed-page"><header class="stk ex-feed-head"><button data-a="close" aria-label="Back">${I.back()}</button><div><h1>${esc(sec.title)}</h1><span>${esc(source?source.name:"")}${sc?` · ${esc(exScaleLabel(sc))}`:""}</span></div></header><div id="exfeed">${exFeedBody(f)}</div></div>`,true);
  const panel=$("#sheet");panel.classList.add("ex-feed-sheet");panel.setAttribute("aria-label",sec.title+" on "+(source?source.name:"this source"));
  relatedMotion(panel,[{transform:'translateY(100%)',opacity:.92},{transform:'translateY(0)',opacity:1}],500);
  initExploreFeedSwipe(panel);
  if(!f.pins.length&&!f.busy)exFeedLoad(f,true);
  const near=()=>{const left=panel.scrollHeight-panel.scrollTop-panel.clientHeight;if(left<Math.max(240,panel.clientHeight*.35))exFeedLoad(f)};
  panel.addEventListener("scroll",near,{passive:true});
}
function closeExploreFeed(panel=$("#sheet")){
  const ov=$("#ov");if(!panel?.classList.contains('ex-feed-sheet')||!ov.classList.contains('show'))return false;
  if(panel.dataset.exFeedClosing==='1')return true;
  panel.dataset.exFeedClosing='1';
  const offset=Math.max(0,Number(panel.dataset.exFeedOffset)||0),token=String((Number(panel.dataset.exFeedCloseToken)||0)+1);
  panel.dataset.exFeedCloseToken=token;panel.style.transform='';panel.style.opacity='';
  const finish=()=>{if(panel!==$("#sheet")||panel.dataset.exFeedCloseToken!==token||!panel.classList.contains('ex-feed-sheet'))return;panel.dataset.exFeedClosing='';panel.dataset.exFeedOffset='0';ov.classList.remove('show');if(S.screen==='profile')S.bt=EX_FEED_RETURN_TAB;document.querySelectorAll('.tabwrap .tabpane[data-tab]').forEach(p=>{const active=p.dataset.tab===S.bt;p.classList.toggle('cur',active);p.inert=!active;p.hidden=!active;p.setAttribute('aria-hidden',String(!active))});const wrap=document.querySelector('.tabwrap'),order=S.sw==='right'?tabsList().slice().reverse():tabsList(),index=order.indexOf(S.bt);if(wrap&&index>=0)wrap.scrollLeft=index*wrap.clientWidth;window.__pgfit?.();markTab(S.bt);PB_RUNTIME.dialogClose();save()};
  const animation=relatedMotion(panel,[{transform:`translateY(${offset}px)`,opacity:Math.max(.78,1-offset/innerHeight*.22)},{transform:'translateY(100%)',opacity:.9}],430);
  if(!animation){finish();return true}
  animation.finished.then(finish,finish);return true;
}
function initExploreFeedSwipe(panel){
  let gesture=null,clickBlock=null;
  const begin=(id,x,y,target)=>{if(panel.dataset.exFeedClosing==='1'||target.closest?.('button,a,input,select,textarea,video,[contenteditable="true"]'))return;gesture={id,x,y,moved:false}};
  const move=(id,x,y,event)=>{if(!gesture||gesture.id!==id)return;const dx=x-gesture.x,dy=y-gesture.y;if(dy<=8||Math.abs(dy)<=Math.abs(dx)*1.2)return;if(event.cancelable)event.preventDefault();const offset=Math.max(0,dy*.86);panel.dataset.exFeedOffset=String(offset);if(event.pointerId!==undefined&&event.pointerType==='mouse'){try{panel.setPointerCapture(event.pointerId)}catch(e){}}panel.style.transition='none';panel.style.transform=`translateY(${offset}px)`;panel.style.opacity=String(Math.max(.78,1-offset/innerHeight*.22));gesture.moved=dy>12};
  const finish=(id,x,y)=>{if(!gesture||gesture.id!==id)return;const g=gesture;gesture=null;const dy=y-g.y,dx=x-g.x;panel.style.transition='';if(g.moved)clickBlock={until:performance.now()+450,x,y};if(dy>90&&dy>Math.abs(dx)*1.25){closeExploreFeed(panel);return}const offset=Math.max(0,Number(panel.dataset.exFeedOffset)||0);if(offset){panel.dataset.exFeedOffset='0';panel.style.transform='';panel.style.opacity='';relatedMotion(panel,[{transform:`translateY(${offset}px)`,opacity:Math.max(.78,1-offset/innerHeight*.22)},{transform:'translateY(0)',opacity:1}],220)}};
  panel.addEventListener('click',event=>{if(!clickBlock||performance.now()>clickBlock.until||Math.hypot(event.clientX-clickBlock.x,event.clientY-clickBlock.y)>36)return;clickBlock=null;event.preventDefault();event.stopImmediatePropagation()},true);
  if('PointerEvent' in window){panel.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||(event.pointerType==='mouse'&&event.button!==0))return;begin(event.pointerId,event.clientX,event.clientY,event.target)},{passive:true});panel.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')move(event.pointerId,event.clientX,event.clientY,event)},{passive:false});panel.addEventListener('pointerup',event=>{if(event.pointerType==='touch')return;finish(event.pointerId,event.clientX,event.clientY)},{passive:true});panel.addEventListener('pointercancel',()=>{gesture=null})}
  panel.addEventListener('touchstart',event=>{if(event.touches.length!==1){gesture=null;return}const t=event.touches[0];begin('touch',t.clientX,t.clientY,event.target)},{passive:true});panel.addEventListener('touchmove',event=>{if(event.touches.length!==1){gesture=null;return}const t=event.touches[0];move('touch',t.clientX,t.clientY,event)},{passive:false});panel.addEventListener('touchend',event=>{const t=event.changedTouches[0];if(t)finish('touch',t.clientX,t.clientY)},{passive:true});panel.addEventListener('touchcancel',()=>{gesture=null});
}
/* Home feed: nothing but the picture — no title, no menu button. Tapping a
   picture opens the post, and the post carries Like / Share / Save. */
function pcN(p){
const status=thumbnailStatus(p),base='View '+(p.t||'post');
const save=`<button class="glint-card-save ${status.saved?"on":""}" data-a="bookmark" data-id="${esc(p.id)}" aria-label="${status.saved?"Remove bookmark":"Save image"}" aria-pressed="${status.saved}">${I.bookmark(status.saved)}</button>`;
return `<div><div data-a="open" data-id="${esc(p.id)}" role="button" tabindex="0" ${thumbnailStatusAttrs(p,base,status)}>${art(p,(isVideoPin(p)?PLAY_BADGE:"")+thumbnailStatusHTML(status)+save)}</div></div>`}
// Every feed uses the same image-only card; post details retain their title.
function pc(p){return pcN(p)}
/* ── Likes ───────────────────────────────────────────────────────────────
   Not our own hearts: the favourites the signed-in account has on the
   current source, pulled straight from that site's API.                     */
const FAV={};
// Account-scoped, in-memory source state. Never seed this from old S.likes:
// those were local-only hearts and must not be silently uploaded anywhere.
const SOURCE_LIKES=new Map();
const sourceAuthVersion=id=>typeof pbAuthVersion==="function"?pbAuthVersion(id):0;
const favoritesNeedRefresh=f=>!f.page||Date.now()-(f.loadedAt||0)>30000;
function invalidateSourceFavorites(source){
  const current=document.getElementById("sheet")?.dataset.postId||(typeof postView==="function"?postView()?.id:null),p=current&&pin(current);if(p?.src===source)rememberPin(p);
  const order=FAV[source]?.order||"newest";delete FAV[source];favState(source).order=order;
  if(S.src===source&&S.screen==="profile"){refreshPane("Likes");if(S.bt==="Likes")loadFavorites(true)}
}

function canLikePost(p){return !!(p?.src&&/^\d+$/.test(String(p.sid||""))&&Number.isSafeInteger(Number(p.sid))&&Number(p.sid)>0&&typeof pbCanLike==="function"&&pbCanLike(p.src))}
function canReadPostLike(p){return !!(p?.src&&/^\d+$/.test(String(p.sid||""))&&Number.isSafeInteger(Number(p.sid))&&Number(p.sid)>0&&window.pbLikesOk&&pbLikesOk(p.src)&&window.pbHasAuth&&pbHasAuth(p.src))}
const sourceLikeKey=p=>p.src+"|"+sourceAuthVersion(p.src)+"|"+p.sid;
function remoteLikeState(p){
  const key=sourceLikeKey(p);
  if(!SOURCE_LIKES.has(key))SOURCE_LIKES.set(key,{key,source:p.src,known:false,liked:false,busy:false,writing:false,checking:false,checkPromise:null,tapPending:false,desired:null,error:"",checkedAt:0,controller:null});
  return SOURCE_LIKES.get(key);
}
function isRemoteLiked(p){const state=canReadPostLike(p)&&SOURCE_LIKES.get(sourceLikeKey(p));return !!(state?.known&&state.liked)}
function seedRemoteLike(p){if(!canReadPostLike(p))return;const state=remoteLikeState(p);if(!state.busy){const changed=!state.known||!state.liked;state.known=true;state.liked=true;state.checkedAt=Date.now();if(changed)queueThumbnailStatus(p.id)}}
/* A tap must always do something. The heart stays tappable while the account
   state is being read — or after a read that failed — and that tap asks the
   source for the truth and then favourites the post, so one tap is one Like.
   Only a write in flight disables it: a second write is never sent. */
const LIKE_FRESH_MS=30000,LIKE_CHECK_TIMEOUT=12000,LIKE_CHECK_RETRY_MS=600,LIKE_WRITE_TIMEOUT=25000;
function postLikeFeedbackHTML(p){
  if(!canLikePost(p))return "";
  const state=remoteLikeState(p),name=PB_SOURCES[p.src]?.name||p.src;
  if(state.writing)return `<span>${state.desired?"Adding to":"Removing from"} ${esc(name)} favourites — confirming…</span>`;
  if(state.checking)return p.src==="danbooru"?"":`<span>Checking ${esc(name)} favourites…</span>`;
  if(state.error)return `<span>${esc(state.error)}</span><div><button type="button" data-a="likestatus" data-id="${esc(p.id)}">Recheck</button><button type="button" data-a="postaccount" data-v="${esc(p.src)}">Account settings</button></div>`;
  return "";
}
function refreshPostLike(p){
  if(p)queueThumbnailStatus(p.id);
  const panel=document.getElementById("sheet");if(!p||panel?.dataset.postId!==String(p.id))return;
  const actions=panel.querySelector(".post-actions"),feedback=panel.querySelector(".post-like-feedback");
  if(actions){actions.style.setProperty("--post-action-count",canLikePost(p)?4:3);actions.innerHTML=postActionsHTML(p)}
  if(feedback){feedback.innerHTML=postLikeFeedbackHTML(p);feedback.hidden=!feedback.innerHTML}
}
/* Read the account's real state. Read-only, so a failed attempt may safely be
   retried once: most "it did nothing" reports were one slow or rate-limited
   read leaving the heart locked in an unknown state. */
async function ensureRemoteLike(p,force=false){
  if(!canLikePost(p))return false;
  const state=remoteLikeState(p),version=sourceAuthVersion(p.src);
  if(state.checkPromise)return state.checkPromise;
  if(!force&&state.known&&Date.now()-state.checkedAt<LIKE_FRESH_MS)return true;
  state.checking=true;state.busy=true;state.error="";refreshPostLike(p);
  const check=(async()=>{
    let ok=false,lastError="";
    for(let attempt=0;attempt<2&&!ok;attempt++){
      if(version!==sourceAuthVersion(p.src)||remoteLikeState(p)!==state)break;
      if(attempt)await new Promise(r=>setTimeout(r,LIKE_CHECK_RETRY_MS));
      const controller=new AbortController();state.controller=controller;
      const timer=setTimeout(()=>controller.abort(),LIKE_CHECK_TIMEOUT);
      try{
        const liked=await pbFavoriteStatus(p.src,p.sid,{signal:controller.signal});
        if(version!==sourceAuthVersion(p.src)||remoteLikeState(p)!==state)break;
        const previous=state.checkedAt>0&&state.liked!==liked,f=FAV[p.src],listed=f?.pins.some(row=>String(row.id)===String(p.id));
        const contradicted=f?.page>0&&(!liked&&listed||liked&&f.done&&!listed);
        state.known=true;state.liked=liked;state.checkedAt=Date.now();state.error="";ok=true;
        // Rechecking an uncertain write (or a website-side change) must also
        // refresh Profile Likes/count, not merely recolour the detail heart.
        if(previous||contradicted)invalidateSourceFavorites(p.src);
      }catch(e){
        lastError=controller.signal.aborted?"Could not reach "+((PB_SOURCES[p.src]?.name)||"the source")+" in time. Tap the heart to try again.":pbRedactSecrets(e?.message||"Could not check source Likes.");
        if(version!==sourceAuthVersion(p.src)||remoteLikeState(p)!==state)break;
        state.known=false;
      }finally{clearTimeout(timer)}
    }
    if(!ok&&version===sourceAuthVersion(p.src)&&remoteLikeState(p)===state)state.error=lastError;
    state.checking=false;state.busy=state.writing;state.controller=null;state.checkPromise=null;
    if(version===sourceAuthVersion(p.src)){
      refreshPostLike(p);
      // A tap that landed while this read was running is honoured now — but a
      // tap made while the state was still unknown only ever adds, never
      // removes something the user could not see.
      if(state.tapPending){
        state.tapPending=false;const wasUnknown=state.tapWasUnknown,again=pin(p.id);state.tapWasUnknown=false;
        if(again){
          if(wasUnknown&&state.liked){toast("Already in your "+((PB_SOURCES[again.src]?.name)||"source")+" favourites");refreshPostLike(again)}
          else if(ok)toggleSourceLike(again.id);
        }
      }
    }
    return ok;
  })();
  state.checkPromise=check;
  return check;
}
async function toggleSourceLike(id){
  const p=pin(id);if(!canLikePost(p))return;
  const state=remoteLikeState(p);
  if(state.writing)return;                       // one write at a time, never repeated
  if(state.checkPromise){state.tapPending=true;state.tapWasUnknown=!state.known;return}   // honoured when the read lands
  if(!state.known){
    // One tap does both: find out what the account really has, then favourite
    // the post if it is not already there. It never removes on this path.
    const ok=await ensureRemoteLike(p,true);
    if(!ok){refreshPostLike(p);toast(state.error||"Could not check the source's Like state.");return}
    if(state.liked){toast("Already in your "+(PB_SOURCES[p.src]?.name||p.src)+" favourites");refreshPostLike(p);return}
  }
  const target=!state.liked,version=sourceAuthVersion(p.src),controller=new AbortController();
  state.writing=true;state.busy=true;state.desired=target;state.error="";state.controller=controller;refreshPostLike(p);
  const timer=setTimeout(()=>controller.abort(),LIKE_WRITE_TIMEOUT);
  try{
    const actual=await pbSetFavorite(p.src,p.sid,target,{signal:controller.signal});
    if(version!==sourceAuthVersion(p.src)||remoteLikeState(p)!==state)return;
    state.known=true;state.liked=actual;state.checkedAt=Date.now();
    // Preserve an opened post even if it came only from the old Likes page.
    // rememberPin caches metadata; it does NOT create a local bookmark.
    rememberPin(p);save();
    invalidateSourceFavorites(p.src);
    toast((actual?"Liked on ":"Removed Like on ")+(PB_SOURCES[p.src]?.name||p.src));
  }catch(e){
    if(version===sourceAuthVersion(p.src)){
      // A timed-out request may have reached the website. Do not pretend it
      // failed locally and then repeat it: require a fresh, read-only check.
      state.known=false;const uncertain=controller.signal.aborted||!e?.status||e.status>=500;state.error=uncertain?"The action could not be confirmed. It may have reached the website. Tap the heart to check again.":(e?.message||"The source did not confirm the Like.");toast(state.error);
    }
  }finally{
    clearTimeout(timer);state.writing=false;state.busy=state.checking;state.desired=null;state.controller=null;
    if(version===sourceAuthVersion(p.src))refreshPostLike(p);
  }
}
document.addEventListener?.("visibilitychange",()=>{
  if(document.visibilityState!=="visible")return;
  const current=document.getElementById("sheet")?.dataset.postId,p=current&&pin(current);
  if(p&&document.getElementById("ov")?.classList.contains("show"))ensureRemoteLike(p,true);
  if(S.screen==="profile"&&S.bt==="Likes"){const f=favState(S.src);if(!f.busy&&!f.err&&favoritesNeedRefresh(f))loadFavorites(true)}
});
window.addEventListener?.("pb-authchange",event=>{
  const source=event.detail?.source;if(!source)return;
  const current=document.getElementById("sheet")?.dataset.postId||(typeof postView==="function"?postView()?.id:null),p=current&&pin(current);if(p?.src===source)rememberPin(p);
  for(const [key,state] of SOURCE_LIKES)if(state.source===source){state.controller?.abort();SOURCE_LIKES.delete(key)}
  queueThumbnailStatus();
  delete FAV[source];
  exploreReset("");
  if(LIVE_REQUEST?.source===source)cancelLive();
  S.live[source]=[];S.lpage[source]=1;delete LIVE_STATUS[source];
  if(S.screen==="home"&&S.src===source){MORE=true;loadLive(true)}
  if(S.screen==="profile")render();
  if(p?.src===source){refreshPostLike(p);ensureRemoteLike(p,true)}
});

function favState(id){if(!FAV[id])FAV[id]={pins:[],page:0,done:false,busy:false,err:"",order:"newest",total:null,countBusy:false,countChecked:false,loadedAt:0,request:0,cursor:null};return FAV[id]}
function refreshPane(tab){
  const wrap=document.querySelector(".tabwrap");if(!wrap||CAR)return;
  const p=wrap.querySelector('.tabpane[data-tab="'+tab+'"]');if(!p)return;
  const likesInput=tab==="Likes"&&document.activeElement?.id==="likesSearch"?document.activeElement:null,caret=likesInput?.selectionStart;
  p.innerHTML=paneHTML(tab);if(likesInput){const input=p.querySelector('#likesSearch');input?.focus({preventScroll:true});try{input?.setSelectionRange(caret,caret)}catch(e){}}p.dataset.built="1";if(tab==="Bookmarks")bookmarkBindResults();
}
async function loadFavorites(reset){
  const id=S.src;
  if(!(window.pbLikesOk&&pbLikesOk(id))||!(window.pbHasAuth&&pbHasAuth(id)))return;
  let f=favState(id);
  if(reset&&f.loadedAt&&Date.now()-f.loadedAt>30000){const order=f.order;delete FAV[id];f=favState(id);f.order=order}
  if(f.busy&&!reset)return;
  if(reset){f.pins=[];f.page=0;f.cursor=null;f.done=false;f.err=""}
  if(f.done)return;
  const request=++f.request;
  f.busy=true;refreshPane("Likes");
  // Fetch the account total independently, not just the number of loaded cards.
  if(f.total===null&&!f.countBusy){
    f.countBusy=true;
    pbLoadFavoriteCount(id).then(total=>{
      if(FAV[id]!==f)return;
      f.total=total;
      refreshPane("Likes");
    }).catch(()=>{}).finally(()=>{f.countBusy=false;f.countChecked=true;if(FAV[id]===f)refreshPane("Likes")});
  }
  let timer=null;
  try{
    const page=f.page+1;
    const pins=await Promise.race([
      pbLoadFavorites(id,{page,limit:40,order:f.order,total:f.total,cursor:f.cursor}),
      new Promise((_,rej)=>{timer=setTimeout(()=>rej(new Error("The site took too long to answer.")),30000)})
    ]);
    // A quick second tap must not let the previous sort overwrite the new one.
    if(FAV[id]!==f||request!==f.request)return;
    const seen=new Set(f.pins.map(x=>x.id));
    pins.map(x=>normPin(x,id)).forEach(n=>{seedRemoteLike(n);if(!seen.has(n.id)){seen.add(n.id);f.pins.push(n)}});
    f.page=page;f.loadedAt=Date.now();
    f.cursor=pins.nextCursor||null;
    f.done=typeof pins.hasMore==="boolean"?!pins.hasMore:(f.total!==null?page*40>=f.total:pins.length<40);
  }catch(e){
    if(FAV[id]!==f||request!==f.request)return;
    f.err=(e&&e.message)||"Could not load your likes.";
    toast(f.err);
  }finally{
    clearTimeout(timer);
    if(FAV[id]===f&&request===f.request){f.busy=false;refreshPane("Likes")}
  }
}
const GLINT_LIKES_SEARCH={open:false,queries:{}};
const GLINT_LIKES_API={key:"",pins:[],page:0,total:null,more:false,busy:false,error:"",controller:null,timer:0,generation:0};
function likesApiQuery(){return String(GLINT_LIKES_SEARCH.queries[S.src]||"").trim()}
function likesSearchPins(){return likesApiQuery()?GLINT_LIKES_API.pins:favState(S.src).pins}
function likesSearchCountLabel(){if(!likesApiQuery()){const f=favState(S.src);return f.total===null?`${f.pins.length} loaded likes`:`${f.total.toLocaleString()} liked posts`}const r=GLINT_LIKES_API;if(r.error&&!r.page)return "Search unavailable";return r.busy&&!r.page?"Searching likes…":r.total!==null?`${r.total.toLocaleString()} matching pictures`:`${r.pins.length} ${r.more?"loaded results":"matching pictures"}`}
function likesSearchResultsHTML(){
 const query=likesApiQuery(),r=query?GLINT_LIKES_API:favState(S.src),pins=likesSearchPins(),more=query?r.more:!r.done,error=query?r.error:r.err;
 const note=query&&!error?`<p class="glint-likes-search-note" role="status">${r.total!==null?`${r.total.toLocaleString()} matches · ${pins.length} shown`:`${pins.length} pictures shown${more?" · More results available":""}`}</p>`:"";
 return note+(error?`<p class="glint-likes-search-note" role="alert">${esc(error)} <button data-a="glintlikesretry">Retry</button></p>`:"")+(pins.length?masonry(pins,pc):`<div class="empty">${r.busy?SPIN:error?"":query?"No matching likes.":"No likes loaded yet."}</div>`)+(!r.busy&&more?`<div class="loadmore"><button class="btn alt" data-a="favmore">Load more results</button></div>`:r.busy&&pins.length?SPIN:"");
}
function likesSearchHTML(){return GLINT_LIKES_SEARCH.open?`<div class="glint-likes-search"><div class="search">${I.srch(20)}<input id="likesSearch" type="search" placeholder="Search all your likes by tags" aria-label="Search your account likes" value="${esc(tagField("likesSearch").draft)}" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search"><button data-a="glintlikesclear" aria-label="Clear likes search">${I.x(16)}</button></div></div>`:""}
function updateLikesSearchUI(){if(S.screen!=="profile"||S.bt!=="Likes")return;const results=document.getElementById('likesSearchResults'),count=document.getElementById('likesResultCount');if(results)results.innerHTML=likesSearchResultsHTML();if(count)count.textContent=likesSearchCountLabel();const sort=document.querySelector('.glint-header-actions [data-a="favsort"]');if(sort){const searching=!!likesApiQuery();sort.disabled=searching;sort.title=searching?'API tag searches use newest upload order':'Switch newest / oldest likes';sort.querySelector('span').textContent=searching?'New':favState(S.src).order==='oldest'?'Old':'New'}}
function queueLikesApiSearch(){const r=GLINT_LIKES_API;clearTimeout(r.timer);r.controller?.abort();r.generation++;Object.assign(r,{key:S.src+":"+likesApiQuery(),pins:[],page:0,total:null,more:false,error:"",busy:!!likesApiQuery()});updateLikesSearchUI();if(likesApiQuery())r.timer=setTimeout(()=>loadLikesApiSearch(true),300)}
async function loadLikesApiSearch(reset=false){
 const r=GLINT_LIKES_API,query=likesApiQuery(),src=S.src,key=src+":"+query;if(!query)return;
 if(!reset&&r.busy)return;if(!reset&&r.page&&!r.more)return;
 r.controller?.abort();const controller=new AbortController(),generation=++r.generation;r.controller=controller;
 if(reset||r.key!==key)Object.assign(r,{key,pins:[],page:0,total:null,more:false});r.busy=true;r.error="";updateLikesSearchUI();
 const timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await pbSearchFavorites(src,{query,page:r.page+1,signal:controller.signal});if(generation!==r.generation||S.src!==src||likesApiQuery()!==query)return;
 const seen=new Set(r.pins.map(p=>String(p.id)));for(const post of response.pins){const p=normPin(post,src);if(!seen.has(String(p.id))){seen.add(String(p.id));r.pins.push(p);seedRemoteLike(p)}}r.page++;if(response.total!==null)r.total=response.total;r.more=response.hasMore;
 }catch(error){if(generation===r.generation)r.error=controller.signal.aborted?"Search timed out. Try again.":error.message||"Could not search likes."}
 finally{clearTimeout(timer);if(generation===r.generation){r.busy=false;updateLikesSearchUI()}}
}

function likesPane(){
  if(!(window.pbLikesOk&&pbLikesOk(S.src)))return `<div class="empty glint-likes-empty">Likes aren’t supported by this source.<br><button class="btn alt" data-a="srcsheet">Choose a source</button></div>`;
  if(!(window.pbHasAuth&&pbHasAuth(S.src)))return `<div class="empty glint-likes-empty">Connect your ${esc(PB_SOURCES[S.src]?.name||"source")} account to see your likes.<br><button class="btn alt" data-a="accounts">Connect source account</button></div>`;
  const id=S.src,s=PB_SOURCES[id]||{},f=favState(id);
  const total=f.total;
  const count=total===null?(f.countChecked?"Total unavailable":"Checking total…"):total.toLocaleString();
  const oldest=f.order==="oldest";
  const head=`<div class="phead"><div class="likes-head"><div class="exhead"><b id="likesResultCount" aria-live="polite">${GLINT_LIKES_SEARCH.open?likesSearchCountLabel():total===null?count:count+" liked "+(total===1?"post":"posts")}</b><span>${esc(s.name||"")} · from your account</span></div>
</div></div>`;
  if(GLINT_LIKES_SEARCH.open)return `<div class="phead"><div class="exhead"><b id="likesResultCount" aria-live="polite">${likesSearchCountLabel()}</b><span>${esc(s.name||"")} · account likes</span></div></div>`+likesSearchHTML()+`<div id="likesSearchResults">${likesSearchResultsHTML()}</div>`;
  if(f.err)return head+`<div class="empty">${esc(f.err)}<br><button class="btn" style="margin-top:16px" data-a="favload">Try again</button></div>`;
  if(!f.pins.length)return head+`<div class="empty">${f.busy?SPIN:(f.done
    ?`No favourites on ${esc(s.name||"this site")} yet.<br>Use a supported source Like here, or favourite a post on the website.`
    :`<button class="btn" data-a="favload">Load your likes</button>`)}</div>`;
  return head+masonry(f.pins,pc)+(f.done?"":`<div class="loadmore">${f.busy?SPIN:`<button class="spinbtn" data-a="favmore" aria-label="Load more likes">${SPIN_IDLE}</button>`}</div>`);
}
/* Source tabs live in the same row as the board tabs and use the same markup,
   so they share the exact font, size and underline of "Ai news Art". */
const HIDDEN_HOME_TABS=["Ai news Art"];
function srcTabs(){
  const live=S.mode==="live";
  return S.srcs.map(id=>{const s=PB_SOURCES[id];
    return `<button class="${live&&S.src===id?"on":""}" data-a="src" data-v="${id}">${s.short}</button>`}).join("")
    +`<button class="addsrc" data-a="addsrc" aria-label="Add a source">+</button>`;
}
function home(){
const live=S.mode==="live";
const boards=S.boards.filter(b=>!b.nb&&!HIDDEN_HOME_TABS.includes(b.n));
const tabs=srcTabs();
/* "All" = the whole feed of the current source; a board or "Liked" always
   shows every pin saved there, whichever source it came from. */
let list=live?livePins():S.custom.concat(PINS);
/* Only the photos of the source whose tab is lit: a response or a leftover
   tile from the source you just left can never appear in this grid. */
if(live)list=list.filter(p=>!p.src||p.src===S.src);
list=list.filter(p=>!hasId(S.hidden,p.id));
const error=live&&LIVE_STATUS[S.src]?.error;
const problem=error?`<div class="feed-error" role="status"><p>${esc(error)}</p><button class="btn alt" data-a="more">Retry</button></div>`:"";
HOME_LIST=list;if(live)rememberFeedView(list);else{FEED_VIEW=null;HOME_LIST=null}
const feed=list.length?masonry(list,pcN,0):(live?`<div class="empty">${LOADING?SPIN:(MORE?`<button class="spinbtn" data-a="more" aria-label="Load more posts">${SPIN_IDLE}</button>`:"No posts found.")}</div>`:'<div class="empty">Nothing here yet.<br>Like or save pins and they will show up.</div>');
return `${glintHeader("feed")}<div class="feedwrap glint-wall">${error&&!list.length?"":feed}${problem}${live&&!error&&list.length&&(LOADING||MORE)?`<div class="loadmore">${LOADING?SPIN:`<button class="spinbtn" data-a="more" aria-label="Load more posts">${SPIN_IDLE}</button>`}</div>`:""}</div>`}

function search(){
const source=PB_SOURCES[S.src]?.name||"this source";
return `<h1 class="sr-only">Search posts</h1><div class="stk search-head"><form id="search-form" class="sbar" role="search" aria-label="Search posts"><div class="search search-tag-field"><button type="submit" class="search-submit" aria-label="Search">${I.srch(24)}</button><input id="q" type="search" role="combobox" aria-label="Search tags on ${esc(source)}" aria-autocomplete="list" aria-controls="search-tag-options" aria-expanded="false" placeholder="Search tags" value="${esc(searchDraftValue())}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></div></form>
<div class="glint-selected-search-tags search-tag-chips" id="search-tag-chips" role="group" aria-label="Search tags" style="display:none"></div>
${searchSummaryHTML()}<div class="search-tag-options" id="search-tag-options" role="listbox" aria-label="Matching tags" hidden></div></div>
<div id="sres">${searchResultsHTML()}</div>`}
function mos(b){const ps=bpins(b).slice(0,3).map(pin);
return `<div class="mos">${b.p?`<span class="lk" style="display:flex;align-items:center;justify-content:center">${I.lock()}</span>`:""}${[0,1,2].map(i=>`<div>${ps[i]?art({...ps[i],r:i?1:1.3}):""}</div>`).join("")}</div>`}
function boardCard(b){return `<div class="bc" data-a="board" data-id="${b.id}">${mos(b)}<div class="bt">${esc(b.n)}</div><div class="bs">${b.n0+b.pins.length} Pins<em>${ago(b.d)}</em></div></div>`}
// A source-filtered local library: every saved post is independent of boards.
function bookmarkRows(){
  const enabled=new Set(S.srcs.filter(id=>PB_SOURCES[id]&&!PB_SOURCES[id].off));
  const known=new Map();for(const p of allPins())if(p&&!known.has(String(p.id)))known.set(String(p.id),p);
  return S.bookmarks.map((record,index)=>{
    const p=known.get(record.id)||null,candidate=p&&p.src||record.id.split(":")[0];
    const source=PB_SOURCES[candidate]?candidate:"";
    return {...record,index,p,source};
  }).filter(row=>enabled.has(row.source)&&!hasId(S.hidden,row.id));
}
function bookmarkSourceOptions(rows=bookmarkRows()){
  return S.srcs.filter((id,i,ids)=>ids.indexOf(id)===i&&PB_SOURCES[id]&&!PB_SOURCES[id].off)
    .map(id=>({id,name:PB_SOURCES[id].name,count:rows.filter(row=>row.source===id).length})).filter(source=>source.count>0);
}
function bookmarkSearchNormalize(value){return String(value||"").normalize("NFKC").replace(/_/g," ").toLowerCase().replace(/\s+/g," ").trim()}
/* Normalising the text of every saved post on every keystroke is what made
   typing in a large library stutter. The text is built once per post and only
   rebuilt when that post gains details (tags, names, dimensions). */
const BOOKMARK_TEXT=new Map();
const bookmarkTextSignature=row=>{
  const p=row.p;
  return p?[p.detailsReady?1:0,(p.tags||[]).length,(p.artists||[]).length,(p.characters||[]).length,(p.series||[]).length,String(p.t||p.title||"").length,String(p.srcName||"").length].join("|"):"none";
};
function bookmarkSearchText(row){
  const signature=bookmarkTextSignature(row),hit=BOOKMARK_TEXT.get(String(row.id));
  if(hit&&hit.signature===signature)return hit.text;
  const p=row.p||{},list=value=>Array.isArray(value)?value:value?[value]:[];
  const fields=[row.id,row.source,PB_SOURCES[row.source]?.name,p.sid,p.t,p.title,p.srcName,...list(p.tags),...list(p.characters),...list(p.artists),...list(p.series)];
  const text=bookmarkSearchNormalize(fields.map(value=>typeof value==="object"&&value?value.name_en||value.name||value.tag||"":value).filter(value=>value!==null&&value!==undefined).join(" "));
  if(BOOKMARK_TEXT.size>12000)BOOKMARK_TEXT.clear();
  BOOKMARK_TEXT.set(String(row.id),{signature,text});
  return text;
}
function visibleBookmarkRows(rows=bookmarkRows()){
  const terms=bookmarkSearchNormalize(BOOKMARK_VIEW.query).split(" ").filter(Boolean);
  return rows.filter(row=>(BOOKMARK_VIEW.source==="all"||row.source===BOOKMARK_VIEW.source)&&(!terms.length||terms.every(term=>bookmarkSearchText(row).includes(term))))
    .sort((a,b)=>{const newest=b.savedAt-a.savedAt||a.index-b.index;return BOOKMARK_VIEW.order==="oldest"?-newest:newest});
}
function bookmarkCardHTML(row){
  if(row.p)return pc({...row.p,r:masonryRatio(row)}).replace('data-a="open"','data-a="bookmarkopen"');
  // A legacy save without cached media is still a real saved record, not a
  // fabricated image. Fetch its preview only if the user chooses to open it.
  return `<button class="bookmark-unavailable" data-a="bookmarkopen" data-id="${esc(row.id)}" aria-label="Open saved post ${esc(row.id)}">${I.bookmark(false)}<span>Saved post</span><small>Preview not cached</small></button>`;
}
/* A library can hold thousands of posts; drawing all of them before the first
   pixel is what made the tab slow. The first screenful is drawn immediately and
   the rest is appended in place as you scroll, exactly like the feed. */
const BOOKMARK_FIRST=48,BOOKMARK_CHUNK=240;
let BM_VIEW={grid:null,list:null,shown:0};
function bookmarkTailHTML(list,shown){
  return shown<list.length?`<div class="bm-tail" aria-hidden="true">${SPIN}</div>`:"";
}
function bookmarkResultsHTML(visible){
  BM_VIEW={grid:null,list:visible,shown:Math.min(visible.length,BOOKMARK_FIRST)};
  if(visible.length)return masonry(visible.slice(0,BM_VIEW.shown),bookmarkCardHTML,0)+bookmarkTailHTML(visible,BM_VIEW.shown);
  if(bookmarkSearchNormalize(BOOKMARK_VIEW.query))return `<div class="empty bookmarks-empty">No bookmarks match “${esc(BOOKMARK_VIEW.query.trim())}”.<br>Try another search or source.</div>`;
  return '<div class="empty bookmarks-empty">No bookmarks yet.<br>Tap the bookmark icon on a post to save it here.</div>';
}
/* Bind the freshly drawn library so later posts can be appended, not redrawn. */
function bookmarkBindResults(){
  const grid=app.querySelector(".bookmark-results .grid");
  if(!grid||!BM_VIEW.list)return false;
  if(!masonryBind(grid,BM_VIEW.list.slice(0,BM_VIEW.shown),0,bookmarkCardHTML))return false;
  BM_VIEW.grid=grid;
  return true;
}
function bookmarkMore(){
  const view=BM_VIEW;
  if(!view.grid||!view.list||view.shown>=view.list.length)return false;
  if(S.screen!=="profile"||S.bt!=="Bookmarks")return false;
  const next=Math.min(view.list.length,view.shown+BOOKMARK_CHUNK);
  if(!masonryAppend(view.grid,view.list.slice(0,next),0)){BM_VIEW={grid:null,list:null,shown:0};refreshPane("Bookmarks");bookmarkBindResults();return false}
  view.shown=next;
  if(next>=view.list.length)app.querySelector(".bm-tail")?.remove();
  return true;
}
let LIB_WAIT_REDRAW=0;
function bookmarksPane(){
  // The previews come from IndexedDB after the first paint; until they land the
  // library would look like a wall of "preview not cached" placeholders.
  if(!PB_RUNTIME.libraryHydrated()&&S.bookmarks.length&&!Object.keys(S.pinCache||{}).length){
    if(!LIB_WAIT_REDRAW){LIB_WAIT_REDRAW=1;PB_RUNTIME.libraryReady().then(()=>{LIB_WAIT_REDRAW=0;if(S.screen==="profile"&&S.bt==="Bookmarks")refreshPane("Bookmarks")})}
    return `<h1 class="sr-only">Bookmarks</h1><div class="phead bookmarks-head"><div class="bookmarks-summary"><b>${S.bookmarks.length.toLocaleString()} bookmarks</b><span>Reading your library…</span></div></div><div class="empty">${SPIN}</div>`;
  }
  const rows=bookmarkRows(),sources=bookmarkSourceOptions(rows);
  if(BOOKMARK_VIEW.source!=="all"&&!sources.some(source=>source.id===BOOKMARK_VIEW.source))BOOKMARK_VIEW.source="all";
  const selected=sources.find(source=>source.id===BOOKMARK_VIEW.source),name=selected?selected.name:"All";
  const visible=visibleBookmarkRows(rows),oldest=BOOKMARK_VIEW.order==="oldest",query=BOOKMARK_VIEW.query||"";
  const option=(id,label,count)=>`<button type="button" role="option" tabindex="-1" aria-selected="${BOOKMARK_VIEW.source===id}" data-a="bookmarksourcepick" data-v="${esc(id)}"><span>${esc(label)}</span>${id==="all"?"":`<span class="bookmark-option-count">${count.toLocaleString()}</span>`}<span class="bookmark-option-check" aria-hidden="true">${BOOKMARK_VIEW.source===id?"✓":""}</span></button>`;
  const head=`<div class="phead bookmarks-head"><div class="bookmarks-summary">
<div class="exhead bookmarks-count"><b aria-live="polite">${visible.length.toLocaleString()} ${visible.length===1?"bookmark":"bookmarks"}</b><span>${bookmarkSearchNormalize(query)?"Search results":"Saved on this device"}</span></div>
<button type="button" class="chip bookmark-sort" data-a="bookmarksort" aria-pressed="${oldest}" aria-label="${oldest?"Oldest":"Newest"} saved first. Switch to ${oldest?"newest":"oldest"} first">${I.sort()}<span>${oldest?"Oldest":"Newest"}</span></button></div>
<div class="bookmarks-filters"><div class="bookmark-search" role="search">${I.srch(20)}<input type="search" id="bookmarkSearch" placeholder="Search bookmarks" aria-label="Search bookmarks" value="${esc(tagField("bookmarkSearch").draft)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"><button type="button" class="bookmark-search-clear" data-a="bookmarkclear" aria-label="Clear bookmark search" ${query?"":"hidden"}>${I.x(16)}</button></div><div class="bookmarks-source">
<button type="button" class="chip bookmark-source-toggle" data-a="bookmarksources" aria-label="Filter bookmarks by source: ${esc(name)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="bookmark-source-options"><span class="bookmark-source-label"><span class="bookmark-source-name">${esc(name)}</span>${selected?`<span class="bookmark-selected-count">(${selected.count.toLocaleString()})</span>`:""}</span>${I.chev()}</button>
<div class="bookmark-source-menu" id="bookmark-source-options" role="listbox" aria-label="Bookmark sources" hidden>${option("all","All",rows.length)}${sources.map(source=>option(source.id,source.name,source.count)).join("")}</div></div></div></div>`;
  return `<section class="bookmarks-library" aria-label="Saved bookmarks">${head}<div class="bookmark-results">${bookmarkResultsHTML(visible)}</div></section>`;
}
// Search only local saved records and update results in place. Keeping the
// input element mounted preserves the caret, focus and mobile keyboard.
function updateBookmarkSearch(){
  const library=document.querySelector(".bookmarks-library");if(!library)return;
  const visible=visibleBookmarkRows(),count=library.querySelector(".bookmarks-count b"),caption=library.querySelector(".bookmarks-count>span");
  if(count)count.textContent=visible.length.toLocaleString()+" "+(visible.length===1?"bookmark":"bookmarks");
  if(caption)caption.textContent=bookmarkSearchNormalize(BOOKMARK_VIEW.query)?"Search results":"Saved on this device";
  library.querySelector(".bookmark-results").innerHTML=bookmarkResultsHTML(visible);
  bookmarkBindResults();
  library.querySelector(".bookmark-search-clear").hidden=!BOOKMARK_VIEW.query;
}
function clearBookmarkSearch(){
  clearTagField("bookmarkSearch");
  BOOKMARK_VIEW.query="";const input=document.getElementById("bookmarkSearch");
  if(input){input.value="";input.focus({preventScroll:true})}updateBookmarkSearch();
}
function closeBookmarkSources(restoreFocus=false){
  const box=document.querySelector(".bookmarks-source");if(!box)return;
  const trigger=box.querySelector(".bookmark-source-toggle"),menu=box.querySelector(".bookmark-source-menu");
  menu.hidden=true;trigger.setAttribute("aria-expanded","false");box.classList.remove("is-open");
  if(restoreFocus)trigger.focus({preventScroll:true});
}
function toggleBookmarkSources(){
  const box=document.querySelector(".bookmarks-source");if(!box||S.bt!=="Bookmarks")return;
  const trigger=box.querySelector(".bookmark-source-toggle"),menu=box.querySelector(".bookmark-source-menu"),open=menu.hidden;
  menu.hidden=!open;trigger.setAttribute("aria-expanded",String(open));box.classList.toggle("is-open",open);
}
function refreshBookmarks(focus){
  closeBookmarkSources();refreshPane("Bookmarks");
  if(focus){const button=document.querySelector('.tabpane[data-tab="Bookmarks"] '+focus);if(button)button.focus({preventScroll:true})}
}
function toggleBookmark(id){
  const previous=S.bookmarks.slice();
  const p=pin(id),saved=bookmarked(id);
  if(!saved&&!p){toast("This post is no longer available.");return}
  if(saved){S.bookmarks=S.bookmarks.filter(record=>!eqId(record.id,id));S.bmDeleted[String(id)]=Date.now()}
  else{rememberPin(p);S.bookmarks.unshift({id:String(id),savedAt:Date.now()});delete S.bmDeleted[String(id)]}
  forgetBookmarkIds(id);BOOKMARK_TEXT.delete(String(id));
  if(!save(true)){S.bookmarks=previous;forgetBookmarkIds(id);toast("Bookmark change was not saved. Storage is unavailable or full.");return}
  const actions=document.querySelector("#sheet .post-actions");if(actions&&p)actions.innerHTML=postActionsHTML(p);
  document.querySelectorAll('.glint-card-save').forEach(b=>{if(b.dataset.id===String(id)){b.classList.toggle('on',!saved);b.setAttribute('aria-pressed',String(!saved));b.setAttribute('aria-label',saved?'Save image':'Remove bookmark');b.innerHTML=I.bookmark(!saved)}});let badge=document.querySelector('.glint-badge');if(!badge&&S.bookmarks.length){document.querySelector('#nav [data-v="profile"]')?.insertAdjacentHTML('beforeend','<span class="glint-badge"></span>');badge=document.querySelector('.glint-badge')}if(badge){badge.hidden=!S.bookmarks.length;badge.textContent=S.bookmarks.length>99?'99+':S.bookmarks.length}
  refreshBookmarks();toast(saved?"Bookmark removed":"Bookmarked");
}
async function openBookmark(id,button){
  const p=pin(id);if(p){rememberPin(p);save();detail(id);return}
  const source=String(id).split(":")[0],sid=String(id).slice(source.length+1);
  if(!PB_SOURCES[source]||!sid)return;
  button.disabled=true;button.setAttribute("aria-busy","true");let timer;
  try{
    const fresh=await Promise.race([pbLoadPostDetails(source,sid),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("The source took too long. Try again.")),15000)})]);
    if(!fresh)throw new Error("This preview is not available from the source.");
    const loaded=normPin(fresh,source);rememberPin(loaded);save();refreshBookmarks();
    if(S.screen==="profile"&&S.bt==="Bookmarks"&&bookmarked(id))detail(id);
  }catch(e){toast(e.message||"Could not open this bookmark.")}
  finally{clearTimeout(timer);button.disabled=false;button.removeAttribute("aria-busy")}
}
// One tab's worth of content — used for the live pane and for the pane that
// slides in during a swipe.
function paneHTML(tab){
  if(tab==="Explore")return explorePane();
  if(tab==="Likes")return likesPane();
  return bookmarksPane();
}
// Build the tabs you are not looking at while the browser is idle, so a
// swipe never has to construct a page mid-gesture (that was the hitch).
const idleFn=window.requestIdleCallback||(fn=>setTimeout(fn,220));
function prebuildPanes(){
  if(0)return;
  const wrap=document.querySelector(".tabwrap");if(!wrap)return;
  wrap.querySelectorAll(".tabpane[data-tab]").forEach(p=>{
    if(p.dataset.built||p.dataset.tab===S.bt)return;
    p.innerHTML=paneHTML(p.dataset.tab);
    p.dataset.built="1";
  });
}
function profile(){const explore=S.bt==="Explore";return `${glintHeader(explore?"explore":S.bt==="Likes"?"likes":"saved")}${explore||!hasLikesTab()?"":`<div class="glint-library-tabs" role="tablist" aria-label="Saved images"><span class="glint-library-pill" aria-hidden="true" style="transform:translateX(${S.bt==="Bookmarks"?"100%":"0"})"></span><button role="tab" id="glint-likes-tab" aria-selected="${S.bt==="Likes"}" aria-controls="glint-library-panel" data-a="glintlibrarytab" data-v="Likes">${I.heart(false)}<span>Likes</span></button><button role="tab" id="glint-bookmarks-tab" aria-selected="${S.bt==="Bookmarks"}" aria-controls="glint-library-panel" data-a="glintlibrarytab" data-v="Bookmarks">${I.bookmark(false)}<span>Bookmarks</span></button></div>`}<div class="tabwrap"><div class="tabpane" id="glint-library-panel" ${explore?"":`role="tabpanel" aria-labelledby="${S.bt==="Likes"?"glint-likes-tab":"glint-bookmarks-tab"}"`} data-tab="${S.bt}">${paneHTML(S.bt)}</div></div>`}

// Keep the actual buttons mounted: async feed redraws must not replace a button under a tap.
function syncGlintNav(){
 const nav=document.getElementById("nav"),ov=document.getElementById("ov"),panel=document.getElementById("sheet");if(!nav)return;
 if(!nav.querySelector('.glint-nav-pill'))nav.innerHTML=`<span class="glint-nav-pill" aria-hidden="true"></span><button data-a="nav" data-v="home" aria-label="Feed">${glintIcon("feed")}</button><button data-a="nav" data-v="profile" aria-label="Saved">${I.bookmark(false)}</button><button data-a="settings" aria-label="Settings" aria-haspopup="dialog" aria-expanded="false">${glintIcon("settings")}</button>`;
 const settingsOpen=!!(ov?.classList.contains("show")&&panel?.classList.contains("glint-settings"));
 const onHome=S.screen==="home"||(S.screen==="profile"&&S.bt==="Explore");
 const key=settingsOpen?"settings":onHome?"home":S.screen==="profile"?"profile":null;
 nav.dataset.active=key||"none";
 const pill=nav.querySelector('.glint-nav-pill');pill.style.transform=`translateX(${key==="settings"?124:key==="profile"?62:0}px)`;pill.hidden=!key;
 nav.querySelectorAll('button').forEach(button=>{const selected=button.dataset.a==="settings"?settingsOpen:button.dataset.v===key;if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');if(button.dataset.a==="settings")button.setAttribute('aria-expanded',String(settingsOpen))});
 if(!ov?.classList.contains('show')){nav.inert=false;document.body.classList.remove('glint-away')}
}
function render(){const active=document.activeElement,f=active&&app.contains(active)&&active.id;const selection=active&&typeof active.selectionStart==="number"?[active.selectionStart,active.selectionEnd]:null;
if(tabsList().indexOf(S.bt)<0)S.bt="Bookmarks";
app.dataset.screen=S.screen;app.classList.remove("glint-filters-open");
if(PAGER_CLEANUP){PAGER_CLEANUP();PAGER_CLEANUP=null}
ART_PRIO=0;
const existingLibraryTabs=app.querySelector('.glint-library-tabs');
const previousLibraryPill=existingLibraryTabs?.querySelector('.glint-library-pill');
const previousLibraryTransform=previousLibraryPill?getComputedStyle(previousLibraryPill).transform:null;
const previousLibrarySelection=existingLibraryTabs?.querySelector('[aria-selected="true"]')?.dataset.v;
app.innerHTML=S.screen==="home"?home():S.screen==="search"?search():profile();
const freshLibraryTabs=app.querySelector('.glint-library-tabs');
if(existingLibraryTabs&&freshLibraryTabs){
 freshLibraryTabs.replaceWith(existingLibraryTabs);
 existingLibraryTabs.querySelectorAll('[role="tab"]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.v===S.bt)));
 const pill=existingLibraryTabs.querySelector('.glint-library-pill');
 for(const animation of pill.getAnimations())animation.cancel();
 pill.style.transition='none';
 const destination=`translateX(${S.bt==='Bookmarks'?'100%':'0'})`;
 pill.style.transform=destination;
 if(previousLibrarySelection!==S.bt&&previousLibraryTransform&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  pill.animate([{transform:previousLibraryTransform},{transform:destination}],{duration:380,easing:'cubic-bezier(.22,1,.36,1)'});
 }
}

// The freshly drawn feed remembers its column heights, so the next page can be
// appended into it instead of rebuilding the screen.
if(S.screen==="home"&&HOME_LIST)masonryBind(app.querySelector(".feedwrap .grid"),HOME_LIST,0);
if(S.screen==="profile"&&S.bt==="Bookmarks")bookmarkBindResults();
if(S.screen==="search"){ensureSearchCount();renderSearchChips();markSearchPending()}
if(WANT_TOP){try{scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;}catch(e){}}
TAB_ANIM=null;
if(S.screen==="profile"&&!S.open){idleFn(()=>{if(S.screen!=="profile"||S.open)return;if(!CAR)prebuildPanes();if(S.bt==="Explore")exploreEnsure();
if(S.bt==="Likes"){const f=favState(S.src);if(!f.busy&&!f.err&&favoritesNeedRefresh(f))loadFavorites(true)}});try{if(!localStorage.getItem("pb-swipe-hint-v22")){localStorage.setItem("pb-swipe-hint-v22","1");setTimeout(()=>{const tl=tabsList(),nx=tl[tl.indexOf(S.bt)+1]||tl[0];toast(APP_VERSION+" · swipe "+(S.sw==="right"?"right":"left")+" for "+nx+" →")},700);const pn=document.querySelector(".tabpane");if(pn){pn.classList.add("peek");setTimeout(()=>pn.classList.remove("peek"),650);}}}catch(x){}}
syncGlintNav();

PB_RUNTIME.enhance(app);window.PB_DRIVE?.paintRings();if(document.getElementById("ov").classList.contains("show"))PB_RUNTIME.dialogOpen(document.getElementById("sheet"));
if(SRC_SLIDE)playSrcSlide();
placeSrcInd();
if(f){const e=document.getElementById(f);if(e){e.focus({preventScroll:true});if(selection&&typeof e.setSelectionRange==="function")try{e.setSelectionRange(...selection)}catch(x){}}}try{document.querySelectorAll(".tabs").forEach(t=>{const b=t.querySelector("button.on");if(!b)return;
const l=b.offsetLeft,r=l+b.offsetWidth;
if(l<t.scrollLeft+2)t.scrollLeft=Math.max(0,l-6);else if(r>t.scrollLeft+t.clientWidth-2)t.scrollLeft=r-t.clientWidth+6;});}catch(e){}save()}
let SHEET_DRAG_CLEANUP=null;
function stopSheetDrag(){const cleanup=SHEET_DRAG_CLEANUP;SHEET_DRAG_CLEANUP=null;if(cleanup)cleanup()}
/* The grabber drawn at the top of a sheet is a promise, not decoration: pull it
   (or the sheet itself when it is already at the top of its scroll) downwards and
   the sheet follows the finger and dismisses on a deliberate pull. Taps, buttons,
   form fields, sideways swipes, inner scrolling and the pages that already own a
   gesture (post, Related art, tag feeds, Explore feeds, the viewer) are untouched. */
function initSheetDrag(panel){
 const listeners=[],points=new Set(),EASE=PAGE_EASE;
 let gesture=null,multi=false,blockClick=null,timer=0,closing=false;
 const listen=(type,handler,options)=>{panel.addEventListener(type,handler,options);listeners.push([type,handler,options])};
 const owned=()=>!panel.isConnected||!$("#ov").classList.contains("show")||panel.classList.contains("full")||panel.classList.contains("post-sheet")||panel.classList.contains("post-blank-page")||panel.classList.contains("ex-feed-sheet")||panel.classList.contains("image-viewer")||!!panel.dataset.tagFeedKey||!!panel.dataset.postId;
 const field=target=>!!(target&&target.closest&&target.closest("input,textarea,select,[contenteditable]:not([contenteditable='false'])"));
 const scrolled=target=>{
  if(panel.scrollTop>0)return true;
  let el=target instanceof Element?target:null;
  while(el&&el!==panel){if(el.scrollHeight-el.clientHeight>4&&el.scrollTop>0)return true;el=el.parentElement}
  return false;
 };
 const reset=()=>{clearTimeout(timer);panel.style.transition="";panel.style.transform="";panel.style.opacity=""};
 const clearOpen=()=>{for(const a of panel.getAnimations()){try{if(a.effect&&a.effect.target===panel)a.cancel()}catch(e){}}};
 const follow=dy=>{
  if(!closing)clearOpen();
  const pull=Math.max(0,(dy||0)*.85);
  panel.style.transition="none";
  panel.style.transform=pull?`translateY(${pull}px)`:"";
  panel.style.opacity=String(Math.max(.5,1-pull/(Math.max(1,innerHeight)*.7)));
 };
 const springBack=()=>{
  if(!panel.style.transform&&!panel.style.opacity){panel.style.transition="";return}
  panel.style.transition=`transform .26s ${EASE},opacity .26s ${EASE}`;
  panel.style.transform="";panel.style.opacity="";
  clearTimeout(timer);timer=setTimeout(()=>{panel.style.transition=""},290);
 };
 const begin=(point,target)=>{
  blockClick=null;
  if(closing||owned()||field(target)){gesture=null;return}
  gesture={id:point.pointerId,x:point.clientX,y:point.clientY,target:target instanceof Element?target:panel,moved:false,t:performance.now()};
  if(scrolled(gesture.target))gesture=null;
 };
 const move=(point,event)=>{
  if(!gesture||closing)return;
  const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
  if(dy<=8||Math.abs(dy)<=Math.abs(dx)*1.2){if(gesture.moved)follow(0);return}
  if(scrolled(gesture.target)){gesture.y=point.clientY;gesture.t=performance.now();return}
  if(event.cancelable)event.preventDefault();
  if(Math.hypot(dx,dy)>12)gesture.moved=true;
  follow(dy);
  if(point.pointerId!==undefined&&point.pointerType==="mouse"){try{panel.setPointerCapture(point.pointerId)}catch(e){}}
 };
 const finish=point=>{
  const g=gesture;gesture=null;if(!g)return;
  const dx=point.clientX-g.x,dy=point.clientY-g.y,dt=Math.max(1,performance.now()-g.t);
  if(g.moved)blockClick={until:performance.now()+400,x:point.clientX,y:point.clientY};
  const fast=dy/dt>.45&&dy>48;
  if(dy<Math.abs(dx)*1.35||(dy<104&&!fast)||owned()){springBack();return}
  closing=true;
  if(REDUCED_MOTION()){reset();close();return}
  panel.style.transition=`transform .22s ${EASE},opacity .22s ${EASE}`;
  panel.style.transform="translateY(100%)";panel.style.opacity="0";
  clearTimeout(timer);
  timer=setTimeout(()=>{closing=false;close();reset()},230);
 };
 const cancel=()=>{gesture=null;springBack()};
 listen("dragstart",event=>{if(event.cancelable)event.preventDefault()});
 listen("click",event=>{
  if(!blockClick||performance.now()>blockClick.until||Math.hypot(event.clientX-blockClick.x,event.clientY-blockClick.y)>30)return;
  blockClick=null;event.preventDefault();event.stopImmediatePropagation();
 },true);
 if("PointerEvent" in window){
  listen("pointerdown",event=>{
   if(event.pointerType!=="mouse"||event.button!==0)return;
   points.add(event.pointerId);
   if(points.size!==1){multi=true;gesture=null;springBack();return}
   begin(event,event.target);
  });
  listen("pointermove",event=>{if(points.has(event.pointerId))move(event,event)});
  listen("pointerup",event=>{
   if(!points.has(event.pointerId))return;
   points.delete(event.pointerId);
   try{if(panel.hasPointerCapture(event.pointerId))panel.releasePointerCapture(event.pointerId)}catch(e){}
   if(!points.size){multi=false;finish(event)}
  });
  listen("pointercancel",()=>{points.clear();multi=false;cancel()});
 }
 listen("touchstart",event=>{
  if(event.touches.length!==1){multi=true;gesture=null;springBack();return}
  if(!multi)begin(event.touches[0],event.target);
 },{passive:true});
 listen("touchmove",event=>{if(!multi&&event.touches.length===1)move(event.touches[0],event)},{passive:false});
 listen("touchend",event=>{
  if(!multi&&!event.touches.length&&event.changedTouches.length)finish(event.changedTouches[0]);
  if(!event.touches.length){multi=false;gesture=null}
 });
 listen("touchcancel",()=>{multi=false;cancel()});
 return ()=>{reset();for(const [type,handler,options] of listeners)panel.removeEventListener(type,handler,options)};
}
function sheet(h,full,showClose=true){stopSheetDrag();document.querySelectorAll("#sheet video").forEach(video=>video.pause());closeBookmarkSources();if(POST_TIME_TIMER){clearInterval(POST_TIME_TIMER);POST_TIME_TIMER=null}leaveBlankPage();leaveTagFeed();stopPostSwipe();if(IMAGE_ZOOM_CLEANUP){IMAGE_ZOOM_CLEANUP();IMAGE_ZOOM_CLEANUP=null}const s=$("#sheet"),nav=NAV_ENTER&&performance.now()<NAV_ENTER.until&&!REDUCED_MOTION()?NAV_ENTER:null;NAV_ENTER=null;
const sign=nav?(nav.dir==="up"?-1:1):0;
document.querySelectorAll(".sheet-next,.shrink-float").forEach(n=>n.remove());{const o=$("#ov");o.style.background="";o.style.transition=""}
// old page leaves as a snapshot while the new one arrives from the opposite edge
if(nav&&$("#ov").classList.contains("show"))ghostOut(s,sign,nav.offset);
for(const a of s.getAnimations())a.cancel();
s.className="sheet"+(full?" full":"");s.style.transform="";s.style.transition="";s.style.opacity="";
if(nav)PB_RUNTIME.animate(s,[{transform:`translateY(calc(${-sign*100}% + ${nav.offset||0}px))`},{transform:"translateY(0)"}],{duration:PAGE_MS,easing:PAGE_EASE});
s.dataset.postId="";s.dataset.returnPost="";s.dataset.tagsPostId="";s.dataset.blankPostId="";s.dataset.relatedState="";s.dataset.tagFeedKey="";s.setAttribute("aria-label","Glint dialog");s.setAttribute("role","dialog");s.setAttribute("aria-modal","true");
s.innerHTML=(full||!showClose?"":`<button class="sx" data-a="close" aria-label="Close">${I.x(18)}</button>`)+h;
s.removeAttribute("aria-labelledby");const title=s.querySelector("h2,h1");if(title){title.id="dialog-title";s.setAttribute("aria-labelledby",title.id)}
s.scrollTop=0;$("#ov").classList.add("show");PB_RUNTIME.dialogOpen(s);SHEET_DRAG_CLEANUP=initSheetDrag(s)}
// Post sub-pages have real history entries, so the phone's native Back
// gesture returns image/blank -> details -> feed without leaving Glint.
const POST_VIEW_KEY="__pinboardPostView";
let IMAGE_FULLSCREEN_WAS_ACTIVE=false;
let IMAGE_ZOOM_CLEANUP=null;
let POST_SWIPE_CLEANUP=null,NAV_ENTER=null;
const setNavEnter=(dir,offset=0,reveal=0)=>{NAV_ENTER={dir,offset,reveal,until:performance.now()+1200}};
const REDUCED_MOTION=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const PAGE_MS=300,PAGE_EASE="cubic-bezier(.32,.72,0,1)";
// sign: -1 = leaves through the top, +1 = leaves through the bottom
let LAST_NAV_SCREEN=null,OPEN_FROM=null,SKIP_CLOSE_ANIM=false,SRC_SLIDE=null,SW_OFFSET=0;
function feedThumbRect(id){
  const el=document.querySelector(`[data-a="open"][data-id="${CSS.escape(String(id))}"] .art`);if(!el)return null;
  const r=el.getBoundingClientRect();
  return r.width>8&&r.height>8&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth?r:null;
}
// A floating copy of a picture that can fly between the feed thumbnail and the post.
function makeFloat(node,rect,radius=0){
  const box=document.createElement("div");box.className="shrink-float";
  let inner;
  if(node.tagName==="IMG"){inner=document.createElement("img");inner.src=node.currentSrc||node.src;inner.alt="";inner.draggable=false}
  else{inner=node.cloneNode(true);inner.style.cssText="width:100%;height:100%;border-radius:0;max-height:none"}
  box.appendChild(inner);
  Object.assign(box.style,{left:rect.left+"px",top:rect.top+"px",width:rect.width+"px",height:rect.height+"px",borderRadius:radius+"px"});
  box._base={left:rect.left,top:rect.top,width:rect.width,height:rect.height};
  document.body.appendChild(box);return box;
}
// Moves a float to rect r with transform only: compositor-friendly, no layout.
// vr = the corner radius it should *look* like on screen (scaling is compensated).
const placeBox=(box,r,vr=0)=>{const b=box._base,sx=r.width/b.width;box.style.transform=`translate3d(${r.left-b.left}px,${r.top-b.top}px,0) scale(${sx},${r.height/b.height})`;box.style.borderRadius=(sx>0?vr/sx:0)+"px"};
const flyBox=(box,r,vr,ms=PAGE_MS)=>{box.style.transition=`transform ${ms}ms ${PAGE_EASE},border-radius ${ms}ms ${PAGE_EASE}`;placeBox(box,r,vr)};
// Opening from the feed: the thumbnail grows into the post picture.
function captureOpen(id,el){
  const art=el&&el.querySelector&&el.querySelector(".art");if(!art||REDUCED_MOTION())return null;
  const r=art.getBoundingClientRect();if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight)return null;
  const im=art.querySelector("img");
  return {id:String(id),rect:r,node:im||art,until:performance.now()+800};
}
function playOpen(panel,id){
  const o=OPEN_FROM;OPEN_FROM=null;
  if(!o||o.id!==String(id)||performance.now()>o.until||REDUCED_MOTION())return;
  // gentle rise + fade, GPU-only
  PB_RUNTIME.animate(panel,[{opacity:0},{opacity:1}],{duration:150,easing:"ease-out"});
}
// Closing by Back button / Android back gesture: the picture shrinks into its thumbnail.
function closeAnimated(){
  if(SKIP_CLOSE_ANIM){SKIP_CLOSE_ANIM=false;return}
  const panel=$("#sheet"),ov=$("#ov");
  if(REDUCED_MOTION()||!ov.classList.contains("show")||!panel.classList.contains("post-sheet"))return;
  { // quick fade-out of a snapshot while the feed appears underneath
    const wrap=document.createElement("div");wrap.className="sheet-ghost";
    const clone=panel.cloneNode(true);clone.removeAttribute("id");clone.setAttribute("aria-hidden","true");wrap.appendChild(clone);document.body.appendChild(wrap);
    const a=wrap.animate([{opacity:1},{opacity:0}],{duration:150,easing:"ease-out",fill:"forwards"});a.onfinish=a.oncancel=()=>wrap.remove();
    return;
  }
  const T=feedThumbRect(panel.dataset.postId),img=panel.querySelector(".post-image")||panel.querySelector(".post-media .art");
  if(!T||!img)return;
  const R=img.getBoundingClientRect(),box=makeFloat(img,R,0);
  img.style.visibility="hidden";
  const wrap=document.createElement("div");wrap.className="sheet-ghost";wrap.style.background="var(--bg)";document.body.appendChild(wrap);
  box.style.zIndex=62;
  wrap.animate([{opacity:1},{opacity:0}],{duration:PAGE_MS*.8,easing:"ease-out",fill:"forwards"});
  box.offsetWidth;flyBox(box,T,12);
  setTimeout(()=>{wrap.remove();box.remove()},PAGE_MS+60);
}
// ── Home / search: slide between sources ───────────────────────────────
const feedEl=()=>S.screen==="search"?$("#sres"):S.screen==="home"?app.querySelector(".feedwrap"):null;
let SW_SIGN=0,SRC_IND=null;
function placeSrcInd(){
  const row=document.querySelector(".srctabs");if(!row)return;
  const ind=row.querySelector(".tind"),b=row.querySelector("button.on");if(!ind)return;
  if(!b){ind.style.display="none";return}
  const g={l:b.offsetLeft,w:b.offsetWidth,t:b.offsetTop+b.offsetHeight-3};
  ind.style.top=g.t+"px";
  if(SRC_IND&&!REDUCED_MOTION()){
    ind.style.transition="none";ind.style.width=SRC_IND.w+"px";ind.style.transform=`translate3d(${SRC_IND.l}px,0,0)`;ind.offsetWidth;ind.style.transition="";
  }
  ind.style.width=g.w+"px";ind.style.transform=`translate3d(${g.l}px,0,0)`;SRC_IND=g;
}
function dragSrcInd(dx,j){
  const row=document.querySelector(".srctabs");if(!row||!SRC_IND)return;
  const ind=row.querySelector(".tind"),b=row.querySelector(`button[data-v="${CSS.escape(S.srcs[j])}"]`);if(!ind||!b)return;
  const p=Math.min(1,Math.abs(dx)/innerWidth),l=SRC_IND.l+(b.offsetLeft-SRC_IND.l)*p,w=SRC_IND.w+(b.offsetWidth-SRC_IND.w)*p;
  ind.style.transition="none";ind.style.width=w+"px";ind.style.transform=`translate3d(${l}px,0,0)`;
}
function resetSrcInd(){
  const ind=document.querySelector(".srctabs .tind");if(!ind||!SRC_IND)return;
  ind.style.transition="";ind.style.width=SRC_IND.w+"px";ind.style.transform=`translate3d(${SRC_IND.l}px,0,0)`;
}
const SRC_EASE="cubic-bezier(.22,.9,.3,1)";   // same curve as the Likes/Bookmarks/Explore pager
const QUICK_SWITCH_MS=450;
let LAST_SWITCH_AT=0;
function prepSrcSlide(v){
  const forced=SW_SIGN,px=SW_OFFSET;SW_SIGN=0;SW_OFFSET=0;
  /* Only one outgoing feed may ever be on screen, and a tap that lands on the
     heels of another one swaps instantly: two sliders crossing would show the
     old source's pictures while the new one is still empty. */
  const now=performance.now(),quick=now-LAST_SWITCH_AT<QUICK_SWITCH_MS;LAST_SWITCH_AT=now;
  document.querySelectorAll(".src-ghost").forEach(n=>n.remove());
  const el=feedEl(),from=S.srcs.indexOf(S.src),to=S.srcs.indexOf(v);
  if(quick||REDUCED_MOTION()||!el||to<0||from<0||from===to||S.mode!=="live"){if(el){el.style.transform="";el.style.transition=""}return}
  const sign=forced||(to>from?-1:1),r=el.getBoundingClientRect(),W=r.width||innerWidth;
  const dur=Math.round(Math.min(340,Math.max(220,(1-Math.min(1,Math.abs(px)/W))*340)));
  const stk=app.querySelector(".stk"),top=Math.max(0,r.top,stk?stk.getBoundingClientRect().bottom:0);
  // the old feed is lifted out (no copy) and travels with the new one as a single strip
  const wrap=document.createElement("div");wrap.className="src-ghost";
  Object.assign(wrap.style,{top:top+"px",height:Math.max(0,innerHeight-top)+"px"});
  el.removeAttribute("id");el.style.cssText=`position:absolute;left:${r.left-px}px;top:${r.top-top}px;width:${r.width}px;margin:0`;
  wrap.appendChild(el);document.body.appendChild(wrap);
  const a=PB_RUNTIME.animate(el,[{transform:`translate3d(${px}px,0,0)`},{transform:`translate3d(${sign*W}px,0,0)`}],{duration:dur,easing:SRC_EASE,fill:"forwards"});
  a.onfinish=a.oncancel=()=>wrap.remove();
  SRC_SLIDE={sign,px,W,dur};
}
function playSrcSlide(){
  const o=SRC_SLIDE;SRC_SLIDE=null;const el=feedEl();if(!el||!o)return;
  PB_RUNTIME.animate(el,[{transform:`translate3d(${o.px-o.sign*o.W}px,0,0)`},{transform:"translate3d(0,0,0)"}],{duration:o.dur,easing:SRC_EASE});
}
{
  let g=null,blockUntil=0;
  const target=e=>{if(S.screen!=="home"||S.mode!=="live"||$("#ov").classList.contains("show"))return null;const el=feedEl(),t=e.target;return el&&t.closest&&el.contains(t)&&!t.closest("input,textarea")?el:null};
  const dest=dx=>{const i=S.srcs.indexOf(S.src);if(i<0)return -1;const next=S.sw==="right"?dx>0:dx<0,j=i+(next?1:-1);return j>=0&&j<S.srcs.length?j:-1};
  const cancel=()=>{const c=g;g=null;if(!c)return;resetSrcInd();if(c.el.isConnected){c.el.style.transform="";c.el.style.transition="";if(c.mode==="h")PB_RUNTIME.animate(c.el,[{transform:`translateX(${c.px}px)`},{transform:"translateX(0)"}],{duration:200,easing:SRC_EASE})}if(c.mode==="h")blockUntil=performance.now()+350};
  document.addEventListener("touchstart",e=>{if(e.touches.length!==1){cancel();return}if(g)cancel();const el=target(e);if(!el)return;for(const a of el.getAnimations())a.finish();g={x:e.touches[0].clientX,y:e.touches[0].clientY,t:performance.now(),el,mode:null,px:0,dx:0}},{passive:true});
  document.addEventListener("touchmove",e=>{if(!g)return;if(e.touches.length!==1||!g.el.isConnected){cancel();return}const dx=e.touches[0].clientX-g.x,dy=e.touches[0].clientY-g.y;if(!g.mode){if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.4)g.mode="h";else if(Math.abs(dy)>10)g.mode="v"}if(g.mode!=="h")return;g.dx=dx;g.px=Math.max(-innerWidth,Math.min(innerWidth,dest(dx)>=0?dx:dx*.22));g.el.style.transition="none";g.el.style.transform=`translateX(${g.px}px)`;const j=dest(dx);if(j>=0)dragSrcInd(dx,j);else resetSrcInd()},{passive:true});
  document.addEventListener("touchend",e=>{if(e.touches.length)return;const c=g;if(!c||c.mode!=="h"){g=null;return}const j=dest(c.dx),dt=Math.max(1,performance.now()-c.t),fast=Math.abs(c.dx)/dt>.5&&Math.abs(c.dx)>36;if(j>=0&&(Math.abs(c.dx)>innerWidth*.22||fast)){g=null;const id=S.srcs[j],b=document.querySelector(`.tabs button[data-a="src"][data-v="${CSS.escape(id)}"]`);blockUntil=0;SW_SIGN=c.dx<0?-1:1;SW_OFFSET=c.px;if(b)b.click();else cancel();SW_SIGN=0;SW_OFFSET=0;blockUntil=performance.now()+300}else cancel()},{passive:true});
  document.addEventListener("touchcancel",cancel,{passive:true});addEventListener("blur",cancel);addEventListener("resize",cancel);addEventListener("pagehide",cancel);
  document.addEventListener("click",e=>{if(performance.now()<blockUntil&&e.target.closest&&!e.target.closest("#nav")){e.preventDefault();e.stopImmediatePropagation()}},true);
}

function ghostOut(panel,sign,from=0){
  if(REDUCED_MOTION())return;
  const wrap=document.createElement("div");wrap.className="sheet-ghost";
  const clone=panel.cloneNode(true);clone.removeAttribute("id");clone.style.transform="";clone.style.transition="";clone.setAttribute("aria-hidden","true");
  wrap.appendChild(clone);document.body.appendChild(wrap);clone.scrollTop=panel.scrollTop;
  const startOpacity=clone.style.opacity||"1";
  const frames=sign>0?[{transform:`translateY(${from}px)`,opacity:startOpacity},{transform:`translateY(${sign*100}%)`,opacity:0}]:[{transform:`translateY(${from}px)`},{transform:`translateY(${sign*100}%)`}];
  const a=PB_RUNTIME.animate(clone,frames,{duration:PAGE_MS,easing:PAGE_EASE,fill:"forwards"});
  a.onfinish=a.oncancel=()=>wrap.remove();
}
const RELATED_PAGES=new Map(),RELATED_QUEUE=[];
const TAG_FEEDS=new Map();
let TAG_FEED_SCROLL_CLEANUP=null,TAG_FEED_SCROLL_CHECK=null,TAG_FEED_SWIPE_CLEANUP=null,POST_TIME_TIMER=null;
const TAG_FEED_TIMEOUT=15000;
let RELATED_ACTIVE=0,RELATED_TOKEN=0;
const RELATED_KINDS=[{key:"character",field:"characters",title:"Character"},{key:"artist",field:"artists",title:"Artist"},{key:"series",field:"series",title:"Series"}];
const postView=()=>history.state&&history.state[POST_VIEW_KEY];
function pushPostView(kind,id,extra={}){
  if(!postView())history.replaceState({...history.state,[POST_VIEW_KEY]:{kind:"app"}},"");
  const current=postView();
  if(current.kind===kind&&String(current.id)===String(id))return;
  history.pushState({...history.state,[POST_VIEW_KEY]:{...extra,kind,id:String(id)}},"");
}
function exitBrowserFullscreen(){
  const exit=document.exitFullscreen||document.webkitExitFullscreen;
  if(exit&&(document.fullscreenElement||document.webkitFullscreenElement)){
    try{const result=exit.call(document);if(result&&result.catch)result.catch(()=>{})}catch(e){}
  }
}
function leaveImageViewer(){
  const wasViewing=document.body.classList.contains("viewing-image");
  document.body.classList.remove("viewing-image");
  if(IMAGE_ZOOM_CLEANUP){IMAGE_ZOOM_CLEANUP();IMAGE_ZOOM_CLEANUP=null}
  for(const id of ["app","nav"]){const node=document.getElementById(id);if(node)node.inert=document.getElementById("ov").classList.contains("show")}
  IMAGE_FULLSCREEN_WAS_ACTIVE=false;
  if(wasViewing)exitBrowserFullscreen();
}
function close(){
  const current=postView(),panel=$("#sheet");
  if(panel.classList.contains('ex-feed-sheet')){closeExploreFeed(panel);return}

  // There are deliberately no tap-to-dismiss or on-screen exit controls in
  // the image viewer. Only a native history/fullscreen exit closes it.
  if(current&&current.kind==="image"&&document.body.classList.contains("viewing-image"))return;
  if(current&&["tags","blank","tagfeed"].includes(current.kind)){history.back();return}
  if(current&&current.kind==="post"){
    if(panel.dataset.postId!==String(current.id)){detail(current.id,true);return}
    history.back();return;
  }
  leaveImageViewer();leaveBlankPage();leaveTagFeed();stopPostSwipe();stopSheetDrag();$("#ov").classList.remove("show");PB_RUNTIME.dialogClose();
}
function backToPost(id){
  if(!NAV_ENTER)setNavEnter("down");
  const current=postView();
  if(current&&["tags","image","blank"].includes(current.kind)&&String(current.id)===String(id)){history.back();return}
  detail(id,!!(current&&current.kind==="post"&&String(current.id)===String(id)));
}
function restorePostView(state){
  const current=state&&state[POST_VIEW_KEY];
  if(current&&current.kind==="tagfeed"&&current.feed){tagFeedPage(current.feed,true);return}
  if(current&&pin(current.id)){
    if(current.kind==="image"){imageViewer(current.id,true);return}
    if(current.kind==="post"){detail(current.id,true);return}
    if(current.kind==="tags"){menu(current.id,true);return}
    if(current.kind==="blank"){blankPostPage(current.id,true);return}
  }
  closeAnimated();
  leaveImageViewer();leaveBlankPage();leaveTagFeed();stopPostSwipe();stopSheetDrag();$("#ov").classList.remove("show");PB_RUNTIME.dialogClose();
}
addEventListener("popstate",event=>restorePostView(event.state));
function fullscreenChanged(){
  const el=document.fullscreenElement||document.webkitFullscreenElement;
  if(el&&el.classList.contains("image-viewer")){IMAGE_FULLSCREEN_WAS_ACTIVE=true;return}
  if(IMAGE_FULLSCREEN_WAS_ACTIVE){
    IMAGE_FULLSCREEN_WAS_ACTIVE=false;
    // Android may consume Back to exit browser fullscreen first. Finish the
    // same navigation, but never pop twice if history has already changed.
    setTimeout(()=>{const current=postView();if(!document.fullscreenElement&&!document.webkitFullscreenElement&&current&&current.kind==="image"&&document.body.classList.contains("viewing-image"))history.back()},0);
  }
}
document.addEventListener("fullscreenchange",fullscreenChanged);
document.addEventListener("webkitfullscreenchange",fullscreenChanged);
function imageViewer(id,fromHistory=false){
  const p=pin(id);if(!p)return;
  if(!fromHistory){
    const current=postView();if(!current||current.kind!=="post"||String(current.id)!==String(id))pushPostView("post",id);
    pushPostView("image",id);
  }
  const play=videoPlayback(p),video=play?.src||"",image=iqURL(p,"viewer");
  if(video){
    sheet(`<video class="fullscreen-image fullscreen-video" src="${esc(video)}"${play?.fallback?` data-fallback-src="${esc(play.fallback)}"`:""}${videoPoster(p)?` poster="${esc(videoPoster(p))}"`:""} controls autoplay muted playsinline preload="metadata" loop draggable="false" aria-label="${esc((p.t||"Video")+" — play")}"></video>`,true);
    const vpanel=$("#sheet");vpanel.classList.add("image-viewer","video-viewer");vpanel.dataset.postId=String(id);vpanel.setAttribute("aria-label","Full-screen video");
    document.body.classList.add("viewing-image");
    for(const key of ["app","nav"]){const node=document.getElementById(key);if(node)node.inert=true}
    IMAGE_ZOOM_CLEANUP=null;
    return;
  }
  const media=image?`<img class="fullscreen-image" src="${esc(PB_RUNTIME.mediaURL(image))}" alt="${esc(p.t||"Post image")}" decoding="async" fetchpriority="high" draggable="false">`
    :art(p,"",true).replace(/xMidYMax slice/g,"xMidYMid meet");
  sheet(media,true);
  const panel=$("#sheet");panel.classList.add("image-viewer");panel.dataset.postId=String(id);panel.setAttribute("aria-label","Full-screen image");
  document.body.classList.add("viewing-image");
  for(const key of ["app","nav"]){const node=document.getElementById(key);if(node)node.inert=true}
  IMAGE_ZOOM_CLEANUP=initImageZoom(panel,p);
  // Request actual browser fullscreen when allowed. Embedded previews and
  // iOS may deny it; the edge-to-edge, control-free page still works there.
  if(!fromHistory){
    const request=panel.requestFullscreen||panel.webkitRequestFullscreen;
    if(request){
      try{
        const result=panel.requestFullscreen?request.call(panel,{navigationUI:"hide"}):request.call(panel);
        if(result&&result.then)result.then(()=>{if(!document.body.classList.contains("viewing-image"))exitBrowserFullscreen()}).catch(()=>{});
      }catch(e){}
    }
  }
}

// One stationary artwork layer stays behind the related glass surface.
function prepareRelatedBackdrop(p){
 const ov=$("#ov");let backdrop=ov.querySelector('.glint-related-backdrop');
 if(!backdrop){backdrop=document.createElement('div');backdrop.className='glint-related-backdrop';backdrop.setAttribute('aria-hidden','true');ov.prepend(backdrop)}
 if(backdrop.dataset.postId===String(p.id))return;
 backdrop.dataset.postId=String(p.id);
 const image=isVideoPin(p)?videoPoster(p):iqURL(p,"detail");
 backdrop.innerHTML=image?`<img src="${esc(PB_RUNTIME.mediaURL(image))}" alt="" decoding="async" draggable="false">`:art(p,"",true);
}
function relatedMotion(node,frames,duration=460){
 if(REDUCED_MOTION())return null;
 return node.animate(frames,{duration,easing:'cubic-bezier(.22,1,.36,1)'});
}
// Keep the actual, already-painted post underneath Related art. Reusing its
// DOM also keeps a decoded image (or the current video frame) during the swap.
function relatedPostUnderlay(id){
 return [...document.querySelectorAll('#ov > .glint-related-post-underlay')].find(n=>n.dataset.postId===String(id))||null;
}
function clearRelatedPostUnderlays(keep=[]){
 document.querySelectorAll('#ov > .glint-related-post-underlay').forEach(node=>{
  if(keep.includes(node))return;
  node.querySelectorAll('video').forEach(video=>video.pause());node.remove();
 });
}
function createRelatedPostUnderlay(p){
 const built=postDetailMarkup(p,p.id,false),node=document.createElement('div');
 node.className='sheet full post-sheet glint-related-post-underlay'+(built.video?' glint-video-post':'');
 node.dataset.postId=String(p.id);node.setAttribute('aria-hidden','true');node.inert=true;node.style.opacity='0';node.innerHTML=built.markup;
 const video=node.querySelector('video');if(video)video._glintResumeFromRelated=true;
 $('#ov').appendChild(node);return node;
}
function visibleOpacity(node,fallback=1){
 const opacity=node?parseFloat(getComputedStyle(node).opacity):NaN;
 return Number.isFinite(opacity)?Math.max(0,Math.min(1,opacity)):fallback;
}
function finishRelatedLayers(){
 // A new gesture owns the opacity values; finish any in-flight handoff first.
 document.querySelectorAll('#ov > .glint-related-post-underlay').forEach(node=>node.getAnimations().forEach(a=>{try{a.finish()}catch(e){a.cancel()}}));
 document.querySelectorAll('#ov > .glint-related-exit').forEach(node=>{node.getAnimations().forEach(a=>a.cancel());node.remove()});
}
function fadeRelatedOpacity(node,from,to,onFinish){
 const start=Math.max(0,Math.min(1,Number(from)||0));
 node.style.transition='none';node.style.opacity=String(to);
 if(REDUCED_MOTION()||Math.abs(start-to)<.001){if(onFinish)onFinish();return null}
 const animation=node.animate([{opacity:start},{opacity:to}],{duration:260,easing:'ease-out',fill:'both'});
 animation.finished.then(()=>{animation.cancel();if(onFinish)onFinish()},()=>{if(onFinish)onFinish()});
 return animation;
}
// Post and Related art remain in place and keep exactly the opacity reached
// by the finger. This avoids a one-frame flash when the live pages exchange IDs.
function relatedEnterMotion(node,reveal=0){return fadeRelatedOpacity(node,reveal,1)}
function beginRelatedEntry(p){
 const ov=$('#ov'),outgoing=$('#sheet'),postOpacity=visibleOpacity(outgoing);
 closeBookmarkSources();if(POST_TIME_TIMER){clearInterval(POST_TIME_TIMER);POST_TIME_TIMER=null}
 leaveBlankPage();leaveTagFeed();
 const preview=stopPostSwipe(true),reveal=visibleOpacity(preview,0);
 outgoing.getAnimations().forEach(a=>a.cancel());
 document.querySelectorAll('#ov > .glint-related-exit').forEach(node=>node.remove());
 document.querySelectorAll('.sheet-next,.shrink-float').forEach(node=>{if(node!==preview)node.remove()});
 outgoing.querySelectorAll('video').forEach(video=>{video._glintResumeFromRelated=!video.paused||(video.autoplay&&video.readyState<2);video.pause()});
 outgoing.removeAttribute('id');outgoing.classList.add('glint-related-post-underlay');outgoing.setAttribute('aria-hidden','true');outgoing.inert=true;
 outgoing.style.transition='none';outgoing.style.transform='none';outgoing.style.opacity=String(postOpacity);
 const incoming=preview||document.createElement('div');
 if(!preview)ov.appendChild(incoming);
 incoming.className='sheet full post-blank-page';incoming.id='sheet';incoming.inert=false;incoming.removeAttribute('aria-hidden');
 incoming.style.transition='none';incoming.style.transform='none';incoming.style.clipPath='';incoming.style.opacity=String(reveal);
 incoming.setAttribute('role','dialog');incoming.setAttribute('aria-modal','true');incoming.setAttribute('aria-label','Related art');
 const target=outgoing.dataset.postId===String(p.id)?outgoing:(relatedPostUnderlay(p.id)||createRelatedPostUnderlay(p));
 clearRelatedPostUnderlays([outgoing,target]);
 return {outgoing,incoming,postOpacity,reveal,keepPost:target===outgoing};
}
function beginRelatedExit(p){
 const related=$('#sheet'),post=relatedPostUnderlay(p.id)||createRelatedPostUnderlay(p);
 const relatedOpacity=visibleOpacity(related),postOpacity=visibleOpacity(post,0);
 // Save scroll and detach gesture handlers before changing which element is #sheet.
 closeBookmarkSources();leaveBlankPage();leaveTagFeed();stopPostSwipe();
 related.getAnimations().forEach(a=>a.cancel());post.getAnimations().forEach(a=>a.cancel());
 document.querySelectorAll('#ov > .glint-related-exit').forEach(node=>node.remove());
 related.removeAttribute('id');related.classList.add('glint-related-exit');related.setAttribute('aria-hidden','true');related.inert=true;
 related.style.transition='none';related.style.transform='none';related.style.opacity=String(relatedOpacity);
 post.classList.remove('glint-related-post-underlay');post.id='sheet';post.inert=false;post.removeAttribute('aria-hidden');
 post.style.transition='none';post.style.transform='';post.style.opacity=String(postOpacity);
 post.setAttribute('role','dialog');post.setAttribute('aria-modal','true');post.setAttribute('aria-label','Post details');
 clearRelatedPostUnderlays();
 return {related,post,relatedOpacity,postOpacity};
}
// The former blank page now holds related character / artist / series art.
function leaveBlankPage(){
  if(!document.body.classList.contains("viewing-blank"))return;
  const panel=$("#sheet"),state=RELATED_PAGES.get(panel.dataset.blankPostId);
  if(state)state.scroll=panel.scrollTop;
  document.body.classList.remove("viewing-blank");
  for(const key of ["app","nav"]){const node=document.getElementById(key);if(node)node.inert=document.getElementById("ov").classList.contains("show")}
}
function blankPostPage(id,fromHistory=false){
  const p=pin(id);if(!p)return;
  if(!fromHistory){
    const current=postView();
    if(!current||current.kind!=="post"||String(current.id)!==String(id))pushPostView("post",id);
    pushPostView("blank",id);
    rememberPin(p);save();
  }
  prepareRelatedBackdrop(p);
  const enteringFromPost=$("#sheet").classList.contains('post-sheet');
  if(enteringFromPost)NAV_ENTER=null;
  leaveImageViewer();
  const handoff=enteringFromPost?beginRelatedEntry(p):null;
  if(!handoff)sheet("",true);
  const panel=$("#sheet");panel.classList.add("post-blank-page");panel.dataset.blankPostId=String(id);panel.setAttribute("aria-label","Related art");
  document.body.classList.add("viewing-blank");
  for(const key of ["app","nav"]){const node=document.getElementById(key);if(node)node.inert=true}
  const state=relatedPageState(p);state.metadataPending=!p.detailsReady;
  renderRelatedPage(state);startRelatedGroups(state);
  if(handoff){
    PB_RUNTIME.dialogOpen(panel);
    fadeRelatedOpacity(handoff.outgoing,handoff.postOpacity,0,()=>{if(!handoff.keepPost)handoff.outgoing.remove()});
    relatedEnterMotion(panel,handoff.reveal);
  }else{
    const underlay=relatedPostUnderlay(id)||createRelatedPostUnderlay(p);clearRelatedPostUnderlays([underlay]);
  }
  POST_SWIPE_CLEANUP=initPostSwipe(panel,id,"down");
  fetchPostInfo(p);
  const pending=POST_INFO_PENDING.get(String(id));
  if(pending)pending.finally(()=>{
    if(!RELATED_PAGES.has(String(id)))return;
    const next=relatedPageState(pin(id)||p);next.metadataPending=false;renderRelatedPage(next);startRelatedGroups(next);
  });
  else{state.metadataPending=false;renderRelatedPage(state)}
}
function relatedPins(){return [...RELATED_PAGES.values()].flatMap(state=>state.groups.flatMap(group=>group.items))}
const relatedTag=value=>String(value).replace(/^(character|artist|copyright|series):/,"").replace(/\s+/g,"_").toLowerCase();
function relatedQuery(p,kind,tag){
  const source=PB_SOURCES[p.src];
  const raw=(p.tags||[]).find(t=>relatedTag(t)===relatedTag(tag));
  let value=source&&source.engine==="philomena"?(raw||kind+":"+tag):tag;
  value=String(value).replace(/\s+/g,"_");
  return [value,(S.stags&&S.stags[p.src])||""].filter(Boolean).join(" ");
}
function makeRelatedGroup(p,def,tag,index){
  const live=!!PB_SOURCES[p.src];
  return {...def,kind:def.key,key:def.key+"-"+index,tag,query:relatedQuery(p,def.key,tag),items:[],shown:5,page:1,busy:false,loaded:!tag||!live,done:!tag||!live,error:false,lastBatch:""};
}
function makeRelatedGroups(p){
  return RELATED_KINDS.flatMap(def=>{
    const tags=[...new Set((p[def.field]||[]).filter(t=>typeof t==="string").map(t=>t.trim()).filter(Boolean))];
    return (tags.length?tags:[""]).map((tag,index)=>makeRelatedGroup(p,def,tag,index));
  });
}
function relatedHeading(g){
  const name=g.tag?displayName(g.tag):"";
  return name?(g.kind==="character"?name:g.title+": "+name):g.title;
}
function relatedPageState(p){
  const order=feedOrderFor(p.src);
  const id=String(p.id),signature=JSON.stringify([p.src,...RELATED_KINDS.map(d=>p[d.field]||[]),(S.stags&&S.stags[p.src])||"",order]);
  let state=RELATED_PAGES.get(id);
  if(!state||state.signature!==signature){
    state={id,src:p.src,signature,order,token:++RELATED_TOKEN,scroll:0,metadataPending:!p.detailsReady,groups:makeRelatedGroups(p)};
  }
  RELATED_PAGES.delete(id);RELATED_PAGES.set(id,state);
  while(RELATED_PAGES.size>12)RELATED_PAGES.delete(RELATED_PAGES.keys().next().value);
  return state;
}
// Avoid bursting every source with simultaneous recommendation requests.
function relatedRequest(src,options){
  return new Promise((resolve,reject)=>{
    RELATED_QUEUE.push({src,options,resolve,reject});pumpRelatedQueue();
  });
}
function pumpRelatedQueue(){
  while(RELATED_ACTIVE<2&&RELATED_QUEUE.length){
    const job=RELATED_QUEUE.shift();RELATED_ACTIVE++;
    pbLoadPosts(job.src,job.options).then(job.resolve,job.reject).finally(()=>{RELATED_ACTIVE--;pumpRelatedQueue()});
  }
}
function relatedCardHTML(p){
  const status=thumbnailStatus(p),base='Open related artwork '+(p.sid||p.id);
  return `<button type="button" class="related-card" data-a="relatedopen" data-id="${esc(p.id)}" ${thumbnailStatusAttrs(p,base,status)}><img src="${esc(p.grid||p.sample||p.orig)}" alt="" loading="lazy" decoding="async" draggable="false">${thumbnailStatusHTML(status)}</button>`;
}
function relatedSeeMoreHTML(state,g){
  if(!g.tag||!PB_SOURCES[state.src])return "";
  const heading=relatedHeading(g),attrs=`class="related-more" type="button" data-a="relatedmore" data-id="${esc(state.id)}" data-group="${g.key}"`;
  if(g.busy)return `<button ${attrs} disabled aria-label="Loading artworks for ${esc(heading)}">${SPIN}<span>Loading</span></button>`;
  if(g.error)return `<button ${attrs} aria-label="Retry artworks for ${esc(heading)}"><span>Retry</span></button>`;
  return g.items.length||!g.done?`<button ${attrs} aria-label="See more artworks for ${esc(heading)}"><span>See more</span><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>`:"";
}
function relatedGridHTML(state,g){
  const items=g.items.slice(0,g.shown);let html="";
  if(items.length)html=items.map(relatedCardHTML).join("");
  else if((state.metadataPending&&!g.tag)||(!g.loaded&&g.tag))html=Array.from({length:5},()=>'<div class="related-skeleton" aria-hidden="true"></div>').join("");
  else{
    const text=g.error?"Couldn’t load these artworks. Try again.":!g.tag?`No ${g.kind} tag provided for this post.`:!PB_SOURCES[state.src]?"Related art is available for live posts.":"No matching artworks found.";
    html=`<p class="related-empty" role="status">${text}</p>`;
  }
  return html;
}
function relatedSectionHTML(state,g){
  const heading=relatedHeading(g);
  return `<section class="related-section" data-related-kind="${g.kind}" data-related-key="${g.key}" data-related-tag="${esc(g.tag)}" aria-label="${esc(heading)}"><div class="related-section-heading"><h2>${esc(heading)}</h2>${relatedSeeMoreHTML(state,g)}</div><div class="related-grid" role="group" tabindex="0" aria-label="Related artwork for ${esc(heading)}" aria-busy="${g.busy}">${relatedGridHTML(state,g)}</div></section>`;
}
function relatedIsCurrent(state){
  const panel=$("#sheet"),view=postView();
  return RELATED_PAGES.get(state.id)===state&&panel.dataset.blankPostId===state.id&&view&&view.kind==="blank"&&String(view.id)===state.id;
}
/* Related art follows the same per-source order as the feeds: Newest adds no
   sort token, Popular asks the source for its own score ranking. */
function relatedHeaderHTML(state){
  return `<header class="related-header"><button data-a="postback" data-id="${esc(state.id)}" aria-label="Back to post">${I.back()}</button><h1>Related art</h1></header>`;
}

function relatedSort(id){
  const state=RELATED_PAGES.get(String(id));
  if(!state||!PB_SOURCES[state.src]||!pbPostPopularitySupported(state.src))return;
  state.order=state.order==="popularity"?"newest":"popularity";
  // The same per-source choice drives Home, Explore, related art and tag feeds.
  S.forder=S.forder||{};S.forder[state.src]=state.order;save();
  state.token=++RELATED_TOKEN;
  state.groups.forEach(g=>{g.items=[];g.page=1;g.done=!g.tag;g.loaded=!g.tag;g.busy=false;g.error=false;g.lastBatch="";g.shown=5;g.restoreFocus=false});
  const panel=$("#sheet");if(panel.dataset.blankPostId===state.id)panel.scrollTop=state.scroll=0;
  renderRelatedPage(state);startRelatedGroups(state);
  toast(state.order==="popularity"?"Related art sorted by popularity":"Related art newest first");
}
function renderRelatedPage(state){
  if(!relatedIsCurrent(state))return;
  const panel=$("#sheet");
  if(panel.dataset.relatedState!==String(state.token)){
    panel.innerHTML=`<div class="related-page">${relatedHeaderHTML(state)}<div class="related-sections">${state.groups.map(g=>relatedSectionHTML(state,g)).join("")}</div></div>`;
    panel.dataset.relatedState=String(state.token);panel.scrollTop=state.scroll;
  }else state.groups.forEach(g=>renderRelatedGroup(state,g));
}
function renderRelatedGroup(state,g){
  if(!relatedIsCurrent(state)||!state.groups.includes(g))return;
  const section=$("#sheet").querySelector(`[data-related-key="${g.key}"]`);if(!section)return;
  const grid=section.querySelector(".related-grid"),items=g.items.slice(0,g.shown),cards=[...grid.querySelectorAll(".related-card")],heading=section.querySelector(".related-section-heading");
  const oldAction=heading.querySelector(".related-more");
  if(oldAction&&document.activeElement===oldAction)g.restoreFocus=true;
  if(oldAction)oldAction.remove();
  heading.insertAdjacentHTML("beforeend",relatedSeeMoreHTML(state,g));
  if(items.length&&cards.length<=items.length&&cards.every((card,i)=>card.dataset.id===String(items[i].id))){
    if(!cards.length)grid.replaceChildren();
    grid.insertAdjacentHTML("beforeend",items.slice(cards.length).map(relatedCardHTML).join(""));
  }else{
    // Do not restart skeleton animations (or repaint cards) when the swipe
    // preview is promoted to the real page with exactly the same contents.
    const markup=relatedGridHTML(state,g);if(grid.innerHTML!==markup)grid.innerHTML=markup;
  }
  grid.setAttribute("aria-busy",String(g.busy));
  if(g.restoreFocus&&!g.busy){
    const action=section.querySelector(".related-more:not(:disabled)");
    if(action&&(document.activeElement===document.body||document.activeElement===$("#sheet")))action.focus({preventScroll:true});
    g.restoreFocus=false;
  }
}
function startRelatedGroups(state){
  state.groups.forEach(g=>{if(g.tag&&!g.loaded&&!g.busy)loadRelatedGroup(state,g)});
}
async function loadRelatedGroup(state,g){
  if(g.busy||!g.tag||!state.src||!PB_SOURCES[state.src])return;
  const token=state.token,order=state.order==="popularity"&&pbPostPopularitySupported(state.src)?"popularity":"newest";
  g.busy=true;g.error=false;renderRelatedGroup(state,g);
  try{
    for(let attempt=0;g.items.length<g.shown&&!g.done&&attempt<4;attempt++){
      const posts=await relatedRequest(state.src,{tags:g.query,page:g.page,limit:24,order});
      if(RELATED_PAGES.get(state.id)!==state||state.token!==token||!state.groups.includes(g))return;
      const batch=posts.batchKey||posts.map(p=>String(p.sid)).join(",");
      if((typeof posts.hasMore==="boolean"?!posts.hasMore:posts.length<24)||(batch&&batch===g.lastBatch))g.done=true;
      g.lastBatch=batch;g.page++;
      const seen=new Set(g.items.map(p=>String(p.id))),match=relatedTag(g.tag);
      for(const raw of posts){
        const p=normPin(raw,state.src);
        const matches=[...(p.tags||[]),...(p[g.field]||[])].some(tag=>relatedTag(tag)===match);
        if(!hasId(S.hidden,p.id)&&!seen.has(String(p.id))&&matches){seen.add(String(p.id));g.items.push(p)}
      }
    }
  }catch(e){g.error=true}
  finally{g.busy=false;g.loaded=true;renderRelatedGroup(state,g)}
}
function moreRelated(id,key){
  const state=RELATED_PAGES.get(String(id)),g=state&&state.groups.find(g=>g.key===key);if(!g||g.busy||!g.tag)return;
  if(g.error){loadRelatedGroup(state,g);return}
  tagFeedPage({src:state.src,kind:g.kind,tag:g.tag,query:g.query,parentId:state.id,order:state.order});
}
// Full tag feeds use the Likes page's masonry, cards, count row, sort chip,
// loading control and post actions, rather than expanding the preview grid.
function tagFeedPins(){return [...TAG_FEEDS.values()].flatMap(f=>f.pins)}
function tagFeedKey(f){return JSON.stringify([f.src,f.kind,f.tag,f.query])}
/* Tag feeds are opened from related art and from any tag in a post's info, so
   general tags need a descriptor alongside character / artist / series. */
const TAG_FEED_KINDS=[...RELATED_KINDS,{key:"general",field:"tags",title:"Tag"}];
const TAG_FEED_ORDER_LABEL={newest:"Newest",popularity:"Popular",oldest:"Oldest"};
// The tag feed offers exactly two orders on one control: Newest (default) and,
// where the source has a real score ranking, Popular.
function tagFeedOrders(src){
  return ["newest",...(pbPostPopularitySupported(src)?["popularity"]:[])];
}
function tagFeedState(options){
  const def=TAG_FEED_KINDS.find(d=>d.key===options.kind);
  if(!def||!PB_SOURCES[options.src]||typeof options.tag!=="string"||!options.tag.trim())return null;
  const descriptor={src:options.src,kind:def.key,field:def.field,title:def.title,tag:options.tag,query:typeof options.query==="string"?options.query:options.tag,parentId:String(options.parentId||"")};
  const key=tagFeedKey(descriptor);let f=TAG_FEEDS.get(key);
  if(!f){const orders=[...tagFeedOrders(options.src),...pbPostSortSupported(options.src)?["oldest"]:[]],preferred=orders.includes(options.order)?options.order:feedOrderFor(options.src);
    f={...descriptor,key,pins:[],page:0,cursor:null,loaded:false,done:false,busy:false,err:"",order:orders.includes(preferred)?preferred:"newest",total:null,countTried:false,request:0,scroll:0,lastBatch:"",scanned:0,confirmedEnd:false,autoPaused:false}}
  TAG_FEEDS.delete(key);TAG_FEEDS.set(key,f);
  while(TAG_FEEDS.size>12)TAG_FEEDS.delete(TAG_FEEDS.keys().next().value);
  return f;
}
function leaveTagFeed(){
  if(!document.body.classList.contains("viewing-tag-feed"))return;
  const panel=$("#sheet"),f=TAG_FEEDS.get(panel.dataset.tagFeedKey);if(f){f.scroll=panel.scrollTop;if(f.controller)f.controller.abort()}
  if(TAG_FEED_SCROLL_CLEANUP){TAG_FEED_SCROLL_CLEANUP();TAG_FEED_SCROLL_CLEANUP=null}
  if(TAG_FEED_SWIPE_CLEANUP){TAG_FEED_SWIPE_CLEANUP();TAG_FEED_SWIPE_CLEANUP=null}
  document.body.classList.remove("viewing-tag-feed");
  for(const key of ["app","nav"]){const node=document.getElementById(key);if(node)node.inert=document.getElementById("ov").classList.contains("show")}
}
function tagFeedIsCurrent(f){return TAG_FEEDS.get(f.key)===f&&$("#sheet").dataset.tagFeedKey===f.key&&postView()?.kind==="tagfeed"&&postView().id===f.key}
function tagFeedCardHTML(p){return pc(p).replace('data-a="open"','data-a="relatedopen"')}
function tagFeedMarkup(f){
  const heading=relatedHeading(f),source=PB_SOURCES[f.src],popular=f.order==="popularity",sortable=pbPostPopularitySupported(f.src);
  const label=popular?"Popular":"Newest",title=sortable?(popular?"Ranked by the source's own score. Tap for newest uploads.":"Newest uploads first. Tap to rank by the source's own score."):"Popular sorting is not available for this source.";
  const pins=f.pins.filter(p=>!hasId(S.hidden,p.id));
  const total=f.total!==null?f.total:(f.done?pins.length:null);
  const count=total!==null?`${total.toLocaleString()} ${total===1?"post":"posts"}`:pins.length?`${pins.length.toLocaleString()} posts loaded`:"… posts";
  const head=`<header class="stk tag-feed-header"><div class="tag-feed-topbar"><button class="tag-feed-back" data-a="close" aria-label="Back to related art">${I.back()}</button><h1 class="tag-feed-title"><span>${esc(heading)}</span></h1></div></header>
<div class="phead"><div class="likes-head"><div class="exhead"><b aria-live="polite">${count}</b><span>${esc(source.name)} · ${f.title} artworks</span></div><button type="button" class="chip likes-sort tag-feed-sort" data-a="tagfeedsort" data-order="${popular?"popularity":"newest"}" aria-pressed="${popular}" aria-label="${esc(title)}" title="${esc(title)}" ${sortable?"":"disabled"}>${I.sort()}<span>${label}</span></button></div></div>`;
  let content=pins.length?masonry(pins,tagFeedCardHTML):(!f.err?`<div class="empty" role="status">${f.busy?SPIN:f.done?"No matching artworks found.":"No viewable artworks in this batch. Load more to continue."}</div>`:"");
  if(f.err)content+=`<div class="empty tag-feed-error" role="status">${esc(f.err)}<br><button class="btn" style="margin-top:16px" data-a="tagfeedmore">Try again</button></div>`;
  else if(!f.done&&(pins.length||(f.loaded&&!f.busy)))content+=`<div class="loadmore tag-feed-pagination">${f.busy?`<div class="tag-feed-loading" role="status">${SPIN}<span>Loading more…</span></div>`:`<button class="chip tag-feed-load" data-a="tagfeedmore" aria-label="Load more artworks">Load more</button>`}</div>`;
  else if(f.done&&pins.length)content+='<div class="tag-feed-end" role="status">End of results</div>';
  return `<div class="tag-feed-page">${head}${content}</div>`;
}
function renderTagFeed(f){
  if(!tagFeedIsCurrent(f))return;
  const panel=$("#sheet"),scroll=panel.scrollTop,action=panel.contains(document.activeElement)?document.activeElement.dataset.a:"";
  panel.innerHTML=tagFeedMarkup(f);panel.scrollTop=scroll;
  if(action){const control=panel.querySelector(`[data-a="${action}"]`);if(control)control.focus({preventScroll:true})}
  if(TAG_FEED_SCROLL_CHECK)TAG_FEED_SCROLL_CHECK();
}
// The modal sheet, not the window, is the scroll container. Replacing an
// idle spinner with a real button also makes the manual fallback unambiguous.
function initTagFeedScroll(panel,f){
  let timer=0,active=true;
  const check=()=>{
    if(!active||!tagFeedIsCurrent(f)||!f.loaded||f.busy||f.done||f.err||f.autoPaused)return;
    const remaining=panel.scrollHeight-panel.scrollTop-panel.clientHeight;
    if(remaining<=Math.max(240,panel.clientHeight*.35))loadTagFeed(f);
  };
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(check,300)};
  TAG_FEED_SCROLL_CHECK=schedule;
  panel.addEventListener("scroll",schedule,{passive:true});window.addEventListener("resize",schedule,{passive:true});
  return ()=>{active=false;clearTimeout(timer);panel.removeEventListener("scroll",schedule);window.removeEventListener("resize",schedule);if(TAG_FEED_SCROLL_CHECK===schedule)TAG_FEED_SCROLL_CHECK=null};
}
function initTagFeedSwipe(panel,feed){
  const listeners=[],points=new Set();let gesture=null,multi=false,blockClick=null,frame=0,timer=0,navigating=false;
  const listen=(type,handler,options)=>{panel.addEventListener(type,handler,options);listeners.push([type,handler,options])};
  const interactive=target=>!!target?.closest?.("button,a,input,textarea,select,video,[contenteditable]:not([contenteditable='false'])");
  const begin=(point,target)=>{
    blockClick=null;
    if(interactive(target)){gesture=null;return}
    gesture={x:point.clientX,y:point.clientY,moved:false};
  };
  const follow=dy=>{
    const pull=Math.max(0,dy*.85);
    panel.style.transition="none";panel.style.transform=pull?`translateY(${pull}px)`:"";
    panel.style.opacity=String(Math.max(.12,1-pull/(innerHeight*.34)));
  };
  const springBack=()=>{
    if(!panel.style.transform){panel.style.opacity="";return}
    panel.style.transition=`transform .26s ${PAGE_EASE},opacity .26s ${PAGE_EASE}`;
    panel.style.transform="";panel.style.opacity="";clearTimeout(timer);timer=setTimeout(()=>{panel.style.transition=""},290);
  };
  const move=(point,event)=>{
    if(!gesture||navigating)return;
    const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
    if(dy>8&&Math.abs(dy)>Math.abs(dx)*1.2){
      if(event.cancelable)event.preventDefault();
      if(Math.hypot(dx,dy)>12)gesture.moved=true;
      follow(dy);
      if(point.pointerId!==undefined&&point.pointerType==="mouse"){try{panel.setPointerCapture(point.pointerId)}catch(e){}}
    }else if(gesture.moved)follow(0);
  };
  const finish=point=>{
    const g=gesture;gesture=null;if(!g)return;
    const dx=point.clientX-g.x,dy=point.clientY-g.y;
    if(g.moved)blockClick={until:performance.now()+400,x:point.clientX,y:point.clientY};
    if(navigating||dy<110||dy<Math.abs(dx)*1.35){springBack();return}
    const current=postView();
    if(panel.dataset.tagFeedKey!==feed.key||!current||current.kind!=="tagfeed"||current.id!==feed.key){springBack();return}
    navigating=true;
    const offset=parseFloat((panel.style.transform.match(/-?[\d.]+(?=px)/)||[0])[0])||0;
    frame=requestAnimationFrame(()=>{
      frame=0;const now=postView();
      if(panel.dataset.tagFeedKey===feed.key&&now&&now.kind==="tagfeed"&&now.id===feed.key){setNavEnter("down",offset);history.back()}
      else{navigating=false;springBack()}
    });
  };
  const cancel=()=>{gesture=null;springBack()};
  listen("dragstart",event=>{if(event.cancelable)event.preventDefault()});
  listen("click",event=>{
    if(!blockClick||performance.now()>blockClick.until||Math.hypot(event.clientX-blockClick.x,event.clientY-blockClick.y)>30)return;
    blockClick=null;event.preventDefault();event.stopImmediatePropagation();
  },true);
  if("PointerEvent" in window){
    listen("pointerdown",event=>{
      if(event.pointerType==="mouse"&&event.button===0){
        points.add(event.pointerId);
        if(points.size!==1){multi=true;gesture=null;springBack();return}
        begin(event,event.target);
      }
    });
    listen("pointermove",event=>{if(points.has(event.pointerId))move(event,event)});
    listen("pointerup",event=>{
      if(!points.has(event.pointerId))return;
      points.delete(event.pointerId);if(!points.size)finish(event);
      try{if(panel.hasPointerCapture(event.pointerId))panel.releasePointerCapture(event.pointerId)}catch(e){}
      if(!points.size)multi=false;
    });
    listen("pointercancel",()=>{points.clear();multi=false;cancel()});
  }
  listen("touchstart",event=>{
    if(event.touches.length!==1){multi=true;gesture=null;springBack();return}
    if(!multi)begin(event.touches[0],event.target);
  },{passive:true});
  listen("touchmove",event=>{if(!multi&&event.touches.length===1)move(event.touches[0],event)},{passive:false});
  listen("touchend",event=>{if(!multi&&!event.touches.length&&event.changedTouches.length)finish(event.changedTouches[0]);if(!event.touches.length)multi=false},{passive:false});
  listen("touchcancel",()=>{multi=false;cancel()},{passive:true});
  return ()=>{
    for(const [type,handler,options] of listeners)panel.removeEventListener(type,handler,options);
    for(const pointerId of points){try{if(panel.hasPointerCapture(pointerId))panel.releasePointerCapture(pointerId)}catch(e){}}
    points.clear();gesture=null;blockClick=null;clearTimeout(timer);if(frame)cancelAnimationFrame(frame);
  };
}
function tagFeedPage(options,fromHistory=false){
  const f=tagFeedState(options);if(!f)return;
  if(!fromHistory){
    // A new Load more visit always begins at the newest end, even if the
    // previous visit to this tag was explicitly switched to Oldest.
    const restored=[...tagFeedOrders(f.src),...pbPostSortSupported(f.src)?["oldest"]:[]];
    f.order=restored.includes(options.order)?options.order:feedOrderFor(f.src);f.total=null;f.countTried=false;
    pushPostView("tagfeed",f.key,{feed:{src:f.src,kind:f.kind,tag:f.tag,query:f.query,parentId:f.parentId,order:f.order}});
  }
  const parent=pin(f.parentId);if(parent)prepareRelatedBackdrop(parent);
  leaveImageViewer();sheet("",true);
  const panel=$("#sheet");panel.classList.add("tag-feed-sheet");panel.dataset.tagFeedKey=f.key;panel.setAttribute("aria-label",relatedHeading(f));
  document.body.classList.add("viewing-tag-feed");
  for(const key of ["app","nav"]){const node=document.getElementById(key);if(node)node.inert=true}
  TAG_FEED_SCROLL_CLEANUP=initTagFeedScroll(panel,f);
  TAG_FEED_SWIPE_CLEANUP=initTagFeedSwipe(panel,f);
  if(!fromHistory)loadTagFeed(f,true);
  else{renderTagFeed(f);panel.scrollTop=f.scroll;if(!f.loaded&&!f.busy)loadTagFeed(f)}
}
async function loadTagFeed(f,reset=false){
  if(!f||!PB_SOURCES[f.src]||(f.busy&&!reset))return;
  if(reset&&f.controller)f.controller.abort();
  if(reset){f.pins=[];f.page=0;f.cursor=null;f.done=false;f.loaded=false;f.err="";f.scroll=0;f.lastBatch="";f.scanned=0;f.confirmedEnd=false;if(tagFeedIsCurrent(f))$("#sheet").scrollTop=0}
  if(f.done&&!reset)return;
  const request=++f.request,order=f.order,controller=new AbortController(),started=performance.now();
  const initialCount=f.pins.length;let timedOut=false;f.controller=controller;f.autoPaused=false;
  f.busy=true;f.err="";renderTagFeed(f);
  if(!f.countTried){
    f.countTried=true;const countRequest=f.countRequest=(f.countRequest||0)+1;
    pbLoadPostCount(f.src,{tags:f.query}).then(total=>{
      if(TAG_FEEDS.get(f.key)!==f||f.countRequest!==countRequest)return;
      f.total=total;
      // A late count can confirm that a provider-capped short page was not
      // the last page. Never reopen a genuinely empty or declared-final one.
      if(!f.confirmedEnd&&f.scanned>0&&total!==null&&f.scanned<total)f.done=false;
      renderTagFeed(f);
    }).catch(()=>{});
  }
  let timer;
  try{
    // Skip a bounded number of all-unavailable/all-filtered batches so a
    // Load more click makes progress without hammering a very large tag.
    for(let attempt=0;attempt<4;attempt++){
      const page=f.page+1,posts=await Promise.race([
        pbLoadPosts(f.src,{tags:f.query,page:f.cursor||page,limit:40,order,signal:controller.signal}),
        new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error("Loading took too long. Tap Retry."))},Math.max(1,TAG_FEED_TIMEOUT-(performance.now()-started)))})
      ]);
      clearTimeout(timer);
      if(TAG_FEEDS.get(f.key)!==f||request!==f.request)return;
      const rawCount=Number.isSafeInteger(posts.rawCount)?posts.rawCount:posts.length;
      const batch=posts.batchKey||posts.map(p=>String(p.sid)).join(",");
      if(batch&&batch===f.lastBatch){f.err="The source repeated the last page. Try again.";break}
      const before=f.pins.length,seen=new Set(f.pins.map(p=>String(p.id))),match=relatedTag(f.tag);
      for(const raw of posts){
        const p=normPin(raw,f.src);
        if(!hasId(S.hidden,p.id)&&!seen.has(String(p.id))&&[...(p.tags||[]),...(p[f.field]||[])].some(tag=>relatedTag(tag)===match)){seen.add(String(p.id));f.pins.push(p)}
      }
      f.page=page;f.scanned+=rawCount;f.lastBatch=batch;f.loaded=true;
      f.confirmedEnd=rawCount===0||posts.endConfirmed===true;
      const hasMore=typeof posts.hasMore==="boolean"?posts.hasMore:rawCount>=40;
      f.done=f.confirmedEnd||(!hasMore&&!(f.total!==null&&f.scanned<f.total));
      if(posts.nextCursor)f.cursor=posts.nextCursor;
      // Popularity pages stay on the source's own page numbers: an ID cursor
      // would cut across the score order and duplicate or skip artworks.
      else if(order!=="popularity"&&["danbooru","e621"].includes(PB_SOURCES[f.src].engine)&&posts.length){
        const ids=posts.map(p=>Number(p.sid)).filter(Number.isSafeInteger);
        if(ids.length)f.cursor=order==="oldest"?"a"+Math.max(...ids):"b"+Math.min(...ids);
      }
      if(f.pins.length>before||f.done)break;
    }
  }catch(e){
    if(TAG_FEEDS.get(f.key)===f&&request===f.request){
      if(controller.signal.aborted&&!timedOut)return;
      f.err=timedOut?"Loading took too long. Tap Retry.":e?.message||"Could not load these artworks.";f.loaded=true;
    }
  }finally{
    clearTimeout(timer);
    if(TAG_FEEDS.get(f.key)===f&&request===f.request){
      if(f.controller===controller)f.controller=null;
      f.autoPaused=!f.done&&f.pins.length===initialCount;
      f.busy=false;renderTagFeed(f);
    }
  }
}
function applyTagFeedOrder(f,order){
  f.order=order;
  // Newest / Popular are remembered per source; Oldest is one-off for this tag.
  if(order!=="oldest"){S.forder=S.forder||{};S.forder[f.src]=order;save()}
  const current=postView();if(current?.kind==="tagfeed")history.replaceState({...history.state,[POST_VIEW_KEY]:{...current,feed:{...current.feed,order:f.order}}},"");
  toast(order==="popularity"?"Ranked by the source's score":order==="oldest"?"Oldest first":"Newest first");
}
function sortTagFeed(){
  const f=TAG_FEEDS.get($("#sheet").dataset.tagFeedKey);if(!f||!pbPostPopularitySupported(f.src))return;
  applyTagFeedOrder(f,f.order==="popularity"?"newest":"popularity");
  loadTagFeed(f,true);
}
function stopPostSwipe(preserveNext=false){
  if(!POST_SWIPE_CLEANUP)return null;
  const cleanup=POST_SWIPE_CLEANUP;POST_SWIPE_CLEANUP=null;
  return cleanup(preserveNext)||null;
}
// Details swipe up to the blank page; blank swipes down through history.
// Ordinary taps, controls, wrong-direction drags and multitouch stay untouched.
function initPostSwipe(panel,id,direction="up"){
  const returning=direction==="down",kind=returning?"blank":"post",pageClass=returning?"post-blank-page":"post-sheet";
  const listeners=[],points=new Set();let gesture=null,multi=false,blockClick=null,frame=0,navigating=false;
  const listen=(type,handler,options)=>{document.getElementById("ov").addEventListener(type,handler,options);listeners.push([type,handler,options])};
  const interactive=target=>{
    const control=target.closest&&target.closest('button,a,input,textarea,select,video,[contenteditable="true"]');
    // A video tap and horizontal scrub stay native; a deliberate vertical
    // drag on the picture may still slide up to Related art.
    if(control?.tagName==="VIDEO"&&!returning)return false;
    // Inline tags are text first: a vertical drag still opens/closes pages,
    // while a plain tap opens the tag. Related cards remain swipeable on return.
    if(control&&control.classList.contains("post-tag-inline"))return false;
    return control&&!(returning&&control.classList.contains("related-card"));
  };
  let timer=0;
  let next=null,shrink=null;
  const ov=$("#ov"),EASE=PAGE_EASE;
  // Swipe up crossfades the related page over the stationary post; it never
  // translates the post sheet vertically. Downward close behavior is unchanged.
  const makeNext=()=>{
    const p=pin(id);if(!p||next)return;
    const state=relatedPageState(p);prepareRelatedBackdrop(p);
    next=document.createElement("div");next.className="sheet full post-blank-page sheet-next";next.setAttribute("aria-hidden","true");next.inert=true;
    next.dataset.blankPostId=String(id);next.dataset.relatedState=String(state.token);
    next.innerHTML=`<div class="related-page">${relatedHeaderHTML(state)}<div class="related-sections">${state.groups.map(g=>relatedSectionHTML(state,g)).join("")}</div></div>`;
    next.style.transform="none";next.style.clipPath="none";next.style.opacity="0";ov.appendChild(next);next.scrollTop=state.scroll;
  };
  const dropNext=()=>{if(next){next.remove();next=null}};
  const follow=dy=>{
    panel.style.transition="none";
    if(next){
      const progress=REDUCED_MOTION()?0:Math.min(1,Math.max(0,-dy/160));
      panel.style.transform="";panel.style.opacity=String(1-progress*.62);
      next.style.transition="none";next.style.transform="none";next.style.clipPath="none";next.style.opacity=String(progress);
      return;
    }
    if(returning){
      const progress=REDUCED_MOTION()?0:Math.min(1,Math.max(0,dy/160)),underlay=relatedPostUnderlay(id);
      panel.style.transform="";panel.style.opacity=String(1-progress);
      if(underlay){underlay.style.transition="none";underlay.style.opacity=String(progress)}
      return;
    }
    panel.style.transform=dy?`translateY(${dy}px)`:"";
  };
  const springBack=()=>{
    if(next){const n=next;next=null;n.style.transition=`opacity .18s ${EASE}`;n.style.opacity="0";setTimeout(()=>n.remove(),220)}
    const underlay=returning?relatedPostUnderlay(id):null;
    if(underlay){underlay.style.transition=`opacity .26s ${EASE}`;underlay.style.opacity="0"}
    if(!panel.style.transform&&!panel.style.opacity){panel.style.transition="";return}
    panel.style.transition=`transform .26s ${EASE},opacity .26s ${EASE}`;panel.style.transform="";panel.style.opacity="";clearTimeout(timer);timer=setTimeout(()=>{panel.style.transition="";if(underlay)underlay.style.transition=""},280);
  };
  // The post fades into the still-visible feed thumbnail as it slides down.
  const startShrink=()=>{shrink={fallback:true}};
  const start=(point,target)=>{clearTimeout(timer);PB_RUNTIME.settle(panel);finishRelatedLayers();ov.querySelectorAll('.sheet-next').forEach(node=>{if(node!==next)node.remove()});if(!panel.contains(target))target=document.elementFromPoint(point.clientX,point.clientY)||panel;gesture=interactive(target)?null:{id:point.pointerId,x:point.clientX,y:point.clientY,moved:false}};
  const move=(point,event)=>{
    if(!gesture)return;
    const dx=point.clientX-gesture.x,dy=point.clientY-gesture.y;
    const pagePull=true;
    if(pagePull&&event.type==="touchmove"&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)*1.2&&event.cancelable)event.preventDefault();
    if(!navigating&&pagePull&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*1.2){
      // the page follows the finger; resistance keeps it from feeling loose
      if(returning)follow(dy>0?dy*.85:0);
      else if(dy>0){
        dropNext();if(!shrink){panel.style.transform="";startShrink()}
        follow(dy*.85);panel.style.opacity=String(Math.max(.12,1-dy/(innerHeight*.34)));
      }else{
        if(shrink){shrink=null;follow(0);panel.style.opacity=""}
        makeNext();follow(dy*.85);
      }
    }
    if(Math.hypot(dx,dy)>12){
      gesture.moved=true;
      // Capture after movement, not on down: image taps retain their target.
      if(point.pointerId!==undefined&&point.pointerType!=="touch"){try{panel.setPointerCapture(point.pointerId)}catch(e){}}
    }
  };
  const finish=point=>{
    const g=gesture;gesture=null;if(!g)return;
    const dx=point.clientX-g.x,dyAll=point.clientY-g.y,up=!returning&&dyAll<0;
    const distance=returning||!up?dyAll:-dyAll;   // distance in the direction being committed
    if(g.moved||Math.hypot(dx,distance)>12)blockClick={until:performance.now()+400,x:point.clientX,y:point.clientY};
    const need=up?72:returning?72:110;           // closing a post needs a slightly longer pull
    if(shrink)shrink=null;
    if(navigating||distance<need||distance<Math.abs(dx)*1.35){springBack();return}
    const current=postView();
    if(!panel.classList.contains(pageClass)||!current||current.kind!==kind||String(current.id)!==String(id)){springBack();return}
    // Finish the native touch/click sequence before replacing its target.
    // A downward swipe pops the existing entry instead of creating a new post.
    navigating=true;
    // Preserve the existing post-to-feed close offset; page switches crossfade.
    const offset=parseFloat((panel.style.transform.match(/-?[\d.]+(?=px)/)||[0])[0])||0;
    frame=requestAnimationFrame(()=>{
      frame=0;const now=postView();
      if(panel.classList.contains(pageClass)&&now&&now.kind===kind&&String(now.id)===String(id)){
        if(returning){const reveal=REDUCED_MOTION()?0:Math.min(1,Math.max(0,dyAll*.85/160));setNavEnter("down",0,reveal);backToPost(id)}
        else if(up){const reveal=REDUCED_MOTION()?0:Math.min(1,Math.abs(dyAll*.85)/160);setNavEnter("up",0,reveal);blankPostPage(id)}
        else{SKIP_CLOSE_ANIM=true;ghostOut(panel,1,offset);history.back()}
      }else{navigating=false;springBack()}
    });
  };
  if(returning)listen("dragstart",event=>{if(event.cancelable)event.preventDefault()});
  listen("click",event=>{
    if(!blockClick||performance.now()>blockClick.until||Math.hypot(event.clientX-blockClick.x,event.clientY-blockClick.y)>30)return;
    blockClick=null;event.preventDefault();event.stopImmediatePropagation();
  },true);
  if("PointerEvent" in window){
    listen("pointerdown",event=>{
      if(event.pointerType==="touch"||(event.pointerType==="mouse"&&event.button!==0))return;
      points.add(event.pointerId);
      if(points.size>1){multi=true;gesture=null;return}
      if(!multi)start(event,event.target);
    },{passive:true});
    listen("pointermove",event=>{if(event.pointerType!=="touch"&&gesture&&gesture.id===event.pointerId)move(event,event)},{passive:false});
    listen("pointerup",event=>{
      if(event.pointerType==="touch")return;
      points.delete(event.pointerId);
      if(!multi&&gesture&&gesture.id===event.pointerId)finish(event);
      if(!points.size){multi=false;gesture=null}
    },{passive:false});
    const cancel=event=>{if(event.pointerType==="touch")return;points.delete(event.pointerId);gesture=null;springBack();if(!points.size)multi=false};
    listen("pointercancel",cancel);listen("lostpointercapture",event=>{if(event.target===panel&&points.has(event.pointerId))cancel(event)});
  }
  // Own touch directly so WebKit and PointerEvent browsers share one path.
  // Only intentional single-finger vertical moves prevent native scrolling.
  listen("touchstart",event=>{
    if(event.touches.length!==1){multi=true;gesture=null;shrink=null;springBack();return}
    if(!multi)start(event.touches[0],event.target);
  },{passive:true});
  listen("touchmove",event=>{if(!multi&&event.touches.length===1)move(event.touches[0],event)},{passive:false});
  listen("touchend",event=>{
    if(!multi&&event.touches.length===0&&event.changedTouches.length)finish(event.changedTouches[0]);
    if(!event.touches.length){multi=false;gesture=null}
  },{passive:false});
  listen("touchcancel",()=>{multi=false;gesture=null;shrink=null;springBack()},{passive:true});
  return (preserveNext=false)=>{
    listeners.forEach(([type,handler,options])=>document.getElementById("ov").removeEventListener(type,handler,options));
    for(const pointerId of points){try{if(panel.hasPointerCapture(pointerId))panel.releasePointerCapture(pointerId)}catch(e){}}
    const retained=preserveNext?next:null;if(retained)next=null;
    points.clear();gesture=null;blockClick=null;clearTimeout(timer);dropNext();panel.style.opacity="";if(frame)cancelAnimationFrame(frame);
    if(returning){const underlay=relatedPostUnderlay(id);if(underlay){underlay.style.transition="";underlay.style.opacity="0"}}
    return retained;
  };
}

// GPU-transformed image zoom. Pinch around the fingers' midpoint, then drag
// with one finger; clamp to the actual contained image, not its letterbox.
function initImageZoom(panel,p){
  const target=panel.querySelector(".fullscreen-image")||panel.querySelector(".art");
  if(!target)return ()=>{};
  const points=new Map(),listeners=[];
  const MIN=1,MAX=8;
  let scale=1,x=0,y=0,view={left:0,top:0,width:1,height:1},base={width:1,height:1},gesture=null,frame=0,disposed=false;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const center=()=>{
    const a=[...points.values()];
    return a.length>1?{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.max(1,Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y))}:a[0];
  };
  function constrain(){
    if(scale<1.01){scale=1;x=0;y=0;return}
    const maxX=Math.max(0,(base.width*scale-view.width)/2),maxY=Math.max(0,(base.height*scale-view.height)/2);
    x=clamp(x,-maxX,maxX);y=clamp(y,-maxY,maxY);
  }
  function paint(){
    frame=0;if(disposed)return;
    target.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
    panel.dataset.zoom=scale.toFixed(3);panel.dataset.panX=x.toFixed(2);panel.dataset.panY=y.toFixed(2);
    panel.classList.toggle("is-zoomed",scale>1);
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint)};
  function start(){
    const c=center();gesture=c?{count:points.size,cx:c.x-view.left-view.width/2,cy:c.y-view.top-view.height/2,d:c.d||1,scale,x,y}:null;
  }
  function measure(){
    const rect=panel.getBoundingClientRect();
    view={left:rect.left,top:rect.top,width:Math.max(1,rect.width),height:Math.max(1,rect.height)};
    const svg=target.querySelector&&target.querySelector("svg"),box=svg&&svg.viewBox&&svg.viewBox.baseVal;
    const width=target.naturalWidth||p.width||(box&&box.width)||100,height=target.naturalHeight||p.height||(box&&box.height)||100*(p.r||1.2);
    const fit=Math.min(view.width/width,view.height/height);
    base={width:width*fit,height:height*fit};constrain();start();schedule();
  }
  function move(){
    const c=center();if(!c||!gesture)return;
    if(points.size>1){
      if(gesture.count<2){start();return}
      scale=clamp(gesture.scale*c.d/gesture.d,MIN,MAX);
      const factor=scale/gesture.scale;
      x=c.x-view.left-view.width/2-(gesture.cx-gesture.x)*factor;
      y=c.y-view.top-view.height/2-(gesture.cy-gesture.y)*factor;
    }else if(scale>1){
      x=gesture.x+(c.x-view.left-view.width/2-gesture.cx);
      y=gesture.y+(c.y-view.top-view.height/2-gesture.cy);
    }
    constrain();schedule();
  }
  const listen=(type,handler,options)=>{panel.addEventListener(type,handler,options);listeners.push([type,handler,options])};
  if("PointerEvent" in window){
    listen("pointerdown",event=>{
      if(event.pointerType==="mouse"&&event.button!==0)return;
      points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      try{panel.setPointerCapture(event.pointerId)}catch(e){}
      start();
    });
    listen("pointermove",event=>{
      if(!points.has(event.pointerId))return;
      points.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if((points.size>1||scale>1)&&event.cancelable)event.preventDefault();
      move();
    },{passive:false});
    const up=event=>{if(!points.has(event.pointerId))return;points.delete(event.pointerId);constrain();start();schedule()};
    listen("pointerup",up);listen("pointercancel",up);listen("lostpointercapture",up);
    // Keep native touch gesture state out of this custom pinch/pan viewer.
    listen("touchmove",event=>{if(event.cancelable)event.preventDefault()},{passive:false});
  }else{
    // Older WebKit fallback. Only this fullscreen panel handles these touches.
    const sync=event=>{points.clear();for(const touch of event.touches)points.set(touch.identifier,{x:touch.clientX,y:touch.clientY})};
    listen("touchstart",event=>{sync(event);start()},{passive:true});
    listen("touchmove",event=>{sync(event);if(event.cancelable)event.preventDefault();move()},{passive:false});
    const end=event=>{sync(event);constrain();start();schedule()};
    listen("touchend",end,{passive:true});listen("touchcancel",end,{passive:true});
  }
  // Trackpad pinches arrive as Ctrl+wheel in Chromium. Ordinary scrolling
  // elsewhere in Glint remains native and untouched.
  listen("wheel",event=>{
    if(!event.ctrlKey)return;
    event.preventDefault();const next=clamp(scale*Math.exp(-event.deltaY*.012),MIN,MAX),factor=next/scale;
    const cx=event.clientX-view.left-view.width/2,cy=event.clientY-view.top-view.height/2;
    x=cx-(cx-x)*factor;y=cy-(cy-y)*factor;scale=next;constrain();start();schedule();
  },{passive:false});
  const stopNative=event=>{if(event.cancelable)event.preventDefault()};
  listen("gesturestart",stopNative,{passive:false});listen("gesturechange",stopNative,{passive:false});
  target.addEventListener("load",measure);window.addEventListener("resize",measure);
  const observer=window.ResizeObserver?new ResizeObserver(measure):null;if(observer)observer.observe(panel);
  measure();paint();
  return ()=>{
    disposed=true;if(frame)cancelAnimationFrame(frame);
    listeners.forEach(([type,handler,options])=>panel.removeEventListener(type,handler,options));
    for(const id of points.keys()){try{if(panel.hasPointerCapture&&panel.hasPointerCapture(id))panel.releasePointerCapture(id)}catch(e){}}
    points.clear();if(observer)observer.disconnect();target.removeEventListener("load",measure);window.removeEventListener("resize",measure);
    target.style.transform="";delete panel.dataset.zoom;delete panel.dataset.panX;delete panel.dataset.panY;panel.classList.remove("is-zoomed");
  };
}

const POST_INFO_PENDING=new Map();
/* With thousands of saved posts, asking "is this one bookmarked?" by scanning
   every record made a card cost O(library). One Set answers it in O(1). */
let BM_IDS=null;
const bookmarkIdSet=()=>BM_IDS||(BM_IDS=new Set(S.bookmarks.map(record=>String(record.id))));
function forgetBookmarkIds(id){BM_IDS=null;queueThumbnailStatus(id)}
const bookmarked=id=>bookmarkIdSet().has(String(id));
function rememberPin(p){if(p)S.pinCache[String(p.id)]={...p}}
const displayName=value=>String(value).replace(/_/g," ").replace(/\b[a-z]/g,c=>c.toUpperCase());
// Brand silhouettes: Simple Icons (CC0, https://simpleicons.org).
const POST_SOURCE_ICONS={"pixiv":["M4.94 0A4.953 4.953 0 0 0 0 4.94v14.12A4.953 4.953 0 0 0 4.94 24h14.12A4.953 4.953 0 0 0 24 19.06c-.014 1.355 0-14.12 0-14.12A4.953 4.953 0 0 0 19.06 0Zm1.783 5.465h.904a.37.37 0 0 1 .31.17l.752 1.17a6.172 6.172 0 0 1 10.01 4.834 6.172 6.172 0 0 1-9.394 5.265v2.016a.37.37 0 0 1-.37.367H6.724a.37.37 0 0 1-.37-.367V5.834a.37.37 0 0 1 .37-.37m5.804 2.951a3.222 3.222 0 1 0-.002 6.443 3.222 3.222 0 0 0 .002-6.443"],"x":["M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"],"deviantart":["M19.207 4.794l.23-.43V0H15.07l-.436.44-2.058 3.925-.646.436H4.58v5.993h4.04l.36.436-4.175 7.98-.24.43V24H8.93l.436-.44 2.07-3.925.644-.436h7.35v-5.993h-4.05l-.36-.438 4.186-7.977z"],"artstation":["M0 17.723l2.027 3.505h.001a2.424 2.424 0 0 0 2.164 1.333h13.457l-2.792-4.838H0zm24 .025c0-.484-.143-.935-.388-1.314L15.728 2.728a2.424 2.424 0 0 0-2.142-1.289H9.419L21.598 22.54l1.92-3.325c.378-.637.482-.919.482-1.467zm-11.129-3.462L7.428 4.858l-5.444 9.428h10.887z"],"tumblr":["M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.205 1.936-.419l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.002z"],"instagram":["M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"],"patreon":["M22.957 7.21c-.004-3.064-2.391-5.576-5.191-6.482-3.478-1.125-8.064-.962-11.384.604C2.357 3.231 1.093 7.391 1.046 11.54c-.039 3.411.302 12.396 5.369 12.46 3.765.047 4.326-4.804 6.068-7.141 1.24-1.662 2.836-2.132 4.801-2.618 3.376-.836 5.678-3.501 5.673-7.031Z"]};
function postSourceLinksHTML(p){
  const links=pbPostSourceInfo(p).sourceLinks.slice(0,3);
  if(!links.length)return "";
  return `<div class="post-source-links" aria-label="Original sources">${links.map(link=>{
    const paths=POST_SOURCE_ICONS[link.platform];
    const icon=paths?`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">${paths.map(d=>`<path d="${d}"/>`).join("")}</svg>`:SV('<path d="M14 3h7v7m-1-6L10 14"/><path d="M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/>',22,1.8);
    const label="Open original source on "+link.name;
    return `<a class="post-source-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" data-platform="${link.platform}" aria-label="${esc(label)}" title="${esc(label)}">${icon}</a>`;
  }).join("")}</div>`;
}
function postInfoHTML(p){
  const names=[["Character","character",p.characters],["Series","series",p.series],["Artist","artist",p.artists]].filter(([,,names])=>names&&names.length)
    .map(([label,kind,names])=>`<div class="post-info-row" data-field="${label.toLowerCase()}"><dt>${label}</dt><dd title="${esc(names.map(displayName).join(", "))}">${names.map(n=>postTagButtonHTML(p,kind,n)).join('<span class="post-name-divider"> · </span>')}</dd></div>`).join("");
  return `<div class="glint-post-metadata">${names?`<dl>${names}</dl>`:""}<div class="glint-post-upload" data-file-field="uploaded"><span>Uploaded</span> ${postUploadTimeHTML(p)}</div><button type="button" class="glint-more-tags" data-a="menu" data-id="${esc(p.id)}">More tags ${I.chev()}</button></div>`+postSourceLinksHTML(p);
}
// Tags are entry points: tapping one opens that tag's own feed (with the same
// Newest / Popular / Oldest control) instead of copying text into a search box.
function postTagQuery(p,kind,tag){
  const source=PB_SOURCES[p.src];
  const raw=(p.tags||[]).find(t=>typeof t==="string"&&relatedTag(t)===relatedTag(tag));
  if(raw)return String(raw).replace(/\s+/g,"_");
  const plain=String(tag).replace(/\s+/g,"_");
  const prefix=kind==="series"?"copyright":kind;
  const prefixed=source&&["danbooru","moebooru"].includes(source.engine);
  return prefixed&&prefix?prefix+":"+plain:plain;
}
function postTagButtonHTML(p,kind,tag){
  const name=displayName(tag);
  if(!PB_SOURCES[p.src])return `<span class="post-tag-inline">${esc(name)}</span>`;
  return `<button type="button" class="post-tag-inline" data-a="posttag" data-id="${esc(p.id)}" data-group="${esc(kind)}" data-tag="${esc(tag)}" aria-label="Open the ${esc(name)} feed on ${esc(PB_SOURCES[p.src].name)}" title="${esc(name)}">${esc(name)}</button>`;
}
function openPostTag(id,kind,tag){
  const p=pin(id);
  if(!p||!tag||!PB_SOURCES[p.src]){toast("This tag cannot be opened for this post.");return}
  const query=postTagQuery(p,kind,tag);
  if(!TAG_FEED_KINDS.some(d=>d.key===kind))kind="general";
  // The heading shows the readable tag; the request carries the exact tag the
  // source knows (with its character:/artist:/copyright: namespace when used).
  tagFeedPage({src:p.src,kind,tag:String(tag),query,parentId:p.id,order:feedOrderFor(p.src)});
}
function postActionsHTML(p){
  const id=esc(p.id),saved=bookmarked(p.id),canLike=canLikePost(p),state=canLike?remoteLikeState(p):null,liked=!!(state?.known&&state.liked),name=PB_SOURCES[p.src]?.name||p.src||"source";
  const writing=!!state?.writing,checking=!!state?.checking||!!state?.checkPromise,unknown=!state?.known,waiting=writing||checking;
  const title=writing?(state.desired?"Adding to ":"Removing from ")+name+" favourites":checking?(p.src==="danbooru"?"Favourite on "+name:"Checking "+name+" favourites — tap to favourite"):unknown?"Favourite on "+name+" — tap and Glint will check first":(liked?"Remove from ":"Add to ")+name+" favourites";
  return (canLike?`<button class="post-action source-like${liked?" is-liked":""}${waiting?" is-waiting":""}" data-a="like" data-id="${id}" aria-label="${esc(title)}" aria-pressed="${unknown?"mixed":liked}" aria-busy="${waiting}" title="${esc(title)}" ${writing?"disabled":""}>${I.heart(liked)}</button>`:"")+`
<button class="post-action${saved?" is-bookmarked":""}" data-a="bookmark" data-id="${id}" aria-label="${saved?"Remove bookmark":"Bookmark post"}" aria-pressed="${saved}" title="${saved?"Remove bookmark":"Bookmark"}">${I.bookmark(saved)}</button>
<button class="post-action" data-a="download" data-id="${id}" aria-label="Download image" title="Download">${I.download()}</button>
<button class="post-action" data-a="share" data-id="${id}" aria-label="Share post" title="Share">${I.share()}</button>`;
}
function refreshPostInfo(p){
  const s=$("#sheet");
  if(s.dataset.blankPostId===String(p.id)){
    const state=relatedPageState(p);state.metadataPending=false;renderRelatedPage(state);startRelatedGroups(state);
  }
  if(s.dataset.tagsPostId===String(p.id)){
    const tags=postTagsMarkup(p),content=s.querySelector(".post-tags-content"),count=s.querySelector(".post-tags-count");
    if(content)content.innerHTML=tags.html;
    if(count)count.textContent=tags.count+" tags";
    const file=s.querySelector(".post-file-content");if(file)file.innerHTML=postFileInfoHTML(p);
  }
  if(s.dataset.postId!==String(p.id))return;
  const info=s.querySelector(".post-info"),html=postInfoHTML(p);
  if(info){info.hidden=!html;info.innerHTML=html}
}
// Shared by the live detail panel and the preloaded, inert Related-art
// underlay. Hidden videos are never started before the post is opened.
function postDetailMarkup(p,id,autoplay=true){
  const play=videoPlayback(p),video=play?.src||"",image=iqURL(p,"detail"),html=postInfoHTML(p);
  const media=video?`<video class="post-video" src="${esc(video)}"${play?.fallback?` data-fallback-src="${esc(play.fallback)}"`:""}${videoPoster(p)?` poster="${esc(videoPoster(p))}"`:""} controls${autoplay?" autoplay":""} muted playsinline preload="metadata" loop draggable="false" aria-label="${esc((p.t||"Video")+" — play")}"></video>`
   :image?`<img class="post-image" src="${esc(PB_RUNTIME.mediaURL(image))}" alt="${esc(p.characters&&p.characters.length?p.characters.map(displayName).join(", "):p.t||"Post image")}" ${p.width&&p.height?`width="${Math.max(1,Number(p.width)||1)}" height="${Math.max(1,Number(p.height)||1)}"`:""} decoding="async" fetchpriority="high" draggable="false">`:art(p,"",true).replace(/xMidYMax/g,"xMidYMid");
  const markup=`<article class="post-detail" aria-label="Post details"><div class="post-visual">
<div class="post-topbar"><button data-a="close" aria-label="Back">${I.back()}</button><button data-a="glintinfo" aria-label="Image information and actions">${I.dots()}</button></div>
<div class="post-media${video?" is-video":""}" ${video?`data-id="${esc(id)}" role="group" aria-label="Video"`:`data-a="viewimage" data-id="${esc(id)}" role="button" tabindex="0" aria-label="View full-screen image"`}>${media}</div></div>
<div class="post-bottom"><section class="post-info" aria-label="Post information" ${html?"":"hidden"}>${html}</section>
<section class="post-actions" style="--post-action-count:${canLikePost(p)?4:3}" aria-label="Post actions">${postActionsHTML(p)}<button class="post-action glint-more-action" data-a="menu" data-id="${esc(id)}" aria-label="More image options">${I.dots()}</button></section><div class="post-like-feedback" role="status" aria-live="polite" hidden></div></div></article>`;
  return {markup,video};
}
function detail(id,fromHistory=false){
  const p=pin(id);if(!p){toast("This post is no longer available.");return}
  const returningFromRelated=$("#sheet").classList.contains('post-blank-page');
  if(returningFromRelated)NAV_ENTER=null;
  leaveImageViewer();
  const handoff=returningFromRelated?beginRelatedExit(p):null;
  rememberPin(p);save();
  if(!fromHistory)pushPostView("post",id);
  let panel;
  if(handoff){
    panel=handoff.post;OPEN_FROM=null;
    // Metadata and favourite state may have changed while Related art was open.
    refreshPostInfo(p);
    const actions=panel.querySelector('.post-actions');
    if(actions){actions.style.setProperty('--post-action-count',canLikePost(p)?4:3);actions.innerHTML=postActionsHTML(p)+`<button class="post-action glint-more-action" data-a="menu" data-id="${esc(id)}" aria-label="More image options">${I.dots()}</button>`}
    const video=panel.querySelector('video.post-video');
    if(video){video.autoplay=true;if(video._glintResumeFromRelated)video.play().catch(()=>{});delete video._glintResumeFromRelated}
    PB_RUNTIME.dialogOpen(panel);
    fadeRelatedOpacity(panel,handoff.postOpacity,1);
    fadeRelatedOpacity(handoff.related,handoff.relatedOpacity,0,()=>handoff.related.remove());
  }else{
    clearRelatedPostUnderlays();
    const built=postDetailMarkup(p,id);
    sheet(built.markup,true);
    panel=$("#sheet");panel.classList.add("post-sheet");panel.classList.toggle("glint-video-post",!!built.video);panel.dataset.postId=String(id);panel.setAttribute("aria-label","Post details");
    playOpen(panel,id);
  }
  POST_TIME_TIMER=setInterval(refreshUploadTime,60000);
  POST_SWIPE_CLEANUP=initPostSwipe(panel,id);
  fetchPostInfo(p);
  ensureRemoteLike(p);
}
function fetchPostInfo(p){
  // Cached pins may only have general tags. Upgrade categorized information
  // once, and update either the details or the open tag sheet when it arrives.
  const id=String(p.id);
  if((!p.detailsReady||!p.fileInfoReady||!p.sourceInfoReady||!p.uploadInfoReady)&&p.src&&p.sid&&!POST_INFO_PENDING.has(id)){
    const task=pbLoadPostDetails(p.src,p.sid).then(fresh=>{
      if(fresh){Object.assign(p,normPin(fresh,p.src));p.detailsReady=true;if(S.pinCache[id])rememberPin(p);refreshPostInfo(p);save()}
    }).catch(()=>{}).finally(()=>POST_INFO_PENDING.delete(id));
    POST_INFO_PENDING.set(id,task);
  }
}
function originalMediaURL(p){
  const value=p.orig||p.sample||p.grid||"";
  try{const u=new URL(value,location.href);return u.pathname.endsWith("/api/proxy")&&u.searchParams.get("u")?u.searchParams.get("u"):value}catch(e){return value}
}
function postLink(p){
  const source=PB_SOURCES[p.src],id=encodeURIComponent(p.sid||p.id);
  if(source){
    const base=source.bases[0];
    if(["danbooru","e621","anime-pictures"].includes(source.engine))return base+"posts/"+id;
    if(source.engine==="moebooru")return base+"post/show/"+id;
    if(source.engine==="philomena")return base+"images/"+id;
    if(source.engine==="gelbooru")return base+"index.php?page=post&s=view&id="+id;
    if(source.engine==="eshuushuu")return base+"image/"+id+"/";
  }
  const media=originalMediaURL(p);return /^https?:\/\//.test(media)?media:location.href;
}
async function sharePost(id){
  const p=pin(id);if(!p)return;
  const url=postLink(p),title=p.t||"Glint post";
  if(navigator.share){try{await navigator.share({title,url});return}catch(e){if(e.name==="AbortError")return}}
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url);toast("Post link copied");return}}catch(e){}
  const input=document.createElement("textarea");input.value=url;input.style.cssText="position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(input);input.select();let copied=false;try{copied=document.execCommand("copy")}catch(e){}input.remove();
  if(copied){toast("Post link copied");return}
  sheet(`<h2>Share post</h2><label for="postLink" class="share-link-label">Copy this post link</label><input class="field" id="postLink" readonly value="${esc(url)}"><button class="btn alt" data-a="postback" data-id="${esc(id)}">Back to post</button>`);
  const field=$("#postLink");field.focus();field.select();
}
async function downloadPost(id,button){
  const p=pin(id);if(!p||button.disabled)return;
  button.disabled=true;button.setAttribute("aria-busy","true");
  try{
    const original=p.orig||p.sample||p.grid;let blob;
    if(original){
      const target=new URL(original,location.href),urls=[target.href];
      if(target.origin!==location.origin&&/^https?:$/.test(target.protocol))urls.push(pbProxyUrl(target.href));
      let failure;
      for(const url of urls){
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
        try{
          const response=await fetch(url,{signal:controller.signal,cache:"no-store"});
          if(!response.ok)throw new Error("HTTP "+response.status);
          const type=response.headers.get("content-type")||"";
          if(/(?:text\/html|application\/json|text\/plain)/i.test(type))throw new Error("The source did not return an image.");
          blob=await response.blob();if(!blob.size)throw new Error("The image file is empty.");
          break;
        }catch(e){failure=e}finally{clearTimeout(timeout)}
      }
      if(!blob)throw failure||new Error("Could not download this image.");
    }else{
      const svg=$("#sheet .post-media svg");if(!svg)throw new Error("No image file is available.");
      const copy=svg.cloneNode(true);copy.setAttribute("xmlns","http://www.w3.org/2000/svg");
      blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:"image/svg+xml"});
    }
    const types={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif","image/svg+xml":"svg","video/webm":"webm","video/mp4":"mp4"};
    const path=originalMediaURL(p).split(/[?#]/)[0],match=path.match(/\.([a-z0-9]{2,5})$/i);
    const ext=types[blob.type.split(";")[0]]||(match&&match[1])||"jpg";
    const link=document.createElement("a"),url=URL.createObjectURL(blob);
    link.href=url;link.download=("pinboard-"+(p.src||"image")+"-"+(p.sid||p.id)).replace(/[^a-zA-Z0-9._-]/g,"-")+"."+ext;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast("Download started");
  }catch(e){toast(e&&e.name==="AbortError"?"Download timed out. Try again.":"Could not download this image. Please try again.")}
  finally{button.disabled=false;button.removeAttribute("aria-busy")}
}
function fileSizeLabel(bytes){
  if(!Number.isFinite(Number(bytes))||Number(bytes)<=0)return "Not provided";
  const units=["B","KB","MB","GB"],index=Math.min(3,Math.floor(Math.log(Number(bytes))/Math.log(1000)));
  return Number((Number(bytes)/1000**index).toFixed(index?2:0)).toLocaleString()+" "+units[index];
}
function postRating(p){
  const aliases={safe:"s",general:"g",sensitive:"s",questionable:"q",explicit:"e"};
  let code=String(p.rating||"").toLowerCase();code=aliases[code]||code;
  let label={s:"Safe",g:"General",q:"Questionable",e:"Explicit"}[code];
  const source=PB_SOURCES[p.src];
  // Modern Danbooru S means Sensitive; the older Moebooru/e621 S means Safe.
  if(code==="s"&&source&&source.engine==="danbooru")label="Sensitive";
  if(source&&source.engine==="philomena"){
    const tags=new Set((p.tags||[]).map(t=>String(t).toLowerCase()));
    for(const [tag,rating] of [["explicit","e"],["questionable","q"],["suggestive","s"],["safe","s"]]){
      if(tags.has(tag)){code=rating;label=displayName(tag);break}
    }
  }
  return {code:label?code:"unknown",label:label?code.toUpperCase()+" · "+label:"Not provided"};
}
function uploadTimeLabel(value,now=Date.now()){
  const stamp=Number(value);if(!Number.isFinite(stamp)||stamp<=0)return "Not provided";
  const seconds=Math.floor((now-stamp)/1000),elapsed=Math.abs(seconds);
  if(elapsed<60)return "Just now";
  for(const [duration,unit] of [[31536000,"year"],[2592000,"month"],[604800,"week"],[86400,"day"],[3600,"hour"],[60,"minute"]]){
    if(elapsed>=duration){
      const n=Math.floor(elapsed/duration);
      if(seconds<0)return "in "+n+" "+unit+(n===1?"":"s");
      return n===1?(unit==="hour"?"an hour ago":"a "+unit+" ago"):n.toLocaleString()+" "+unit+"s ago";
    }
  }
}
function postUploadTimeHTML(p){
  const stamp=Number(p.uploadedAt);
  if(!Number.isFinite(stamp)||stamp<=0||!Number.isFinite(new Date(stamp).getTime()))return "Not provided";
  const date=new Date(stamp),exact=date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
  return `<time datetime="${date.toISOString()}" title="${esc(exact)}" data-uploaded-at="${stamp}">${esc(uploadTimeLabel(stamp))}</time>`;
}
function refreshUploadTime(){
  document.querySelectorAll("#sheet [data-file-field=uploaded] time").forEach(time=>{time.textContent=uploadTimeLabel(time.dataset.uploadedAt)});
}
function postFileInfoHTML(p){
  const rating=postRating(p),width=Number(p.width),height=Number(p.height);
  const resolution=width>0&&height>0?width.toLocaleString()+" × "+height.toLocaleString()+" px":"Not provided";
  return `<dl class="post-file-grid"><div data-file-field="size"><dt>Size</dt><dd>${esc(fileSizeLabel(p.fileSize))}</dd></div>
<div data-file-field="resolution"><dt>Resolution</dt><dd>${esc(resolution)}</dd></div>
<div data-file-field="type"><dt>File type</dt><dd>${esc(p.fileType||"Not provided")}</dd></div>
<div data-file-field="rating"><dt>Rating</dt><dd><span class="post-rating" data-rating="${esc(rating.code)}">${esc(rating.label)}</span></dd></div>
<div data-file-field="uploaded"><dt>Uploaded</dt><dd>${postUploadTimeHTML(p)}</dd></div></dl>`;
}
function postTagsMarkup(p){
  const clean=list=>[...new Set((Array.isArray(list)?list:[]).map(tag=>typeof tag==="string"?tag:tag&&(tag.name||tag.tag)).filter(Boolean))];
  const groups=[
    {key:"character",label:"Character",tags:clean(p.characters)},
    {key:"artist",label:"Artist",tags:clean(p.artists)},
    {key:"series",label:"Series",tags:clean(p.series)}
  ];
  const special=new Set(groups.flatMap(group=>group.tags));
  const other=clean(p.tags).filter(tag=>!special.has(tag)&&!special.has(tag.replace(/^(artist|character|copyright|series):/,"")));
  groups.push({key:"general",label:"Other tags",tags:other});
  const count=new Set(groups.flatMap(group=>group.tags)).size;
  const html=groups.filter(group=>group.tags.length).map(group=>
    `<section class="post-tag-group" data-category="${group.key}" aria-label="${group.label} tags"><h3>${group.label}<span>${group.tags.length}</span></h3><div class="post-tag-list">${group.tags.map(tag=>{
      const name=displayName(tag);
      return PB_SOURCES[p.src]?`<button type="button" class="post-tag" data-a="posttag" data-id="${esc(p.id)}" data-group="${esc(group.key)}" data-tag="${esc(tag)}" title="${esc(tag)}" aria-label="Open the ${esc(name)} feed on ${esc(PB_SOURCES[p.src].name)}">${esc(name)}</button>`:`<span class="post-tag" title="${esc(tag)}">${esc(name)}</span>`;
    }).join("")}</div></section>`
  ).join("")||'<p class="post-tags-empty">No tags available for this post.</p>';
  return {html,count};
}
function menu(id,fromHistory=false){
  const p=pin(id);if(!p)return;
  if(!fromHistory){
    const current=postView();if(!current||current.kind!=="post"||String(current.id)!==String(id))pushPostView("post",id);
    pushPostView("tags",id);
  }
  leaveImageViewer();
  const tags=postTagsMarkup(p);
  sheet(`<div class="post-tags-heading"><button data-a="postback" data-id="${esc(id)}" aria-label="Back to post">${I.back()}</button><div><h2>Post info</h2><p>${esc(p.srcName||p.c||"Post")} · <span class="post-tags-count">${tags.count} tags</span></p></div></div>
<div class="post-more-sections"><section class="post-more-section post-file-section" data-section="file" aria-label="File information"><h3>File information</h3><div class="post-file-content">${postFileInfoHTML(p)}</div></section>
<section class="post-more-section post-all-tags-section" data-section="tags" aria-label="Tags"><h3>Tags</h3><div class="post-tags-content">${tags.html}</div></section></div>`,false,false);
  const panel=$("#sheet");panel.classList.add("post-tags-sheet");panel.dataset.tagsPostId=String(id);panel.setAttribute("aria-label","Post information and tags");
  POST_TIME_TIMER=setInterval(refreshUploadTime,60000);
  fetchPostInfo(p);
}
function saveSheet(id){toggleBookmark(id)}
let IMPORT_BUSY=false;
async function importBookmarkBackup(file){
  if(IMPORT_BUSY||!file)return;IMPORT_BUSY=true;
  const previous={bookmarks:S.bookmarks,pinCache:S.pinCache,custom:S.custom};
  try{
    if(file.size>8*1024*1024)throw new Error("This backup exceeds the 8 MB import limit.");
    const data=JSON.parse(await file.text());if(data?.format!=="pinboard-bookmarks"||data.version!==1||!Array.isArray(data.bookmarks))throw new Error("Choose a Glint bookmark backup JSON file.");
    const records=migrateBookmarkRecords(data.bookmarks,[],false),existing=new Set(S.bookmarks.map(b=>b.id));
    const cache=Object.fromEntries(Object.entries(data.pinCache&&typeof data.pinCache==="object"?data.pinCache:{}).map(([k,v])=>[k,PB_RUNTIME.pin(v)]).filter(([k,v])=>v&&v.id===k));
    S.bookmarks=migrateBookmarkRecords([...S.bookmarks,...records.filter(b=>!existing.has(b.id))],[],false);forgetBookmarkIds();S.pinCache={...cache,...S.pinCache};
    const custom=(Array.isArray(data.custom)?data.custom:[]).map(PB_RUNTIME.pin).filter(Boolean);const known=new Set(S.custom.map(p=>String(p.id)));S.custom=[...S.custom,...custom.filter(p=>!known.has(String(p.id)))];
    if(!save(true))throw new Error("The imported bookmarks could not be stored. Nothing was imported.");refreshBookmarks();toast("Imported "+records.filter(b=>!existing.has(b.id)).length+" bookmarks. Existing saves and source accounts were kept.");
  }catch(e){Object.assign(S,previous);toast(e instanceof SyntaxError?"This is not valid JSON. Nothing was imported.":e?.message||"Could not import this backup.")}
  finally{IMPORT_BUSY=false}
}
function chooseBookmarkBackup(){const input=document.createElement("input");input.type="file";input.accept="application/json,.json";input.addEventListener("change",()=>importBookmarkBackup(input.files[0]),{once:true});input.click()}
function createSheet(){sheet(`<h2>Start creating now</h2><div class="tiles"><button data-a="newpin">${I.plus(28)}Pin</button><button data-a="collage">${SV('<rect x="3.500" y="3.500" width="7" height="9" rx="2"/><rect x="13.500" y="3.500" width="7" height="5" rx="2"/><rect x="13.500" y="11.500" width="7" height="9" rx="2"/><rect x="3.500" y="15.500" width="7" height="5" rx="2"/>',28,1.800)}Collage</button><button data-a="newboard">${SV('<rect x="3.500" y="3.500" width="17" height="17" rx="3.500"/><path d="M3.500 9.500h17M9.500 9.500v11"/>',28,1.800)}Board</button></div>`)}
function boardForm(b){sheet(`<h2>${b?"Edit board":"Create board"}</h2><input class="field" id="bn" placeholder="Board name" value="${b?esc(b.n):""}"><div class="li"><b>Keep this board secret</b><div class="sw ${b&&b.p?"on":""}" id="bp" data-a="sw"></div></div><div class="li"><b>Group board</b><div class="sw ${b&&b.g?"on":""}" id="bg" data-a="sw"></div></div><button class="btn" data-a="mkboard" data-id="${b?b.id:""}">${b?"Save":"Create"}</button>${b?`<button class="btn alt" data-a="delboard" data-id="${b.id}">Delete board</button>`:""}`)}
const APP_VERSION = "v65";
window.PB_APP_VERSION = APP_VERSION;
function pinForm(){sheet(`<h2>Create local demo pin</h2><p class="source-intro">Creates artwork on this device only; it does not publish to a source website.</p><input class="field" id="pt" placeholder="Add a title"><select class="field" id="pc">${CATS.map(c=>`<option>${c}</option>`).join("")}</select><button class="btn" data-a="mkpin">Create local pin</button>`)}
function sortSheet(){sheet(`<h2>Sort by</h2>${[["custom","Custom"],["recent","Last saved"],["az","A to Z"]].map(([k,t])=>`<div class="li" data-a="setsort" data-v="${k}"><b>${t}</b><span>${S.sort===k?"●":"○"}</span></div>`).join("")}`)}
function sourceFeatureBadges(id){
  const s=PB_SOURCES[id],c=pbSourceSupport(id),badges=[];
  if(s.off)badges.push("Disabled in this app");else badges.push("Browse","Local Bookmarks");
  if(!s.off&&c.appLogin)badges.push(s.auth?.pw?"Hashed-password login":s.auth?.keyOnly?"Optional API key":"API login");
  if(!s.off&&c.writeLikes)badges.push(c.session?"Likes need a website session":"Source Likes");else if(!s.off)badges.push("Read-only source");
  return badges.map(t=>`<span>${esc(t)}</span>`).join("");
}
function sourceSheet(){
  const ids=Object.keys(PB_SOURCES),added=ids.filter(id=>S.srcs.includes(id)),available=ids.filter(id=>!S.srcs.includes(id)&&!PB_SOURCES[id].off),disabled=ids.filter(id=>!S.srcs.includes(id)&&PB_SOURCES[id].off);
  const row=id=>{const s=PB_SOURCES[id],c=pbSourceSupport(id),inRow=S.srcs.includes(id);return `<article class="source-card${s.off?" source-unavailable":""}" data-source="${id}"><button type="button" class="source-card-info" data-a="sourceinfo" data-v="${id}"><b>${esc(s.name)}</b><small>${esc(c.engine)} · ${esc(c.siteLogin)}</small><span class="source-badges">${sourceFeatureBadges(id)}</span></button><div class="source-card-actions">${!s.off&&inRow?`<button type="button" data-a="srcpick" data-v="${id}">Use</button>`:""}<button type="button" data-a="sourceinfo" data-v="${id}">Features &amp; login</button>${s.custom?`<button type="button" class="source-edit" data-a="srcrowedit" data-v="${id}" aria-label="Edit ${esc(s.name)}">Edit</button><button type="button" class="source-delete" data-a="srcdel" data-v="${id}" aria-label="Delete ${esc(s.name)}">Delete</button>`:""}${inRow?`<button type="button" data-a="srcremove" data-v="${id}" aria-label="Remove ${esc(s.name)} from your source row">Remove</button>`:!s.off?`<button type="button" class="source-add" data-a="srcadd" data-v="${id}" aria-label="Add ${esc(s.name)}">Add</button>`:""}</div></article>`};
  const group=(label,list)=>list.length?`<h3 class="source-group-title">${label}</h3>${list.map(row).join("")}`:"";
  sheet(`<div class="source-catalogue"><h2>Image sources</h2><p class="source-intro"><b>Bookmarks</b> stay on this device. <b>Likes</b> change your account on the original source, only where supported and configured.</p>${group("In your source row",added)}${group("Available",available)}${group("Unavailable in this build",disabled)}<button class="btn" data-a="customsrc">Add a custom source</button><button class="btn alt" data-a="srcdemo">${S.mode==="live"?"Use demo artwork":"Use live posts"}</button></div>`);
}
/* ── Add a custom source ────────────────────────────────────────────────
   Name + address + API family, with a Guess button that asks the address
   itself. The choice is never hidden: the picker always shows what will be
   used, and nothing is saved until the source answers a real request. */
const CUSTOM_ENGINE_LABEL={danbooru:"Danbooru API",moebooru:"Moebooru API",e621:"e621 API",gelbooru:"Gelbooru API",philomena:"Philomena API"};
function customSourceSheet(message="",editId=""){
  const edit=editId&&PB_SOURCES[editId]&&PB_SOURCES[editId].custom?PB_SOURCES[editId]:null;
  const engines=(window.pbCustomEngines||["danbooru","moebooru","e621","gelbooru","philomena"])
    .map(id=>`<option value="${id}"${edit&&edit.engine===id?" selected":""}>${esc(CUSTOM_ENGINE_LABEL[id]||id)}</option>`).join("");
  sheet(`<div class="custom-source-form">
<button type="button" class="source-back" data-a="${edit?"settings":"srcsheet"}">${edit?"‹ Settings":"‹ All sources"}</button>
<h2>${edit?"Edit source":"Add a custom source"}</h2>
<p class="source-intro">${edit?"Change this source's name, address or API type. Saved bookmarks keep working because the source keeps its identity.":"Point Glint at a booru it does not ship with. The address must answer its API directly in this browser (CORS); nothing is guessed about its content, and it gets no Explore views, popularity order or Like button that we cannot verify."}</p>
<label for="csName">Name</label><input class="field" id="csName" placeholder="My booru" maxlength="40" value="${edit?esc(edit.name):""}" autocomplete="off" spellcheck="false">
<label for="csBase">Address</label><input class="field" id="csBase" placeholder="https://example.booru.org/" inputmode="url" value="${edit?esc(edit.bases&&edit.bases[0]||""):""}" autocomplete="off" autocapitalize="none" spellcheck="false">
<label for="csEngine">API type</label><select class="field" id="csEngine">${engines}</select>
<p class="source-field-hint">Not sure? Press <b>Guess the API type</b> and the address is asked which API it speaks. You can always correct it.</p>
<div id="cs-result" class="auth-check-result" role="status" aria-live="polite">${esc(message)}</div>
<button type="button" class="btn alt" data-a="csguess">Guess the API type</button>
${edit?`<button type="button" class="btn" data-a="cssave" data-v="${esc(edit.id)}">Save changes</button>`:`<button type="button" class="btn" data-a="csadd">Add source</button>`}
</div>`);
}
const customFormFields=()=>{const f=$("#sheet");return {name:f?.querySelector("#csName")?.value||"",base:f?.querySelector("#csBase")?.value||"",engine:f?.querySelector("#csEngine")?.value||""}};
function customResult(text,kind=""){const box=$("#sheet")?.querySelector("#cs-result");if(!box)return;box.textContent=text;box.dataset.kind=kind}
async function guessCustomEngine(button){
  const f=customFormFields();
  if(!f.base.trim()){customResult("Enter the address first.","error");return}
  if(button){button.disabled=true;button.setAttribute("aria-busy","true")}
  customResult("Asking the address which API it speaks…");
  let engine="",error="";
  try{engine=await pbGuessEngine(f.base)}catch(e){error=pbRedactSecrets(e?.message||"Could not reach that address.")}
  if(button){button.disabled=false;button.removeAttribute("aria-busy")}
  if(engine){
    const select=$("#sheet")?.querySelector("#csEngine");if(select)select.value=engine;
    const nameInput=$("#sheet")?.querySelector("#csName");
    if(nameInput&&!nameInput.value.trim()){try{nameInput.value=new URL(pbNormalizeBase(f.base)).host.replace(/^www\./,"")}catch(e){}}
    customResult("This address answers like a "+CUSTOM_ENGINE_LABEL[engine]+". Check the name, then Add.","ok");
  }else{
    customResult(error||"No booru API answered at that address. Pick the API type yourself, or check the address.","error");
  }
}
async function addCustomSource(button){
  const f=customFormFields();
  if(button){button.disabled=true;button.setAttribute("aria-busy","true")}
  let id="";
  try{
    id=pbAddCustomSource(f);
    customResult("Checking "+PB_SOURCES[id].name+"…");
    await pbLoadPosts(id,{tags:"",page:1,limit:1});
  }catch(e){
    if(id)pbRemoveCustomSource(id);
    if(button){button.disabled=false;button.removeAttribute("aria-busy")}
    customResult(pbRedactSecrets(e?.message||"That source did not answer."),"error");
    return;
  }
  if(button){button.disabled=false;button.removeAttribute("aria-busy")}
  if(!S.srcs.includes(id))S.srcs.push(id);
  save(true);
  sourceSheet();
  toast(PB_SOURCES[id].short+" added");
}
function deleteCustomSource(id){
  const s=PB_SOURCES[id];if(!s||!s.custom)return;
  pbRemoveCustomSource(id);
  cancelExplore();
  S.srcs=S.srcs.filter(x=>x!==id);
  if(S.src===id){S.src=S.srcs[0]||"danbooru";S.lpage[S.src]=S.lpage[S.src]||1;SRES=null;MORE=true;exploreReset(S.src)}
  save(true);sourceSheet();render();toast(s.short+" deleted");
}
/* Settings ▸ Sources rows carry a pencil and a bin. The pencil opens the right
   editor for that source; the bin takes it out of the row, and for a source you
   added yourself it deletes it outright. Both ask first. */
function sourceRowEdit(id){
  const s=PB_SOURCES[id];if(!s||s.off)return;
  if(s.custom)return customSourceSheet("",id);
  return sourceEditSheet(id);
}
function deleteSourceRow(id){
  const s=PB_SOURCES[id];if(!s)return;
  if(s.custom){
    if(!confirm("Delete "+s.name+"? This removes the source, its address and its saved details from this device. Bookmarks you already saved from it stay in your library."))return;
    deleteCustomSource(id);settings();return;
  }
  if(!confirm("Remove "+s.name+" from your sources? You can add it back any time from Manage sources. Nothing is deleted and saved bookmarks are kept."))return;
  removeSourceFromRow(id);
}
function removeSourceFromRow(id){
  const s=PB_SOURCES[id];if(!s)return;
  cancelExplore();
  S.srcs=S.srcs.filter(x=>x!==id);
  const wasActive=S.src===id;
  if(wasActive){S.src=S.srcs[0]||"danbooru";S.lpage[S.src]=S.lpage[S.src]||1;SRES=null;MORE=true}
  save(true);
  if(wasActive){pinTop();cancelLive()}
  render();settings();
  if(wasActive&&S.screen==="search"&&S.q)doSearch(S.q);
  else if(wasActive&&S.screen==="home")queueLive(!S.live[S.src]||!S.live[S.src].length);
  toast(wasActive?s.name+" removed · now showing "+PB_SOURCES[S.src].name:s.name+" removed from your sources");
}
async function saveCustomSourceEdit(id,button){
  const current=PB_SOURCES[id];
  if(!current||!current.custom)return;
  const before={name:current.name,base:current.bases&&current.bases[0]||"",engine:current.engine};
  const f=customFormFields();
  if(button){button.disabled=true;button.setAttribute("aria-busy","true")}
  try{
    pbUpdateCustomSource(id,f);
    customResult("Checking "+PB_SOURCES[id].name+"…");
    await pbLoadPosts(id,{tags:"",page:1,limit:1});
  }catch(e){
    try{pbUpdateCustomSource(id,before)}catch(x){}
    if(button){button.disabled=false;button.removeAttribute("aria-busy")}
    customResult(pbRedactSecrets(e?.message||"That source did not answer."),"error");
    return;
  }
  if(button){button.disabled=false;button.removeAttribute("aria-busy")}
  save(true);render();settings();
  toast(PB_SOURCES[id].name+" updated");
}
function sourceLinksHTML(c){return (c.links||[]).map(link=>`<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(link.label)} ↗</a>`).join("")}
function sourceInfoSheet(id){
  const s=PB_SOURCES[id];if(!s)return;const c=pbSourceSupport(id),active=!s.off;
  const features=[["Browsing",active?"Available":"Disabled / unverified in this build"],["Bookmarks","Local, independent of source Likes"],["Login on the source",c.siteLogin],["Login in this app",active&&c.appLogin?(s.auth?.keyOnly?"Optional key for read requests":"Per-source credentials"):"Not implemented for this preset"],["Read source Likes",active&&c.readLikes?"Available after account setup":"Not implemented here"],["Like / Unlike",active&&c.writeLikes?(c.session?"API details + optional website session required":"Confirmed on the original source via API"):"Not implemented here"],["Tag autocomplete",active&&["danbooru","moebooru","e621"].includes(s.engine)?"Source API suggestions":"Not implemented here"],["Search total",active&&["danbooru","moebooru","gelbooru","philomena"].includes(s.engine)?"Native matching-post count":"May be unavailable; never guessed"],["Popularity sort",active&&pbPostPopularitySupported(id)?"Source-native":"Not implemented here"]];
  sheet(`<div class="source-support"><button type="button" class="source-back" data-a="srcsheet">‹ All sources</button><h2>${esc(s.name)}</h2><div class="source-badges">${sourceFeatureBadges(id)}</div><dl class="source-features">${features.map(([name,value])=>`<div><dt>${name}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>${c.steps.length?`<h3>How to log in</h3><ol>${c.steps.map(t=>`<li>${esc(t)}</li>`).join("")}</ol>`:""}<h3>Limitations</h3><ul>${c.limits.map(t=>`<li>${esc(t)}</li>`).join("")}</ul><p class="source-research"><b>Boorusama reference:</b> ${esc(c.boorusama)}. That does not automatically enable the same feature in this PWA.</p><div class="source-doc-links">${sourceLinksHTML(c)}<a href="https://github.com/khoadng/Boorusama/tree/1716a68401249c78a6325f21308ebc59ca4e462c" target="_blank" rel="noopener noreferrer">Reviewed Boorusama source ↗</a></div>${active?`<button class="btn" data-a="editsrc2" data-v="${id}">${c.appLogin?"Set up account & filters":"Edit source filters"}</button>`:""}<p class="source-security">Credentials are stored in this browser's local storage, not an encrypted vault. Authenticated requests pass through this app's proxy to the chosen source. Use only trusted HTTPS hosting. Never share keys, password hashes or session cookies.</p></div>`);
}
let AUTH_DRAFT_CHECK=null;
const accountSignature=a=>JSON.stringify([a.login||"",a.apiKey||"",a.passHash||"",a.session||""]);
function accountStatusText(id){
  const a=window.pbAuth?.[id]||{},s=PB_SOURCES[id];
  if(a.needsReentry)return "Re-enter password for this source (legacy shared hash)";
  if(id==="sakuga"&&a.passHash&&a.hashVersion!==2)return "Re-enter password for the corrected site salt";
  if(!pbHasAuth(id))return "Not configured / incomplete";
  if(s.auth?.keyOnly)return "API key saved · read-only";
  return (a.verifiedAt?"API check passed":"Details saved · not verified")+(id==="gelbooru"?(a.session?" · session supplied":" · source Like needs a session"):"");
}
function sourceEditSheet(id){
  const s=PB_SOURCES[id];if(!s||s.off)return;const a=window.pbAuth?.[id]||{},c=pbSourceSupport(id),au=s.auth||{},st=S.stags?.[id]||"";AUTH_DRAFT_CHECK=null;
  sheet(`<div id="source-account-form" class="source-account-form" data-source="${id}"><button type="button" class="source-back" data-a="sourceinfo" data-v="${id}">‹ Features &amp; login</button><h2>${esc(s.name)} settings</h2><p class="source-intro">${c.appLogin?esc(c.siteLogin):"This preset is read-only. Website login and source Likes are not implemented here."}</p>${c.appLogin?`${au.u?`<label for="auUser">${esc(au.u)}</label><input class="field" id="auUser" placeholder="${esc(au.u)}" value="${esc(a.login||"")}" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false">`:""}<label for="auKey">${esc(au.k)}</label><input class="field" id="auKey" type="password" placeholder="${a.apiKey||a.passHash?"Leave blank to keep the saved secret":esc(au.k)}" value="" maxlength="4096" autocomplete="off" spellcheck="false"><p class="source-field-hint">${au.pw?"The password is hashed locally with this site's salt. Only the hash is saved/sent; the hash is still a secret.":"Use this source's API key, not its website password."}${au.u?" Changing the username/User ID requires re-entering that account's credentials.":""}</p>${id==="gelbooru"?`<details class="source-advanced"><summary>Advanced: enable source Like / Unlike</summary><p>The API key only enables reads. Favouriting also needs this account's <b>pass_hash website cookie</b>. This is not your API key or a Moebooru password hash. A PWA cannot import it automatically.</p><label for="auSession">Optional website pass_hash</label><input class="field" id="auSession" type="password" placeholder="${a.session?"Leave blank to keep the saved session":"Paste only the cookie value"}" value="" maxlength="2048" autocomplete="off" spellcheck="false"><p>Copy it from Gelbooru's browser developer tools only on a trusted device. Sessions can expire or require a security challenge. The heart remains hidden without it.</p>${a.session?`<button type="button" class="source-text-button" data-a="clearsession" data-v="${id}">Remove saved website session</button>`:""}</details><details class="source-advanced"><summary>Paste API credential line</summary><textarea class="field" id="auBundle" placeholder="api_key=…&amp;user_id=…" autocomplete="off" spellcheck="false"></textarea><button type="button" class="source-text-button" data-a="parseauth" data-v="${id}">Fill User ID and API key</button></details>`:""}<p class="source-account-status">${esc(accountStatusText(id))}</p><div id="auth-check-result" class="auth-check-result" role="status" aria-live="polite"></div><button class="btn alt" data-a="testauth" data-v="${id}">${au.keyOnly?"Check read access":"Check these credentials"}</button>`:""}<label for="auTags">Default Home tags (optional)</label><input class="field" id="auTags" placeholder="Tags for this source" value="${esc(st)}" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn" data-a="saveauth" data-v="${id}">Save source settings</button>${Object.values(a).some(Boolean)?`<button class="btn alt" data-a="clearauth" data-v="${id}">Remove saved account details</button>`:""}<div class="source-doc-links">${sourceLinksHTML(c)}</div><p class="source-security">Bookmarks are local. Likes use this source's account and are not bookmarks. Keys/hashes/session values are stored locally without encryption and handled by this deployment's proxy; use trusted HTTPS hosting only.</p></div>`);
}
async function captureAccountDraft(id,form){
  const s=PB_SOURCES[id],c=pbSourceSupport(id),cur=window.pbAuth?.[id]||{},tags=form.querySelector("#auTags")?.value.trim()||"";
  if(!c.appLogin)return {record:null,tags};
  const login=form.querySelector("#auUser")?.value.trim()||"",key=form.querySelector("#auKey")?.value||"",same=s.auth?.keyOnly||login===cur.login;
  const record={login,apiKey:same?cur.apiKey||"":"",passHash:same?cur.passHash||"":"",session:same?cur.session||"":""};
  if(s.auth?.pw&&key){record.passHash=await pbMoebooruHash(key,s.bases[0]);record.hashVersion=2}
  else if(key.trim())record.apiKey=key.trim();
  const session=form.querySelector("#auSession")?.value.trim();if(session){if(!pbGelSessionOk(session))throw new Error("Paste only the Gelbooru pass_hash cookie value, not a full Cookie header.");record.session=session}
  if(id==="gelbooru"&&login&&!/^\d+$/.test(login))throw new Error("Gelbooru needs the numeric User ID, not a username.");
  if(accountSignature(record)===accountSignature(cur)){if(cur.verifiedAt)record.verifiedAt=cur.verifiedAt;if(cur.hashVersion===2)record.hashVersion=2;if(cur.needsReentry&&!key)record.needsReentry=true}
  if(AUTH_DRAFT_CHECK?.source===id&&AUTH_DRAFT_CHECK.signature===accountSignature(record)&&!s.auth?.keyOnly)record.verifiedAt=AUTH_DRAFT_CHECK.time;
  return {record,tags};
}
async function checkAccountDraft(id,button){
  const form=document.getElementById("source-account-form");if(form?.dataset.source!==id)return;
  const output=form.querySelector("#auth-check-result"),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);button.disabled=true;output.textContent="Checking this source…";
  let draft=null;
  try{draft=await captureAccountDraft(id,form);const who=await pbTestAuth(id,draft.record,{signal:controller.signal});if(document.getElementById("source-account-form")!==form)return;AUTH_DRAFT_CHECK={source:id,signature:accountSignature(draft.record),time:Date.now()};output.textContent=["danbooru","moebooru","e621"].includes(PB_SOURCES[id].engine)?"Verified as "+who+". Save to use these details.":who}
  catch(e){if(document.getElementById("source-account-form")===form)output.textContent=controller.signal.aborted?"The connection check timed out. Nothing was saved.":pbRedactSecrets(e?.message||"Could not verify these credentials.",draft?Object.values(draft.record||{}):[])}
  finally{clearTimeout(timer);button.disabled=false}
}
async function saveAccountDraft(id){
  const form=document.getElementById("source-account-form");if(form?.dataset.source!==id)return;
  const button=form.querySelector('[data-a="saveauth"]');button.disabled=true;
  try{
    const {record,tags}=await captureAccountDraft(id,form);if(document.getElementById("source-account-form")!==form||!document.getElementById("ov").classList.contains("show"))return;
    if(pbSourceSupport(id).appLogin)pbSetAuth(id,record&&Object.values(record).some(Boolean)?record:null);
    S.stags=S.stags||{};const old=S.stags[id]||"";if(tags)S.stags[id]=tags;else delete S.stags[id];
    if(id===S.src&&old!==tags){S.ltags=tags;S.live[id]=[];S.lpage[id]=1;MORE=true}
    if(form.querySelector("#auKey"))form.querySelector("#auKey").value="";
    if(form.querySelector("#auSession"))form.querySelector("#auSession").value="";
    save();close();render();if(id===S.src&&old!==tags&&S.screen==="home")loadLive(true);toast("Saved "+PB_SOURCES[id].name+" source settings");
  }catch(e){const output=form.querySelector("#auth-check-result");if(output)output.textContent=e?.message||"Could not save source settings.";else toast(e?.message||"Could not save source settings.")}
  finally{button.disabled=false}
}
function fillPastedAPICredentials(id){
  const form=document.getElementById("source-account-form");if(id!=="gelbooru"||form?.dataset.source!==id)return;
  const value=form.querySelector("#auBundle")?.value.trim()||"";let params;try{params=value.includes("://")?new URL(value).searchParams:new URLSearchParams(value.replace(/^\?/,""));const user=params.get("user_id"),key=params.get("api_key");if(!/^\d+$/.test(user||"")||!key)throw Error();form.querySelector("#auUser").value=user;form.querySelector("#auKey").value=key;form.querySelector("#auBundle").value="";form.querySelector("#auth-check-result").textContent="Fields filled. Check and save them for Gelbooru only."}catch(e){form.querySelector("#auth-check-result").textContent="Could not find a numeric user_id and api_key in the pasted line."}
}
function accountsSheet(){
  const ids=Object.keys(PB_SOURCES).filter(id=>!PB_SOURCES[id].off&&pbSourceSupport(id).appLogin);
  sheet(`<div class="source-account-list"><h2>Source accounts</h2><p class="source-intro">Each source keeps its own credentials. A saved field is not proof of login. Likes change website favourites; Bookmarks stay local. Older device-only hearts are retained in saved data but are never automatically uploaded.</p>${ids.map(id=>`<button class="source-account-row" type="button" data-a="editsrc2" data-v="${id}"><span><b>${esc(PB_SOURCES[id].name)}</b><small>${esc(accountStatusText(id))}</small></span><span>${pbHasAuth(id)?"Edit":"Set up"}</span></button>`).join("")}<p class="source-security">This browser stores credentials in local storage, not an encrypted vault. Requests go through the app's proxy to the selected source. Use a trusted deployment.</p></div>`);
}

/* The Drive block updates itself: the sheet stays open, the caret and scroll do not move. */
function refreshSettingsStatus(){
  if(!window.PB_DRIVE)return;
  const status=document.querySelector("[data-drive-status]");
  if(status){status.textContent=PB_DRIVE.summary();status.dataset.tone=PB_DRIVE.state.error?"error":PB_DRIVE.state.connected?"ok":""}
  const label=document.querySelector("[data-a=\"drivesync\"] .drive-connect-label");
  if(label)label.textContent=PB_DRIVE.state.connected?"Sync now":"Connect & sync";
  const toggle=document.querySelector("[data-a=\"driveauto\"]");
  if(toggle){toggle.classList.toggle("on",PB_DRIVE.state.auto);toggle.setAttribute("aria-checked",String(PB_DRIVE.state.auto))}
  const off=document.querySelector("[data-a=\"drivedisconnect\"]");
  if(PB_DRIVE.state.connected&&!off){const block=document.querySelector(".drive-block");block?.insertAdjacentHTML("beforeend",'<button type="button" class="chip drive-off" data-a="drivedisconnect">Disconnect</button>')}
  if(!PB_DRIVE.state.connected&&off)off.remove();
}
window.PB_REFRESH_DRIVE=refreshSettingsStatus;
function glintIcon(name){return SV(({feed:'<rect x="4" y="4" width="7" height="9" rx="2"/><rect x="13" y="4" width="7" height="5" rx="2"/><rect x="4" y="15" width="7" height="5" rx="2"/><rect x="13" y="11" width="7" height="9" rx="2"/>',settings:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',cols:'<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M9.5 5v14M14.5 5v14"/>'})[name],21,1.8)}
function glintHeader(view){
const saved=view==="saved",source=BOOKMARK_VIEW.source==="all"?"All":PB_SOURCES[BOOKMARK_VIEW.source]?.name||"All";
const controls=view==="explore"?"":view==="likes"?`<button class="glint-filter-btn" data-a="favsort" aria-label="Sort likes" aria-pressed="${favState(S.src).order==="oldest"}">${I.sort()}<span>${favState(S.src).order==="oldest"?"Old":"New"}</span></button><button data-a="glintlikessearch" aria-label="Search likes" title="Search likes">${I.srch(20)}</button>`:saved?`<button class="glint-filter-btn" data-a="glintsavedsort" aria-label="${BOOKMARK_VIEW.order==="oldest"?"Old":"New"}. Sort bookmarks ${BOOKMARK_VIEW.order==="oldest"?"oldest":"newest"} first" title="Switch newest / oldest">${I.sort()}<span>${BOOKMARK_VIEW.order==="oldest"?"Old":"New"}</span></button><button class="glint-filter-btn glint-source-filter" data-a="glintsavedsources" aria-label="Filter bookmarks by source: ${esc(source)}" aria-haspopup="dialog"><span>${esc(source)}</span>${I.chev()}</button><button data-a="glintfilters" aria-label="Search bookmarks" title="Search bookmarks">${I.srch(20)}</button>`:`<button data-a="nav" data-v="search" aria-label="Search">${I.srch(20)}</button><button data-a="glintpane" data-v="Explore" aria-label="Explore" title="Explore">${glintIcon("cols")}</button>`;
const brand=view==="explore"?"Explore":"Glint",selectedSource=PB_SOURCES[S.src],feedSource=S.mode==="live"?(selectedSource?.short||selectedSource?.name||"Source"):"Demo";
const feedSourceLabel=view==="feed"?`<span class="glint-feed-source" title="${S.mode==="live"?`Source: ${esc(selectedSource?.name||feedSource)}`:"Demo artwork"}" aria-label="Home feed source: ${esc(feedSource)}"><b>${esc(feedSource)}</b></span>`:"";
const syncState=window.PB_DRIVE?.ringState?.()||"off";
const syncDot=`<span class="glint-live" data-drive-ring="${syncState}" role="img" aria-label="Google Drive sync is off" title="Google Drive sync is off"></span>`;
return `<header class="glint-top"><div class="glint-lead"><button class="glint-brand" data-a="glinttop" aria-label="${brand}, scroll to top">${brand}</button>${view==="feed"?`${syncDot}${feedSourceLabel}`:view==="explore"?"":`${syncDot}<span class="glint-label">Saved</span>`}</div><div class="glint-header-actions">${controls}</div></header>`}
function glintSavedSources(){const rows=bookmarkRows(),options=bookmarkSourceOptions(rows);sheet(`<div class="glint-sheet-head"><h2>Bookmark sources</h2><button class="glint-done" data-a="close">Done</button></div><ul class="glint-rows">${[{id:"all",name:"All sources",count:rows.length},...options].map(o=>`<li><button data-a="glintsavedsource" data-v="${esc(o.id)}" aria-pressed="${BOOKMARK_VIEW.source===o.id}"><span>${esc(o.name)}</span><span class="glint-source-count">${o.count} ${BOOKMARK_VIEW.source===o.id?"✓":""}</span></button></li>`).join("")}</ul>`)}

function settings(){
 const seg=(label,values,action,selected)=>`<section class="glint-section"><h3>${label}</h3><div class="glint-seg">${values.map(([v,n])=>`<button data-a="${action}" data-v="${v}" aria-pressed="${String(v)===String(selected)}">${n}</button>`).join("")}</div></section>`;
 sheet(`<div class="glint-sheet-head"><h2>Settings</h2><button class="glint-done" data-a="close">Done</button></div>
 <section class="glint-section"><h3>Sources</h3><p class="glint-note">Choose the source for your image wall. Accounts and custom sources are available below.</p><ul class="glint-rows">${S.srcs.filter(id=>PB_SOURCES[id]&&!PB_SOURCES[id].off).map(id=>`<li class="glint-source-choice"><button class="glint-source-row" data-a="srcpick" data-v="${id}" aria-pressed="${S.src===id&&S.mode==="live"}" aria-label="${esc(PB_SOURCES[id].name)}"><span>${esc(PB_SOURCES[id].name)}</span><span class="glint-source-selected" aria-hidden="true">${S.src===id&&S.mode==="live"?SV('<path d="M5 12l4 4L19 6"/>',19,2):""}</span></button><button type="button" class="glint-source-edit" data-a="srcrowedit" data-v="${id}" aria-label="Edit ${esc(PB_SOURCES[id].name)}" title="Edit source">${I.rowEdit()}</button><button type="button" class="glint-source-delete" data-a="srcrowdel" data-v="${id}" aria-label="Delete ${esc(PB_SOURCES[id].name)}" title="Delete source">${I.rowDelete()}</button></li>`).join("")}<li><button data-a="srcsheet">Manage sources</button><span>↗</span></li></ul></section>
 ${seg("Columns",[[1,"1"],[2,"2"],[3,"3"]],"cols",S.cols)}
 ${seg("Appearance",[["light","Light"],["dark","Dark"]],"glinttheme",S.theme)}
 <section class="glint-section"><h3>Your library</h3><ul class="glint-rows"><li><button data-a="glintlibrary">Bookmarks, likes & explore</button><span>↗</span></li><li><button data-a="accounts">Source accounts</button><span>↗</span></li><li><button data-a="backup">Export bookmarks</button><span>↓</span></li><li><button data-a="importbackup">Import bookmarks</button><span>↑</span></li></ul></section>
 <section class="glint-section"><h3>Sync & more</h3><ul class="glint-rows"><li><button data-a="drivesync">Google Drive sync</button><span class="glint-small">${S.driveOn?"Connected":"Connect"}</span></li><li><button data-a="glintadvanced">Quality, Drive setup & advanced</button><span>↗</span></li></ul></section>`);
 $("#sheet").classList.add("glint-settings");
}
function glintLibrary(){sheet(`<div class="glint-sheet-head"><h2>Your library</h2><button class="glint-done" data-a="close">Done</button></div><p class="glint-note">Saved here. Ready when you are.</p><ul class="glint-rows">${tabsList().map(t=>`<li><button data-a="glintpane" data-v="${t}">${esc(t)}</button><span>↗</span></li>`).join("")}<li><button data-a="glintfilters">Search & filter saved images</button><span>↗</span></li><li><button data-a="nav" data-v="search">Search all images</button><span>↗</span></li></ul>`)}
function advancedSettings(){const sw=(left)=>S.sw===left?"Left swipe = next":"Right swipe = next";sheet(`<h2>Settings</h2>
<div class="li" data-a="srcsheet"><b>Image source</b><span class="li-value">${S.mode==="live"?esc(PB_SOURCES[S.src].name):"Demo artwork"}</span></div>
<div class="li" data-a="accounts"><b>Source accounts</b><span class="li-value">${Object.keys(window.pbAuth||{}).length?Object.keys(window.pbAuth).length+" saved":"none"}</span></div>
<div class="li"><b>Light theme</b><div class="sw ${S.theme==="light"?"on":""}" data-a="theme"></div></div>
<div class="li"><b>Grid columns</b><div class="li-choices"><button class="chip ${S.cols===2?"on":""}" data-a="cols" data-v="2">2</button><button class="chip ${S.cols===3?"on":""}" data-a="cols" data-v="3">3</button></div></div>
<div class="li li-stack"><b>Feed image quality</b><div class="li-choices li-choices-wide"><button class="chip ${iqValue("feed")==="thumb"?"on":""}" data-a="iqfeed" data-v="thumb" aria-pressed="${iqValue("feed")==="thumb"}">Thumbnail · fast</button><button class="chip ${iqValue("feed")==="sharp"?"on":""}" data-a="iqfeed" data-v="sharp" aria-pressed="${iqValue("feed")==="sharp"}">Sharp</button></div><span class="li-hint">${iqValue("feed")==="thumb"?"Small previews: least data, instant scrolling.":"The larger file: sharper tiles, more data."}</span></div>
<div class="li li-stack"><b>Post detail quality</b><div class="li-choices li-choices-wide"><button class="chip ${iqValue("detail")==="sample"?"on":""}" data-a="iqdetail" data-v="sample" aria-pressed="${iqValue("detail")==="sample"}">Sample</button><button class="chip ${iqValue("detail")==="orig"?"on":""}" data-a="iqdetail" data-v="orig" aria-pressed="${iqValue("detail")==="orig"}">Original</button></div><span class="li-hint">${iqValue("detail")==="sample"?"The site's medium file: sharp enough, faster.":"The untouched upload: best detail, slowest."}</span></div>
<div class="li li-stack"><b>Full-screen quality</b><div class="li-choices li-choices-wide"><button class="chip ${iqValue("viewer")==="sample"?"on":""}" data-a="iqviewer" data-v="sample" aria-pressed="${iqValue("viewer")==="sample"}">Sample</button><button class="chip ${iqValue("viewer")==="orig"?"on":""}" data-a="iqviewer" data-v="orig" aria-pressed="${iqValue("viewer")==="orig"}">Original</button></div><span class="li-hint">${iqValue("viewer")==="sample"?"Medium file when you open a picture full screen.":"Full upload when you open a picture full screen."}</span></div>
<div class="li" data-a="install"><b>Install app</b></div>
<div class="li li-stack"><b>Swipe direction</b><div class="li-choices li-choices-wide"><button class="chip ${S.sw==="left"?"on":""}" data-a="swdir" data-v="left" aria-pressed="${S.sw==="left"}">Left → next</button><button class="chip ${S.sw==="right"?"on":""}" data-a="swdir" data-v="right" aria-pressed="${S.sw==="right"}">Right → next</button></div></div>
<div class="li li-stack drive-block"><b>Google Drive sync</b>
<span class="li-hint">Your bookmarks, boards and settings in a hidden file in your own Drive. No server of ours is involved.</span>
<div class="li-choices li-choices-wide"><button type="button" class="chip" data-a="drivesync"><span class="drive-connect-label">${S.driveOn?"Sync now":"Connect & sync"}</span></button><button type="button" class="chip" data-a="drivebackup">Back up</button><button type="button" class="chip" data-a="driverestore">Merge from Drive</button></div>
<div class="li"><b>Auto-sync</b><div class="sw ${S.driveAuto?"on":""}" data-a="driveauto" role="switch" aria-checked="${S.driveAuto}" aria-label="Sync automatically"></div></div>
<div class="li"><b>Also sync source API keys</b><div class="sw ${S.syncKeys?"on":""}" data-a="drivekeys" role="switch" aria-checked="${S.syncKeys}" aria-label="Include source API keys in the Drive file"></div></div>
<span class="li-hint">Sign-in origin to register: <code data-drive-origin>${esc(location.origin)}</code> — Google Cloud Console → Credentials → your OAuth 2.0 Client ID (Web application) → <b>Authorized JavaScript origins</b>. It must match scheme, host and port exactly; changes take a few minutes.</span>
<label class="drive-client"><span>OAuth Client ID</span><input id="driveClientId" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="…apps.googleusercontent.com" value="${esc(S.driveClientId||"")}"><button type="button" class="chip" data-a="driveclient">Save</button></label>
<span class="li-hint" data-drive-status data-tone="">${esc(window.PB_DRIVE?PB_DRIVE.summary():"Drive sync loads with the app.")}</span>
${S.driveOn?'<button type="button" class="chip drive-off" data-a="drivedisconnect">Disconnect</button>':""}</div>
<div class="li" data-a="backup"><b>Export bookmark backup</b></div>
<div class="li" data-a="importbackup"><b>Import bookmarks (merge)</b></div>
<div class="li" data-a="unhide"><b>Restore hidden pins (${S.hidden.length})</b></div>
<div class="li" data-a="purge"><b>Clear cache &amp; reload</b></div>
<div class="li" data-a="reset"><b>Reset local app data…</b></div>
<details class="source-advanced settings-diagnostics"><summary>About &amp; diagnostics</summary><div class="li"><b>App version</b><span class="li-value">${esc(APP_VERSION)}</span></div><div class="li"><b>Viewport</b><span class="li-value">${innerWidth}×${innerHeight} · @${devicePixelRatio}x</span></div><div class="li"><b>Gestures</b><span class="li-value">${GSTATS.n} swipes · ${esc(GSTATS.type)}</span></div></details>
<p class="source-security">Bookmarks and settings stay on this device. Backups contain bookmarks and saved post metadata only — never account credentials.</p>`)}
document.addEventListener("click",e=>{
if(e.target===$("#ov")){if(!$("#sheet").classList.contains("full"))close();return}
const el=e.target.closest("[data-a]");if(!el)return;
const a=el.dataset.a,id=el.dataset.id,v=el.dataset.v;
switch(a){
case"glintlibrarytab":S.bt=v;S.screen="profile";render();break;
case"glintsavedsort":BOOKMARK_VIEW.order=BOOKMARK_VIEW.order==="newest"?"oldest":"newest";render();break;
case"glintsavedsources":glintSavedSources();break;
case"glintsavedsource":BOOKMARK_VIEW.source=v;close();render();break;
case"glintlikessearch":{
GLINT_LIKES_SEARCH.open=!GLINT_LIKES_SEARCH.open;
if(!GLINT_LIKES_SEARCH.open){clearTagField("likesSearch");GLINT_LIKES_SEARCH.queries[S.src]="";queueLikesApiSearch()}
refreshPane("Likes");el.setAttribute("aria-expanded",String(GLINT_LIKES_SEARCH.open));
if(GLINT_LIKES_SEARCH.open){if(likesApiQuery()&&GLINT_LIKES_API.key!==S.src+":"+likesApiQuery())queueLikesApiSearch();document.getElementById("likesSearch")?.focus()}break}

case"glintlikesretry":loadLikesApiSearch(true);break;
case"glintlikesclear":clearTagField("likesSearch");GLINT_LIKES_SEARCH.queries[S.src]="";queueLikesApiSearch();refreshPane("Likes");document.getElementById("likesSearch")?.focus();break;
case"glinttop":scrollTo({top:0,behavior:"smooth"});break;
case"glintcols":S.cols=S.cols===3?1:S.cols+1;save();render();toast(S.cols+" column"+(S.cols===1?"":"s"));break;
case"glinttheme":S.theme=v;document.documentElement.dataset.theme=v;save();settings();break;
case"glintadvanced":advancedSettings();break;
case"glintlibrary":glintLibrary();break;
case"glintfilters":{
const alreadyOpen=S.screen==="profile"&&S.bt==="Bookmarks"&&$("#app").classList.contains("glint-filters-open");
if(alreadyOpen){clearTagField("bookmarkSearch");BOOKMARK_VIEW.query="";$("#app").classList.remove("glint-filters-open");document.getElementById("bookmarkSearch")?.blur();updateBookmarkSearch();el.setAttribute("aria-expanded","false")}
else{close();S.screen="profile";S.bt="Bookmarks";render();$("#app").classList.add("glint-filters-open");document.querySelector('.glint-header-actions [data-a="glintfilters"]')?.setAttribute("aria-expanded","true");$("#bookmarkSearch")?.focus()}break}

case"glintpane":close();S.screen="profile";S.bt=v;render();scrollTo(0,0);break;
case"glintsource":close();document.querySelector(`[data-a="src"][data-v="${v}"]`)?.click();if(S.src!==v||S.mode!=="live"){S.src=v;S.mode="live";S.ltags=S.stags[v]||"";cancelLive();save();render();loadLive(true)}break;
case"glintinfo":$("#sheet").classList.toggle("glint-show-info");break;

case"nav":if(v==="home"&&S.screen==="home"){scrollTo({top:0,behavior:"smooth"});break}if($("#ov").classList.contains("show"))close();if(v!=="home")cancelLive();if(S.screen==="search")rememberFinishedSearch();cancelSearch();cancelSearchCount();if(v==="search")SEARCH_VIEW.order="newest";if(v==="profile"){if(S.bt==="Explore")S.bt="Bookmarks";else if(S.screen!=="profile")S.bt=defaultSavedTab()}   // leaving Explore through Saved opens Bookmarks directly
S.screen=v;S.open=null;S.q="";SRES=null;render();scrollTo(0,0);if(v==="home"&&S.mode==="live"&&!livePins().length)loadLive(true);break;
case"tab":S.tab=v;render();break;
case"addsrc":sourceSheet();break;
case"src":{if(v==="__demo"){S.mode="demo";save();render();toast("Demo artwork");break}
prepSrcSlide(v);S.mode="live";S.src=v;S.ltags=(S.stags&&S.stags[v])||"";S.lpage[v]=S.lpage[v]||1;SRES=null;MORE=LIVE_STATUS[v]?.more??true;if(S.tab!=="All")S.tab="All";save();
pinTop();cancelLive();render();
if(S.screen==="search"){if(S.q)doSearch(S.q);else SRES=null;}
else queueLive(!S.live[v]||!S.live[v].length)
if(S.screen==="profile"&&S.bt==="Explore"){exploreReset(v);exploreEnsure()}
break}
case"more":loadLive(false);break;
case"exscale":{const sec=EX_SEC.find(x=>x.key===v)||pbExploreSections(S.src).find(x=>x.key===v);if(!sec)break;
  exploreLoad(sec,{scale:id||sec.def,reset:true});break}
case"exretry":{const sec=EX_SEC.find(x=>x.key===v)||pbExploreSections(S.src).find(x=>x.key===v);
  if(sec)exploreLoad(sec,{scale:id||sec.def,reset:true});break}
case"exopen":exploreFeedPage(v,id);break;
case"exfeedmore":{const f=EX_FEEDS.get(EX_FEED_KEY);if(f)exFeedLoad(f);break}
case"exfeedretry":{const f=EX_FEEDS.get(EX_FEED_KEY);if(f)exFeedLoad(f,true);break}
case"extag":{cancelSearch();S.screen="search";S.q=v||"";const q=document.getElementById("q");if(q)q.value=S.q;render();if(S.q)doSearch(S.q,true);break}
case"open":if(S.screen==="search")rememberFinishedSearch();OPEN_FROM=captureOpen(id,el);detail(id);break;
case"relatedopen":rememberPin(pin(id));save();detail(id);break;
case"relatedmore":moreRelated(id,el.dataset.group);break;
case"relatedsort":relatedSort(id);break;
case"posttag":openPostTag(id,el.dataset.group,el.dataset.tag);break;
case"tagfeedsort":sortTagFeed();break;
case"tagfeedmore":loadTagFeed(TAG_FEEDS.get($("#sheet").dataset.tagFeedKey));break;
case"menu":menu(id);break;
case"save":saveSheet(id);break;
case"bookmark":toggleBookmark(id);break;
case"bookmarkopen":openBookmark(id,el);break;
case"bookmarksources":toggleBookmarkSources();break;
case"bookmarkclear":clearBookmarkSearch();break;
case"bookmarksourcepick":{BOOKMARK_VIEW.source=v;refreshBookmarks(".bookmark-source-toggle");break}
case"bookmarksort":{BOOKMARK_VIEW.order=BOOKMARK_VIEW.order==="newest"?"oldest":"newest";refreshBookmarks(".bookmark-sort");break}
case"postback":backToPost(id);break;
case"viewimage":if($("#sheet").classList.contains("glint-show-info")){$("#sheet").classList.remove("glint-show-info");break}imageViewer(id);break;
case"download":downloadPost(id,el);break;
case"retryvideo":{const area=el.closest('.post-media,.image-viewer');const vid=area?.querySelector('video');if(vid){area.classList.remove('image-unavailable');area.querySelector('.media-failure')?.remove();const src=vid.currentSrc||vid.src;vid.src="";vid.src=src;vid.load();vid.play?.().catch(()=>{})}break}
case"retryimage":{const area=el.closest('.art,.post-media,.image-viewer'),img=area?.querySelector('img');if(img){area.classList.remove('image-unavailable');if(area.classList.contains('post-media')){area.setAttribute('role','button');area.tabIndex=0;area.dataset.a='viewimage'}area.querySelector('.media-failure')?.remove();img.classList.remove('image-failed');const src=img.src;img.removeAttribute('src');img.src=src}break}
case"like":toggleSourceLike(id);break;
case"likestatus":{const p=pin(id);if(p)ensureRemoteLike(p,true);break}
case"postaccount":sourceEditSheet(v);break;
case"share":sharePost(id);break;
case"hide":S.hidden.push(String(id));close();toast("Pin hidden");render();break;
case"addto":toggleBookmark(id);break;
case"create":createSheet();break;
case"chat":toast("Messaging is not available in this build.");break;
case"me":toast("Your profile");break;
case"collage":toast("Collages are coming soon");break;
case"newboard":boardForm();break;
case"newpin":pinForm();break;
case"sw":el.classList.toggle("on");el.setAttribute("aria-checked",el.classList.contains("on"));break;
case"mkboard":{const n=$("#bn").value.trim();if(!n){toast("Give it a name");break}const p=$("#bp").classList.contains("on")?1:0,g=$("#bg").classList.contains("on")?1:0;
if(el.dataset.id){const b=S.boards.find(x=>x.id===+id);b.n=n;b.p=p;b.g=g}else S.boards.unshift({id:Date.now(),n,p,g,n0:0,pins:[],seed:[],d:Date.now()});close();toast("Board saved");render();break}
case"delboard":S.boards=S.boards.filter(b=>b.id!==+id);S.open=null;close();render();break;
case"editboard":boardForm(S.boards.find(b=>b.id===S.open));break;
case"mkpin":{const t=$("#pt").value.trim();if(!t){toast("Add a title");break}const h=Math.floor(Math.random()*360),nid=1000+Date.now()%1e7;S.custom.unshift({id:nid,t,c:$("#pc").value,h,h2:(h+80)%360,r:[1.2,1.4,1.05,.9][S.custom.length%4],x:40});close();S.screen="home";S.mode="demo";S.tab="All";toast("Local demo pin created");render();break}
case"board":S.open=+id;render();scrollTo(0,0);break;
case"back":S.open=null;render();break;
case"bt":{const tl=tabsList(),ci=tl.indexOf(S.bt),ni=tl.indexOf(v);if(ni<0)break;
if(v==="Explore")exploreEnsure();
if(v==="Likes"){const f=favState(S.src);if(!f.busy&&favoritesNeedRefresh(f))loadFavorites(true)}
slideTo(v);break}
case"lv":S.lv=v;render();break;
case"swdir":S.sw=v;save();settings();toast(v==="left"?"Swipe left for the next section":"Swipe right for the next section");break;
case"pf":S.pf=S.pf===v?"all":v;render();break;
case"sortm":sortSheet();break;
case"setsort":S.sort=v;close();render();break;
case"qs":submitSearch(v);break;
case"recentsearch":submitSearch(v);break;
case"recentremove":removeRecentSearch(v);break;
case"recentclear":clearRecentSearches();break;
case"searchchipremove":removeSearchChip(v);break;
case"searchchipclear":applySearchQuery("");break;
case"searchtag":pickSearchTag(v);break;
case"searchsort":sortSearch();break;
case"searchretry":doSearch(S.q,true);break;
case"searchmore":loadSearchMore();break;
case"settings":settings();break;
case"drivesync":window.PB_DRIVE?.connect().finally(()=>{refreshSettingsStatus()});break;
case"drivebackup":window.PB_DRIVE?.backup().finally(()=>{refreshSettingsStatus()});break;
case"driverestore":window.PB_DRIVE?.restore().finally(()=>{render();refreshSettingsStatus()});break;
case"driveauto":window.PB_DRIVE?.toggleAuto();refreshSettingsStatus();break;
case"drivedisconnect":window.PB_DRIVE?.disconnect();refreshSettingsStatus();break;
case"drivekeys":S.syncKeys=!S.syncKeys;save(true);el.classList.toggle("on",S.syncKeys);el.setAttribute("aria-checked",String(S.syncKeys));PB_DRIVE?.noteChange();break;
case"driveclient":window.PB_DRIVE?.setClientId(document.getElementById("driveClientId")?.value||"");refreshSettingsStatus();break;
case"srcsheet":sourceSheet();break;
case"sourceinfo":sourceInfoSheet(v);break;
case"srcpick":{if(PB_SOURCES[v]&&PB_SOURCES[v].off){toast(PB_SOURCES[v].name+" is unavailable right now");break}
if(!S.srcs.includes(v))S.srcs.push(v);
S.mode="live";S.src=v;S.ltags=(S.stags&&S.stags[v])||"";S.lpage[v]=S.lpage[v]||1;SRES=null;MORE=LIVE_STATUS[v]?.more??true;save();close();
  pinTop();cancelLive();render();
  if(S.screen==="search"){if(S.q)doSearch(S.q);else SRES=null;}
  else queueLive(!S.live[v]||!S.live[v].length)
  break}
case"srcadd":{if(PB_SOURCES[v]&&PB_SOURCES[v].off){toast(PB_SOURCES[v].name+" is unavailable right now");break}
if(!S.srcs.includes(v)){cancelExplore();S.srcs.push(v);save();close();render();toast(PB_SOURCES[v].short+" added to your row")}break}
case"srcremove":{cancelExplore();S.srcs=S.srcs.filter(x=>x!==v);
const wasActive=S.src===v;
if(wasActive){S.src=S.srcs[0]||"danbooru";S.lpage[S.src]=S.lpage[S.src]||1;SRES=null;MORE=true;}
save();close();
if(wasActive){pinTop();cancelLive();render();
  if(S.screen==="search"){doSearch(S.q);break}
  queueLive(!S.live[S.src]||!S.live[S.src].length);}
else render();
toast("Removed from your row");break}
case"srcdemo":cancelSearch();S.mode=S.mode==="live"?"demo":"live";save();close();render();
  if(S.screen==="search"){doSearch(S.q);break}
  if(S.mode==="live"&&!livePins().length)loadLive(true);else toast(S.mode==="live"?"Live posts on":"Demo artwork on");break;
case"accounts":accountsSheet();break;
case"editsrc":sourceEditSheet(S.src);break;
case"customsrc":customSourceSheet();break;
case"csguess":guessCustomEngine(el);break;
case"csadd":addCustomSource(el);break;
case"cssave":saveCustomSourceEdit(v,el);break;
case"srcdel":deleteCustomSource(v);break;
case"srcrowedit":sourceRowEdit(v);break;
case"srcrowdel":deleteSourceRow(v);break;
case"editsrc2":sourceEditSheet(v);break;
case"saveauth":saveAccountDraft(v);break;
case"testauth":checkAccountDraft(v,el);break;
case"parseauth":fillPastedAPICredentials(v);break;
case"clearsession":{const a=window.pbAuth?.[v];try{if(a){pbSetAuth(v,{...a,session:""});sourceEditSheet(v);toast("Website session removed; API read details kept")}}catch(e){toast(e.message)}break}
case"clearauth":{try{window.pbSetAuth(v,null);save();close();toast("Account details removed");render()}catch(e){toast(e.message)}break}
case"favsort":{if(GLINT_LIKES_SEARCH.open&&likesApiQuery())break;const f=favState(S.src);f.order=f.order==="newest"?"oldest":"newest";const header=document.querySelector(".glint-top");if(header)header.outerHTML=glintHeader("likes");loadFavorites(true);break}
case"favmore":if(GLINT_LIKES_SEARCH.open&&likesApiQuery())loadLikesApiSearch(false);else loadFavorites(false);break;
case"favload":invalidateSourceFavorites(S.src);break;
case"favreload":invalidateSourceFavorites(S.src);break;
case"theme":S.theme=S.theme==="light"?"dark":"light";document.documentElement.dataset.theme=S.theme;settings();save();break;
case"cols":S.cols=+v;settings();render();break;
case"iqfeed":S.iq.feed=v==="sharp"?"sharp":"thumb";save();settings();render();toast(S.iq.feed==="sharp"?"Feed: sharp images":"Feed: fast thumbnails");break;
case"iqdetail":S.iq.detail=v==="orig"?"orig":"sample";save();settings();toast(S.iq.detail==="orig"?"Post page: original file":"Post page: sample file");break;
case"iqviewer":S.iq.viewer=v==="sample"?"sample":"orig";save();settings();toast(S.iq.viewer==="sample"?"Full screen: sample file":"Full screen: original file");break;
case"unhide":S.hidden=[];toast("Pins restored");settings();render();break;
case"install":close();if(window.__pinboardInstall)window.__pinboardInstall();else toast("Use your browser menu to install");break;
case"purge":(async()=>{toast("Clearing cache…");try{if(window.caches){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)))}if(navigator.serviceWorker){const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()))}}catch(x){}location.reload(true)})();break;
case"reset":if(confirm("Reset all local bookmarks, saved metadata, filters and display settings? Source account credentials are kept. Export a bookmark backup first.")){try{localStorage.removeItem("pb2")}catch(x){}location.reload()}break;
case"backup":PB_RUNTIME.exportBackup(S);break;
case"importbackup":chooseBookmarkBackup();break;
case"recovery":PB_RUNTIME.exportRecovery();break;
case"repair":if(confirm("Use the repaired state? Download the recovery copy first. This replaces the unreadable pb2 record, not your source credentials.")){PB_RUNTIME.state.blocked=false;if(save())PB_RUNTIME.warning("")}break;
case"close":close();break}});
document.addEventListener("click",e=>{if(!e.target.closest(".bookmarks-source"))closeBookmarkSources()});
document.addEventListener("keydown",e=>{
  const box=e.target.closest&&e.target.closest(".bookmarks-source");if(!box)return;
  const menu=box.querySelector(".bookmark-source-menu"),trigger=box.querySelector(".bookmark-source-toggle");
  if(e.key==="Escape"){e.preventDefault();closeBookmarkSources(true);return}
  if(e.key==="Tab"){closeBookmarkSources();return}
  if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){
    e.preventDefault();if(menu.hidden)toggleBookmarkSources();
    const options=[...menu.querySelectorAll('[role="option"]')],current=options.indexOf(document.activeElement);
    const next=e.key==="Home"?0:e.key==="End"?options.length-1:current<0?(e.key==="ArrowUp"?options.length-1:0):(current+(e.key==="ArrowUp"?-1:1)+options.length)%options.length;
    if(options[next])options[next].focus({preventScroll:true});
  }
});
// ── Swipe carousel for the profile tabs ─────────────────────────────────────
// One gesture machine fed by pointer events (touch, mouse, pen) with a
// touch-event fallback, de-duplicated so a device that fires both only
// produces one gesture. The switch fires on movement, not on release,
// because Android cancels the touch sequence once the browser claims it.
const PGY={};let PGBUSY=false,PGPEND=false,G=null,CAR=null,ANIM=false,RAF=0,swallow=false,GSTATS={n:0,last:"none",type:"none"};
function syncPanes(wrap,active){
  wrap.querySelectorAll(".tabpane[data-tab]").forEach(p=>{
    const keep=p.dataset.tab===active;
    p.hidden=!keep;
    ["position","top","left","width","transition","transform","opacity"].forEach(k=>p.style[k]="");
  });
}
function carStart(next,dir,side){
  side=side||(dir>0?1:-1);   // which screen edge the incoming pane enters from
  const wrap=document.querySelector(".tabwrap");if(!wrap)return false;
  const cur=wrap.querySelector('.tabpane[data-tab="'+S.bt+'"]');
  if(!cur)return false;
  if(tabsList().indexOf(next)<0||next===S.bt)return false;
  let inc=wrap.querySelector('.tabpane[data-tab="'+next+'"]');
  if(!inc){inc=document.createElement("div");inc.className="tabpane";inc.dataset.tab=next;wrap.appendChild(inc);}
  if(!inc.dataset.built){inc.innerHTML=paneHTML(next);inc.dataset.built="1";}
  inc.hidden=false;
  const W=wrap.offsetWidth||1,oldH=cur.offsetHeight,newH=inc.offsetHeight;
  wrap.style.height=Math.max(oldH,newH)+"px";   // stable height: no page reflow mid-swipe
  wrap.classList.add("sliding","dragging");
  const place=(el,left)=>{el.style.position="absolute";el.style.top="0";el.style.left=left+"px";el.style.width="100%";};
  place(cur,0);place(inc,side*W);
  cur.style.transform="translate3d(0,0,0)";inc.style.transform="translate3d(0,0,0)";
  CAR={wrap,cur,inc,dir,side,next,newH,W,oldH,dx:0,from:S.bt};
  markTab(next);
  return true;
}
function paintCar(){
  RAF=0;if(!CAR)return;
  const dx=CAR.dx,t="translate3d("+dx+"px,0,0)";
  CAR.cur.style.transform=t;
  CAR.inc.style.transform=t;
  placeInd(CAR.from,CAR.next,Math.abs(dx)/CAR.W,true);   // underline follows the finger
}
function carMove(dx){
  if(!CAR)return;
  CAR.dx=Math.max(-CAR.W,Math.min(CAR.W,dx));   // never drag past one screen
  if(!RAF)RAF=requestAnimationFrame(paintCar);   // one style write per frame
}
// the moving underline under Likes / Bookmarks / Explore
function placeInd(a,b,p,instant){
  const row=document.querySelector(".prof .tabs");if(!row)return;
  const ind=row.querySelector(".tind"),ba=row.querySelector('button[data-v="'+a+'"]'),bb=row.querySelector('button[data-v="'+b+'"]')||ba;
  if(!ind||!ba)return;
  const M=window.__pgm||{},ga=M[a]||{l:ba.offsetLeft,w:ba.offsetWidth},gb=M[b]||{l:bb.offsetLeft,w:bb.offsetWidth};
  const l=ga.l+(gb.l-ga.l)*p,w=ga.w+(gb.w-ga.w)*p;
  ind.style.transition=instant?"none":"";
  ind.style.width=w+"px";ind.style.transform="translate3d("+l+"px,0,0)";
}
function carEnd(dx,commit,vel){
  if(!CAR)return;
  const {wrap,cur,inc,dir,side,next,newH,W,oldH,from}=CAR;if(RAF){cancelAnimationFrame(RAF);RAF=0}CAR=null;ANIM=true;placeInd(from,commit?next:from,1,false);if(!commit)placeInd(from,from,0,false);dx=Math.max(-W,Math.min(W,dx));
  const v=Math.abs(vel||0);
  // a flick finishes fast, a slow drag eases into place
  let dur=commit?Math.min(340,Math.max(180,Math.round((1-Math.abs(dx)/W)*340-v*90))):Math.min(260,Math.max(150,Math.round(Math.abs(dx)/W*300)));
  wrap.style.transition="none";
  void wrap.offsetWidth;
  // flush styles so the transition starts from the finger position
  cur.style.transition="transform "+dur+"ms cubic-bezier(.22,.9,.3,1)";
  inc.style.transition="transform "+dur+"ms cubic-bezier(.22,.9,.3,1)";
  // both panes travel together as one strip, so they must end at the same offset
  const end=commit?"translate3d("+(-side*W)+"px,0,0)":"translate3d(0,0,0)";
  cur.style.transform=end;inc.style.transform=end;
  setTimeout(()=>{
    syncPanes(wrap,commit?next:S.bt);
    wrap.classList.remove("sliding","dragging");
    wrap.style.height="";wrap.style.transition="";
    if(commit){S.bt=next;save();window.__pgfit?.();
      if(next==="Explore")exploreEnsure();
      if(next==="Likes"){const f=favState(S.src);if(!f.busy&&favoritesNeedRefresh(f))loadFavorites(true)}}
    else markTab(S.bt);
    ANIM=false;
  },dur+30);
}
function markTab(t){
  document.querySelectorAll(".prow .tabs button").forEach(b=>b.classList.toggle("on",b.dataset.v===t));
  if(!CAR)placeInd(t,t,0,false);
}
function swipeable(e){
  return false;   // v26: horizontal swiping is native scroll-snap now (see pagerInit)
  if(S.screen!=="profile"||S.open)return false;
  if(!(e.target.closest&&e.target.closest("#app")))return false;   // ignore the bottom nav
  return true;
}
function gStart(e,src){
  if(G||ANIM)return;
  const p=(e.touches&&e.touches[0])||e;
  if(!p||typeof p.clientX!=="number")return;
  G={x:p.clientX,y:p.clientY,t:Date.now(),src,handled:false,type:(e.pointerType||"touch")};
}
function gMove(e){
  if(!G||G.handled)return;
  const p=(e.touches&&e.touches[0])||e;
  if(!p||typeof p.clientX!=="number")return;
  const dx=p.clientX-G.x,dy=p.clientY-G.y,dist=Math.abs(dx),dt=Math.max(1,Date.now()-G.t);
  if(dist>8&&dist>Math.abs(dy)*1.2&&e.cancelable)e.preventDefault();
  GSTATS.type=G.type;
  if(dist>12)GSTATS.last=(dx>0?"+":"")+Math.round(dx)+"px";
  const now=Date.now();
  if(G.pt&&now>G.pt){const iv=(p.clientX-G.px)/(now-G.pt);G.v=G.v==null?iv:G.v*.6+iv*.4;}
  G.px=p.clientX;G.pt=now;
  G.dx=dx;
  if(CAR){carMove(dx);return;}
  // 46px of travel, or a fast flick of 36px+
  if(dist>10&&dist>Math.abs(dy)*1.4){
    // swiping left advances to the next tab by default (Pinterest-style);
    // swipe left = previous when the setting is flipped
    const forward=(dx<0)===(S.sw!=="right");
    const dir=forward?1:-1;
    const tl=tabsList(),idx=tl.indexOf(S.bt);
    const target=tl[idx+(dir>0?1:-1)];
    if(target===undefined)return;
    if(carStart(target,dir,dx<0?1:-1)){
      G.handled=true;swallow=true;setTimeout(()=>{swallow=false},600);
      carMove(dx);GSTATS.n++;
    }
  }
}
function gEnd(e){
  if(!G)return;
  const p=(e.changedTouches&&e.changedTouches[0])||e;
  const dx=(p&&typeof p.clientX==="number")?p.clientX-G.x:0;
  const vel=(Date.now()-(G.pt||0)<120&&G.v!=null)?G.v:0;
  const W=CAR?CAR.W:1;
  G=null;
  if(CAR)carEnd(dx,Math.abs(dx)>W*.28||Math.abs(vel)>0.5,vel);
}
// pointer events: touch, mouse and pen in one path
document.addEventListener("pointerdown",e=>{
  if(G||!swipeable(e))return;
  if(e.pointerType==="touch")return;   // touch is owned by the touch listeners below
  if(e.pointerType==="mouse"&&e.button!==0)return;
  gStart(e,"pointer");
},{passive:true});
document.addEventListener("pointermove",e=>{if(G&&G.src==="pointer")gMove(e)},{passive:true});
document.addEventListener("pointerup",e=>{if(G&&G.src==="pointer")gEnd(e)},{passive:true});
document.addEventListener("pointercancel",()=>{if(G&&G.src==="pointer"){if(CAR)carEnd(G.dx||0,Math.abs(G.dx||0)>CAR.W*.28);G=null}},{passive:true});
// touch events: fallback for browsers without pointer events
document.addEventListener("touchstart",e=>{
  if(G||!swipeable(e))return;
  gStart(e,"touch");
},{passive:true});
document.addEventListener("touchmove",e=>{if(G&&G.src==="touch")gMove(e)},{passive:true});
document.addEventListener("touchend",e=>{if(G&&G.src==="touch")gEnd(e)},{passive:true});
document.addEventListener("touchcancel",()=>{if(G&&G.src==="touch"){if(CAR)carEnd(G.dx||0,Math.abs(G.dx||0)>CAR.W*.28);G=null}},{passive:true});
// slide from a tap on the tab strip
function slideTo(next){
  const wrap=document.querySelector(".tabwrap"),i=tabsList().indexOf(next);
  if(!wrap||i<0)return;
  if(window.__pgprep)window.__pgprep();
  const order=S.sw==="right"?tabsList().slice().reverse():tabsList();wrap.scrollTo({left:order.indexOf(next)*wrap.clientWidth,behavior:REDUCED_MOTION()?"auto":"smooth"});   // native animated scroll
}
// ── v26: native scroll-snap pager ─────────────────────────────────────────
// The tabs are a horizontal scroll-snap strip, so the browser itself does the
// finger tracking, momentum, rubber-banding and snapping on the compositor
// thread — exactly like swiping between tabs in a native app. JS only keeps
// the underline in sync and notices which tab you settled on.
function pagerInit(){
  const wrap=document.querySelector(".tabwrap");if(!wrap)return;PGBUSY=false;
  const tl=S.sw==="right"?tabsList().slice().reverse():tabsList();
  const alive=()=>wrap.isConnected&&S.screen==="profile";
  wrap.querySelectorAll(".tabpane[data-tab]").forEach(p=>{p.hidden=false;p.style.cssText="";});
  const panes={};wrap.querySelectorAll(".tabpane[data-tab]").forEach(p=>panes[p.dataset.tab]=p);
  tl.forEach(t=>{if(panes[t])wrap.appendChild(panes[t])});   // DOM order must match tab order, or each tab shows its neighbour's content
  prebuildPanes();
  const setCur=t=>{
    const active=panes[t]||wrap.querySelector('.tabpane[data-tab="'+CSS.escape(t)+'"]');if(!active)return;panes[t]=active;
    wrap.querySelectorAll('.tabpane[data-tab]').forEach(p=>{panes[p.dataset.tab]=p;p.classList.toggle("cur",p.dataset.tab===t);p.inert=p.dataset.tab!==t;p.setAttribute("aria-hidden",String(p.dataset.tab!==t))});
    wrap.style.setProperty("--ch",Math.max(active.offsetHeight,parseFloat(wrap.style.minHeight)||0)+"px");
    document.querySelectorAll(".prof .tabs button[data-v]").forEach(b=>{b.setAttribute("aria-selected",b.dataset.v===t);b.tabIndex=b.dataset.v===t?0:-1});
    if(ro){ro.disconnect();ro.observe(panes[t]);}
  };
  // neighbours are clipped to the active pane's height so the page is never taller than the tab you're on
  const ro=window.ResizeObserver?new ResizeObserver(()=>{const c=panes[S.bt];if(c)wrap.style.setProperty("--ch",Math.max(c.offsetHeight,parseFloat(wrap.style.minHeight)||0)+"px")}):null;
  // stretch the swipe area to the bottom edge of the screen, whatever the phone's height
  window.__pgfit=()=>{const w=document.querySelector(".tabwrap");if(!w)return;w.style.minHeight=S.bt==="Explore"?"0px":Math.max(300,innerHeight-(w.getBoundingClientRect().top+scrollY))+"px";const c=w.querySelector(".cur");if(c)w.style.setProperty("--ch",Math.max(c.offsetHeight,parseFloat(w.style.minHeight)||0)+"px");};
  window.__pgfit();
  const btns=[...document.querySelectorAll(".prof .tabs button[data-v]")];
  const row=document.querySelector(".prof .tabs");row?.setAttribute("role","tablist");row?.setAttribute("aria-label","Library sections");
  btns.forEach(b=>{b.id="profile-tab-"+b.dataset.v.toLowerCase();b.setAttribute("role","tab");b.setAttribute("aria-controls","profile-panel-"+b.dataset.v.toLowerCase())});
  Object.keys(panes).forEach(k=>{panes[k].id="profile-panel-"+k.toLowerCase();panes[k].setAttribute("role","tabpanel");panes[k].setAttribute("aria-labelledby","profile-tab-"+k.toLowerCase())});
  window.__pgm=null;
  const measure=()=>{const m={};btns.forEach(b=>m[b.dataset.v]={l:b.offsetLeft,w:b.offsetWidth});window.__pgm=m;};
  measure();const measureTimer=setTimeout(()=>{if(alive())measure()},400);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{if(alive())measure()});
  window.__pgmeasure=measure;
  // each tab remembers its own vertical scroll; neighbours are drawn at THEIR scroll while you drag, so landing never jumps
  const prep=()=>{PGY[S.bt]=scrollY;Object.keys(panes).forEach(k=>{if(k!==S.bt)panes[k].style.setProperty("--dy",(scrollY-(PGY[k]||0))+"px")})};
  window.__pgprep=prep;
  let lastNear=S.bt;
  if(!window.__pgfitBound){window.__pgfitBound=1;addEventListener("resize",()=>window.__pgfit&&window.__pgfit());}
  setCur(S.bt);
  wrap.scrollLeft=tl.indexOf(S.bt)*wrap.clientWidth;
  let t=null,touching=false;
  const settle=()=>{
    if(touching||!alive())return;
    if($("#ov").classList.contains("show")){PGBUSY=false;return}
    PGBUSY=false;
    const W=wrap.clientWidth||1,idx=Math.max(0,Math.min(tl.length-1,Math.round(wrap.scrollLeft/W))),tab=tl[idx];
    if(tab&&tab!==S.bt){
      S.bt=tab;save();setCur(tab);window.__pgfit?.();markTab(tab);
      Object.keys(panes).forEach(k=>panes[k].style.removeProperty("--dy"));
      scrollTo(0,PGY[tab]||0);
      if(tab==="Explore")exploreEnsure();
      if(tab==="Likes"){const f=favState(S.src);if(!f.busy&&favoritesNeedRefresh(f))loadFavorites(true)}
    }
    Object.keys(panes).forEach(k=>panes[k].style.removeProperty("--dy"));
    placeInd(S.bt,S.bt,0,false);
    if(PGPEND){PGPEND=false;render();}
  };
  PAGER_CLEANUP=()=>{clearTimeout(t);clearTimeout(measureTimer);ro?.disconnect();PGBUSY=false;PGPEND=false;if(window.__pgprep===prep)window.__pgprep=null};
  const down=()=>{touching=true;PGBUSY=true;clearTimeout(t);prep();};
  const up=()=>{touching=false;clearTimeout(t);t=setTimeout(settle,140);};
  wrap.addEventListener("touchstart",down,{passive:true});
  wrap.addEventListener("touchend",up,{passive:true});
  wrap.addEventListener("touchcancel",up,{passive:true});
  wrap.addEventListener("scroll",()=>{if($("#ov").classList.contains("show")){clearTimeout(t);PGBUSY=false;return}PGBUSY=true;
    const W=wrap.clientWidth||1,pos=Math.max(0,Math.min(tl.length-1,wrap.scrollLeft/W)),i=Math.min(tl.length-2,Math.floor(pos));
    GSTATS.n=GSTATS.n;
    if(tl.length>1)placeInd(tl[i],tl[i+1],pos-i,true);
    // highlight the label of whichever tab is more than half in view
    const near=tl[Math.round(pos)];if(near&&near!==lastNear){lastNear=near;btns.forEach(b=>b.classList.toggle("on",b.dataset.v===near));}
    clearTimeout(t);if(!touching)t=setTimeout(settle,140);
  },{passive:true});
  if("onscrollend" in window)wrap.addEventListener("scrollend",()=>{if(!touching){clearTimeout(t);settle()}});
}
// stop the swipe from opening whatever was under the finger
document.addEventListener("click",e=>{if(swallow){swallow=false;e.stopPropagation();e.preventDefault();}},true);
let SCROLLT=null,SCROLL_FRAME=null;
/* One rAF per frame at most, so a fast flick cannot queue layout reads. */
addEventListener("scroll",()=>{
  if(SCROLL_FRAME)return;
  SCROLL_FRAME=requestAnimationFrame(()=>{
    SCROLL_FRAME=null;
    if(S.screen!=="home"||S.mode!=="live"||LOADING||!MORE||LIVE_STATUS[S.src]?.error||$("#ov").classList.contains("show"))return;
    if(scrollY+innerHeight>document.documentElement.scrollHeight-1200){
      clearTimeout(SCROLLT);SCROLLT=setTimeout(()=>{if(S.screen==="home"&&!$("#ov").classList.contains("show"))loadLive(false)},180);
    }
  });
},{passive:true});
/* Grow the bookmarks library when the end of what is drawn comes into view. */
function bookmarkScrollMore(){
  if(S.screen!=="profile"||S.bt!=="Bookmarks"||$("#ov").classList.contains("show"))return false;
  const tail=app.querySelector(".bm-tail");
  if(!tail)return false;
  if(tail.getBoundingClientRect().top>innerHeight+800)return false;
  return bookmarkMore();
}
/* The explore pager uses the same rule: read the height once per frame. */
let EX_SCROLL_FRAME=null;
addEventListener("scroll",()=>{
  if(EX_SCROLL_FRAME)return;
  EX_SCROLL_FRAME=requestAnimationFrame(()=>{EX_SCROLL_FRAME=null;exploreScrollMore();bookmarkScrollMore()});
},{passive:true});
document.addEventListener("keydown",e=>{
  if(e.target.matches?.('.prof [role="tab"]')&&["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const tl=tabsList(),i=tl.indexOf(e.target.dataset.v),j=e.key==="Home"?0:e.key==="End"?tl.length-1:(i+(e.key==="ArrowRight"?1:-1)+tl.length)%tl.length;slideTo(tl[j]);document.querySelector('.prof [data-v="'+tl[j]+'"]').focus({preventScroll:true});return}
  if(e.key==="Escape"&&$("#ov").classList.contains("show")){e.preventDefault();if(postView()?.kind==="image")history.back();else close();return}
  if((e.key==="Enter"||e.key===" ")&&e.target.matches?.('[role="button"][data-a]:not(.post-media),[role="switch"][data-a]')){e.preventDefault();e.target.click();return}
  if(e.target.id==="q"&&searchKeydown(e))return;
  if(e.target.id==="bookmarkSearch"&&e.key==="Escape"){e.preventDefault();clearBookmarkSearch()}
  if((e.key==="Enter"||e.key===" ")&&e.target.matches&&e.target.matches('.post-media[data-a="viewimage"]')){e.preventDefault();imageViewer(e.target.dataset.id)}
});
document.addEventListener("submit",e=>{if(e.target.id==="search-form"){e.preventDefault();if(!SEARCH_COMPOSING){if(SEARCH_TAGS.active>=0)pickSearchTag(SEARCH_TAGS.active,true);else submitSearch()}}});
addEventListener("storage",e=>{if(e.key===SEARCH_HISTORY_KEY||e.key===null){RECENT_SEARCHES=readSearchHistory(e.key===null?null:e.newValue);if(S.screen==="search"&&!searchQuery(S.q))renderSearchResults()}});
document.addEventListener("compositionstart",e=>{if(e.target.id==="q")SEARCH_COMPOSING=true});
document.addEventListener("input",e=>{
// Typing only drafts: a half-typed token waits for space, Enter or a chip change.
if(e.target.id==="likesSearch"){if(!draftPending(e.target.value)){GLINT_LIKES_SEARCH.queries[S.src]=tagFieldQuery("likesSearch");queueLikesApiSearch()}markFieldPending(e.target)}
if(e.target.id==="bookmarkSearch"){if(!draftPending(e.target.value)){BOOKMARK_VIEW.query=tagFieldQuery("bookmarkSearch");updateBookmarkSearch()}markFieldPending(e.target)}
if(e.target.id==="q"){renderSearchChips();markSearchPending();
  if(!e.isComposing)requestSearchTags()}
if(e.target.id==="bq"){S.bq=e.target.value;render()}});
// Keep the keyboard and caret when choosing a tag; outside taps dismiss it.
document.addEventListener("pointerdown",e=>{if(e.target.closest?.(".search-tag-options"))e.preventDefault();else if(!e.target.closest?.(".search-tag-field"))closeSearchTags()});
document.addEventListener("click",e=>{if(e.target.id==="q")requestSearchTags()});
document.addEventListener("focusout",e=>{if(e.target.id==="q")setTimeout(()=>{if(document.activeElement?.id!=="q")closeSearchTags()},0)});
document.addEventListener("compositionend",e=>{if(e.target.id==="q"){SEARCH_COMPOSING=false;markSearchPending();requestSearchTags()}});
addEventListener("scroll",()=>{if(S.screen==="search"){clearTimeout(SEARCH_AUTO_TIMER);SEARCH_AUTO_TIMER=setTimeout(maybeLoadSearch,100)}
  if(S.screen==="profile"&&S.bt==="Explore"){clearTimeout(EX_SCROLL_T);EX_SCROLL_T=setTimeout(exploreScrollMore,120)}},{passive:true});
// --- PWA deep links & share target (added) ---
try{const q=new URLSearchParams(location.search);
const scr=q.get("screen");if(["home","search","profile"].includes(scr))S.screen=scr;
const tb=(q.get("tab")||"").toLowerCase();if(tb==="boards")S.bt="Bookmarks";else if(tb==="collages")S.bt="Explore";else if(["likes","bookmarks","explore"].includes(tb))S.bt=tb.charAt(0).toUpperCase()+tb.slice(1);
const qq=q.get("q");if(qq){S.screen="search";S.q=qq}
if(q.get("action")==="create")setTimeout(()=>createSheet(),60);
const shared=(q.get("title")||q.get("text")||"").trim();
if(q.get("share")&&shared)setTimeout(()=>{pinForm();const el=document.getElementById("pt");if(el)el.value=shared.slice(0,80)},60);
}catch(e){}
document.documentElement.dataset.theme=S.theme;
if(!(new URLSearchParams(location.search)).get("tab"))S.bt=defaultSavedTab();
const _render=render;
render=function(){if(PGBUSY&&S.screen==='profile'&&document.querySelector('.tabwrap')){PGPEND=true;return}   // never rebuild the pager under a moving finger
  _render.apply(this,arguments);if(S.screen==='profile'&&!S.open)pagerInit();requestAnimationFrame(()=>placeInd(S.bt,S.bt,0,true));};
addEventListener("resize",()=>{window.__pgmeasure&&window.__pgmeasure();placeInd(S.bt,S.bt,0,true)});
render();
if(postView()&&postView().kind!=="app")restorePostView(history.state);
// load the first page of live posts
// Legacy credentials are migrated only by sources.js; never merge them here.
if(S.mode==="live"&&S.screen==="home")setTimeout(()=>{if(S.screen==="home")loadLive(true)},120);
if(S.mode==="live"&&S.screen==="search"&&searchQuery(S.q))doSearch(S.q,true);

/* The big half of the library (a pin's URLs, tags, names) is read from
   IndexedDB after the first paint, so the shell is interactive immediately. If
   the library was on screen while that landed, draw it again with the previews. */
try{window.PB_RUNTIME.libraryReady().then(()=>{if(S.screen==="profile"&&S.bt==="Bookmarks")refreshPane("Bookmarks")})}catch(e){}
window.PB_APP_READY=true;

// Overlay visibility, not stale sheet markup, owns the Settings selection.
(()=>{const observer=new MutationObserver(syncGlintNav);for(const id of ['ov','sheet']){const n=document.getElementById(id);if(n)observer.observe(n,{attributes:true,attributeFilter:['class']})}syncGlintNav()})();

document.addEventListener('click',event=>{const panel=document.getElementById('sheet');if(!panel?.classList.contains('post-sheet')||!panel.classList.contains('glint-show-info'))return;if(event.target.closest?.('.post-media')){panel.classList.remove('glint-show-info');event.preventDefault();event.stopImmediatePropagation()}},true);

/* Contextual tag completion for saved searches: suggestions only while typing. */
(()=>{
 const state={timer:0,controller:null,version:0,input:null,box:null,items:[],active:-1,start:0,end:0};
 const supported=input=>input&&['likesSearch','bookmarkSearch'].includes(input.id);
 function close(){clearTimeout(state.timer);state.controller?.abort();state.version++;state.box?.remove();if(state.input?.isConnected){state.input.setAttribute('aria-expanded','false');state.input.removeAttribute('aria-activedescendant')}state.box=null;state.items=[];state.active=-1}
 function token(input){const value=input.value,pos=input.selectionStart??value.length,start=value.lastIndexOf(' ',Math.max(0,pos-1))+1,next=value.indexOf(' ',pos),end=next<0?value.length:next,raw=value.slice(start,end);return{start,end,negative:raw.startsWith('-'),term:raw.replace(/^-/,'').toLowerCase()}}
 function cachedTags(input,term){const pins=input.id==='likesSearch'?favState(S.src).pins:bookmarkRows().filter(r=>BOOKMARK_VIEW.source==='all'||r.source===BOOKMARK_VIEW.source).map(r=>r.p).filter(Boolean);const names=new Map();for(const p of pins)for(const tag of [...(p.tags||[]),...(p.characters||[]),...(p.artists||[]),...(p.series||[])]){const name=typeof tag==='string'?tag:tag?.name||tag?.tag;if(name&&name.toLowerCase().includes(term))names.set(name,{name})}return[...names.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,8)}
 function paint(input,items,part){state.box?.remove();state.items=items;state.active=-1;if(!items.length){input.setAttribute('aria-expanded','false');return}state.input=input;state.start=part.start;state.end=part.end;
 const box=document.createElement('div');box.className='glint-tag-completions';box.id=input.id+'-suggestions';box.setAttribute('role','listbox');box.setAttribute('aria-label','Tag suggestions');
 box.innerHTML=items.map((item,index)=>`<button type="button" role="option" aria-selected="false" id="${input.id}-tag-${index}" data-glint-tag-index="${index}"><span>${esc(item.name.replace(/_/g,' '))}</span><small>${esc(item.name)}</small></button>`).join('');
 input.closest(input.id==='likesSearch'?'.glint-likes-search':'.bookmark-search').appendChild(box);state.box=box;input.setAttribute('aria-controls',box.id);input.setAttribute('aria-expanded','true');
 box.addEventListener('pointerdown',event=>event.preventDefault());box.addEventListener('click',event=>{const button=event.target.closest('[data-glint-tag-index]');if(button)pick(Number(button.dataset.glintTagIndex))});
 }
 function pick(index){const input=state.input,item=state.items[index];if(!input?.isConnected||!item)return;const part=token(input),prefix=part.negative?'-':'';const value=input.value.slice(0,part.start)+prefix+item.name+' '+input.value.slice(part.end).trimStart(),caret=part.start+prefix.length+item.name.length+1;close();input.value=value;input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret)}catch(e){}input.dispatchEvent(new Event('input',{bubbles:true}))}
 function request(input){close();state.input=input;if(!supported(input)||input.isComposing)return;const part=token(input);if(part.term.length<2||/[\s:*?"'<>]/.test(part.term))return;input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');const version=state.version,value=input.value,src=input.id==='bookmarkSearch'&&BOOKMARK_VIEW.source!=='all'?BOOKMARK_VIEW.source:S.src;
 state.timer=setTimeout(async()=>{const controller=new AbortController();state.controller=controller;let remote=[];try{remote=await pbAutocomplete(src,part.term,{signal:controller.signal})}catch(e){}if(controller.signal.aborted||version!==state.version||!input.isConnected||input.value!==value||document.activeElement!==input)return;const selected=new Set([...tagField(input.id).tags,...value.split(/\s+/).filter(Boolean)]),seen=new Set(),items=[...cachedTags(input,part.term),...remote].filter(item=>item.name&&!selected.has(item.name)&&!seen.has(item.name)&&seen.add(item.name)).slice(0,8);paint(input,items,part)},220);
 }
 document.addEventListener('input',event=>{if(supported(event.target)&&!event.isComposing)request(event.target)});
 document.addEventListener('compositionend',event=>{if(supported(event.target))request(event.target)});
 document.addEventListener('keydown',event=>{if(!supported(event.target)||event.target!==state.input||!state.box)return;if(event.key==='Escape'){event.preventDefault();close();return}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();state.active=(state.active+(event.key==='ArrowDown'?1:-1)+state.items.length)%state.items.length;state.box.querySelectorAll('[role="option"]').forEach((option,index)=>option.setAttribute('aria-selected',String(index===state.active)));event.target.setAttribute('aria-activedescendant',event.target.id+'-tag-'+state.active);return}if(event.key==='Enter'&&state.active>=0){event.preventDefault();pick(state.active)}});
 document.addEventListener('pointerdown',event=>{if(state.box&&!state.box.contains(event.target)&&event.target!==state.input)close()});
 document.addEventListener('focusout',event=>{if(supported(event.target))setTimeout(()=>{if(document.activeElement!==state.input)close()},0)});
})();

/* Committed tags have their own state; the input contains only the next draft. */
(()=>{
 const ids=['likesSearch','bookmarkSearch'];
 function paint(input){
  if(!ids.includes(input?.id)||!input.isConnected)return;
  const field=tagField(input.id),host=input.closest(input.id==='likesSearch'?'.glint-likes-search':'.bookmarks-filters');if(!host)return;
  let chips=host.querySelector('.glint-selected-search-tags');if(!field.tags.length){chips?.remove();return}
  if(!chips){chips=document.createElement('div');chips.className='glint-selected-search-tags';chips.setAttribute('aria-label','Selected search tags');host.appendChild(chips)}
  const html=field.tags.map(tag=>`<button type="button" data-selected-search-tag="${esc(tag)}" aria-label="Remove tag ${esc(tag.replace(/_/g,' '))}"><span>${esc(tag.replace(/_/g,' '))}</span><span aria-hidden="true">×</span></button>`).join('');
  if(chips._tagMarkup!==html){chips._tagMarkup=html;chips.innerHTML=html}
  if(!chips.dataset.bound){chips.dataset.bound='1';chips.addEventListener('click',event=>{const button=event.target.closest('[data-selected-search-tag]');if(!button)return;const current=document.getElementById(input.id);if(!current)return;const field=tagField(input.id);field.tags=field.tags.filter(tag=>tag!==button.dataset.selectedSearchTag);current.dispatchEvent(new Event('input',{bubbles:true}));current.focus({preventScroll:true});paint(current)})}
 }
 // Capture before search and autocomplete listeners consume the input event.
 document.addEventListener('input',event=>{const input=event.target;if(!ids.includes(input?.id))return;const field=tagField(input.id);let value=input.value;
  if(!event.isComposing&&/\s$/.test(value)){const tags=value.trim().split(/\s+/).filter(Boolean);field.tags=[...new Set([...field.tags,...tags])];value='';input.value=''}field.draft=value;
 },true);
 document.addEventListener('input',event=>paint(event.target));
 document.addEventListener('keydown',event=>{const input=event.target;if(!ids.includes(input?.id)||event.key!=='Enter'||event.isComposing)return;if(document.querySelector('.glint-tag-completions [aria-selected="true"]'))return;event.preventDefault();event.stopImmediatePropagation();if(input.value.trim()){input.value=input.value.trim()+' ';input.dispatchEvent(new Event('input',{bubbles:true}))}paint(input)},true);
 let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;ids.forEach(id=>paint(document.getElementById(id)))})}).observe(document.getElementById('app'),{childList:true,subtree:true});
})();

// Closing an overlay must stop video/audio and discard any retained Related
// surfaces, even when history jumps straight past the post to the feed.
new MutationObserver(()=>{
 if(document.getElementById('ov').classList.contains('show'))return;
 document.querySelectorAll('#sheet video').forEach(video=>video.pause());
 clearRelatedPostUnderlays();document.querySelectorAll('#ov > .glint-related-exit').forEach(node=>node.remove());
}).observe(document.getElementById('ov'),{attributes:true,attributeFilter:['class']});
