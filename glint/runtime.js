/* Glint runtime safety and UI lifecycle. No remote dependencies. */
(function () {
  'use strict';
  const record = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = v => JSON.parse(JSON.stringify(v));
  const list = v => Array.isArray(v) ? v : [];
  const id = v => (typeof v === 'string' || typeof v === 'number') && String(v).trim().length <= 240 ? String(v).trim() : '';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { recovery: '', blocked: false, warning: '', dialog: false, focus: null, focusKey: null, scroll: 0, focusFrame: 0, dialogGeneration: 0 };
  function mediaURL(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 12 * 1024 * 1024) return '';
    try {
      const u = new URL(value, location.href);
      if (u.username || u.password) return '';
      if (u.protocol === 'data:') return /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon)(?:;|,)/i.test(value) ? value : '';
      if (u.protocol === 'blob:') return u.origin === location.origin ? u.href : '';
      if (!['https:', 'http:'].includes(u.protocol)) return '';
      if (u.protocol === 'http:' && location.protocol === 'https:') u.protocol = 'https:';
      return u.href;
    } catch (_) { return ''; }
  }
  function pin(value) {
    if (!record(value) || !id(value.id)) return null;
    const p = Object.fromEntries(Object.entries(value).filter(([k]) => !['__proto__', 'constructor', 'prototype', 'title'].includes(k)));
    p.id = id(p.id);
    for (const k of ['grid', 'sample', 'orig']) if (p[k] != null) p[k] = mediaURL(p[k]);
    for (const k of ['tags', 'artists', 'characters', 'series']) p[k] = list(p[k]).filter(v => typeof v === 'string');
    for (const k of ['t', 'c', 'src', 'sid', 'author', 'srcName']) if (p[k] != null) p[k] = String(p[k]);
    for (const k of ['h', 'h2', 'x']) p[k] = Number.isFinite(Number(p[k])) ? Number(p[k]) : 0;
    return p;
  }
  function normalize(raw, defaults, sources) {
    const s = clone(defaults);
    if (record(raw)) for (const [k, v] of Object.entries(raw)) if (!['__proto__', 'constructor', 'prototype'].includes(k)) s[k] = v;
    s.boards = list(s.boards).filter(record).map(b => ({ ...b, n: String(b.n || 'Untitled'), pins: list(b.pins).map(id).filter(Boolean), seed: list(b.seed).map(id).filter(Boolean), n0: Math.max(0, Number(b.n0) || 0) }));
    s.custom = list(s.custom).map(pin).filter(Boolean);
    s.likes = list(s.likes).map(id).filter(Boolean); s.hidden = list(s.hidden).map(id).filter(Boolean);
    s.bookmarks = list(s.bookmarks).filter(v => id(record(v) ? v.id : v));
    s.srcs = [...new Set(list(s.srcs).filter(k => typeof k === 'string' && own(sources, k)))];
    if (!s.srcs.some(k => !sources[k].off)) s.srcs.unshift('danbooru');
    if (!own(sources, s.src) || sources[s.src].off || !s.srcs.includes(s.src)) s.src = s.srcs.find(k => !sources[k].off);
    s.live = Object.fromEntries(Object.entries(record(s.live) ? s.live : {}).map(([k, v]) => [k, list(v).map(pin).filter(Boolean)]));
    s.explore = list(s.explore).map(pin).filter(Boolean);
    s.pinCache = Object.fromEntries(Object.entries(record(s.pinCache) ? s.pinCache : {}).map(([k, v]) => [k, pin(v)]).filter(([k, v]) => v && k === v.id));
    for (const k of ['lpage', 'expage', 'exdone']) s[k] = Object.fromEntries(Object.entries(record(s[k]) ? s[k] : {}).filter(([name, v]) => name !== '__proto__' && Number.isFinite(Number(v))).map(([name, v]) => [name, Math.max(0, Number(v))]));
    s.forder = Object.fromEntries(Object.entries(record(s.forder) ? s.forder : {}).filter(([k, v]) => own(sources, k) && (v === 'newest' || v === 'popularity')));
    s.stags = Object.fromEntries(Object.entries(record(s.stags) ? s.stags : {}).filter(([k, v]) => own(sources, k) && typeof v === 'string'));
    for (const k of ['q', 'bq', 'ltags']) s[k] = typeof s[k] === 'string' ? s[k] : '';
    s.screen = ['home', 'search', 'profile'].includes(s.screen) ? s.screen : 'home';
    s.theme = s.theme === 'light' ? 'light' : 'dark'; s.cols = [1,2,3].includes(Number(s.cols)) ? Number(s.cols) : 2;
    s.mode = ['live', 'demo'].includes(s.mode) ? s.mode : 'live';
    s.proxy = './api/proxy';
    return s;
  }
  /* ── the library store ────────────────────────────────────────────────────
     Problem: a saved post costs ~1.5 KB of text, so 5 000 bookmarks are ~3.7 MB
     and *every* save re-serialised and rewrote all of it through the synchronous
     localStorage API — that is the jank you feel after tapping bookmark.

     So the state is split in two:
       · localStorage `pb2`  — the small, must-never-be-lost part: bookmark
         records (id + savedAt), boards, settings, source list. A few hundred KB
         even at 20 000 saves, and still one synchronous write, so it cannot be
         lost in a crash.
       · IndexedDB `pb-library/pins` — the fat part (a pin's URLs, tags, names).
         Written per *changed* record, off the main thread, no size ceiling.
     Opening the app hydrates the second half in one `getAll()`, and a save only
     touches the records that actually changed. */
  const LIB = { name: 'pb-library', store: 'pins', db: null, mode: 'pending', failed: false, ready: null, hydrated: 0 };
  let LIB_STATE = null, LIB_LAST = new Map(), LIB_WRITES = Promise.resolve(), LIB_DIRTY = new Set();

  function openDB() {
    return new Promise(resolve => {
      let request;
      try { request = indexedDB.open(LIB.name, 1); } catch (_) { return resolve(null); }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LIB.store)) db.createObjectStore(LIB.store, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  function tx(db, mode) {
    try { return db.transaction(LIB.store, mode).objectStore(LIB.store); } catch (_) { return null; }
  }
  function allPins(db) {
    return new Promise(resolve => {
      const store = db && tx(db, 'readonly');
      if (!store) return resolve([]);
      const request = store.getAll();
      request.onsuccess = () => resolve(list(request.result));
      request.onerror = () => resolve([]);
    });
  }
  /* Only changed records are written; the queue is one transaction. */
  function queueWrites(put, remove) {
    if (!put.length && !remove.length) return LIB_WRITES;
    LIB_WRITES = LIB_WRITES.then(() => new Promise(resolve => {
      const db = LIB.db, store = db && tx(db, 'readwrite');
      if (!store) return resolve();
      try {
        for (const pinRow of put) store.put(pinRow);
        for (const key of remove) store.delete(key);
      } catch (_) { return resolve(); }
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => resolve();
      store.transaction.onabort = () => resolve();
    }));
    return LIB_WRITES;
  }
  /* localStorage keeps the records; the cache lives in IndexedDB. */
  function splitState(s) {
    // Same shape the single-blob save always had (live feeds capped at 60 per
    // source, explore at 40 — that is what makes a fully offline cold start show
    // a feed), minus the pin cache, which now lives in IndexedDB.
    const out = snapshot(s, false);
    delete out.pinCache;
    return out;
  }
  /* IndexedDB traffic is debounced: a burst of saves (or a bulk import) becomes
     one transaction 250 ms later instead of one per save. */
  const LIB_PUT = new Map(), LIB_DEL = new Set();
  let LIB_TIMER = null;
  function syncLibrary(s) {
    const cache = record(s.pinCache) ? s.pinCache : {};
    for (const [key, value] of Object.entries(cache)) {
      if (!value) continue;
      if (LIB_LAST.get(key) !== value) { LIB_PUT.set(key, value); LIB_LAST.set(key, value); }
    }
    for (const key of LIB_LAST.keys()) if (!cache[key]) { LIB_DEL.add(key); LIB_LAST.delete(key); }
    if (!LIB_PUT.size && !LIB_DEL.size) return LIB_WRITES;
    if (!LIB_TIMER) LIB_TIMER = setTimeout(flushLibrary, 250);
    return LIB_WRITES;
  }
  function flushLibrary() {
    clearTimeout(LIB_TIMER); LIB_TIMER = null;
    const put = [...LIB_PUT.values()], remove = [...LIB_DEL];
    LIB_PUT.clear(); LIB_DEL.clear();
    return queueWrites(put, remove);
  }
  function hydrateLibrary(s) {
    LIB.ready = (async () => {
      const db = await openDB();
      if (!db) { LIB.mode = 'fallback'; LIB.failed = true; return; }
      LIB.db = db; LIB.mode = 'split';
      const stored = await allPins(db);
      const cache = record(s.pinCache) ? s.pinCache : {};
      let legacy = 0;
      for (const row of stored) {
        const value = pin(row);
        if (!value) continue;
        if (!cache[value.id]) cache[value.id] = value;      // IndexedDB wins for anything missing locally
        LIB_LAST.set(value.id, cache[value.id]);
      }
      for (const [key, value] of Object.entries(cache)) {
        if (!LIB_LAST.has(key)) { LIB_LAST.set(key, null); legacy++; }   // came from the old single-blob save
      }
      s.pinCache = cache;
      LIB.hydrated = Object.keys(cache).length;
      if (legacy) { await syncLibrary(s); try { localStorage.setItem('pb2', JSON.stringify(splitState(s))); } catch (_) {} }
    })();
    return LIB.ready;
  }

  function warning(message) {
    state.warning = message;
    const el = document.getElementById('storageNotice');
    if (el) { el.hidden = !message; el.querySelector('[data-storage-message]').textContent = message; }
  }
  function load(defaults, sources) {
    let raw = null, text = '';
    try { text = localStorage.getItem('pb2') || ''; raw = text ? JSON.parse(text) : {}; }
    catch (_) { state.recovery = text; state.blocked = true; warning('Saved data could not be read. It has NOT been reset. Download a recovery copy before replacing it.'); }
    if (text && !record(raw)) { state.recovery = text; state.blocked = true; warning('Invalid saved data was preserved. Download a recovery copy before replacing it.'); }
    const s = normalize(raw, defaults, sources);
    const keys = ['boards', 'custom', 'likes', 'hidden', 'bookmarks', 'srcs'];
    if (record(raw) && keys.some(k => own(raw, k) && !Array.isArray(raw[k]))) {
      state.recovery = text;
      try { if (!localStorage.getItem('pb2-recovery-v65')) localStorage.setItem('pb2-recovery-v65', text); }
      catch (_) { state.blocked = true; }
      warning('Invalid saved settings were repaired. Existing bookmarks were kept; the original data is available as a recovery copy.');
    }
    LIB_STATE = s;
    if (!state.blocked) hydrateLibrary(s);
    return s;
  }
  function snapshot(s, compact) {
    // User saves and their metadata are NEVER evicted to make room for feeds.
    const saved = new Set(list(s.bookmarks).map(b => String(b.id)));
    const cache = { ...s.pinCache };
    for (const p of [...list(s.custom), ...Object.values(s.live || {}).flat(), ...list(s.explore)]) if (p && saved.has(String(p.id))) cache[p.id] = p;
    const live = Object.fromEntries(Object.entries(s.live || {}).map(([k, v]) => [k, compact ? [] : list(v).slice(-60)]));
    return { ...s, pinCache: cache, live, explore: compact ? [] : list(s.explore).slice(-40), open: null };
  }
  /* Local storage is a hard budget (about 5 MB per origin) and a saved post
     costs about 1.5 KB of *text* — URLs, tags and names. (The pictures live in
     the service worker's own image cache, not here.) A big library therefore
     sheds the parts that can be fetched again, in this order:
       1. live feeds and explore rows            (already handled by snapshot)
       2. full detail of the post                (sample/original URLs, file info)
       3. everything but the image itself        (tags and names come back on open)
       4. the oldest cached previews             (the card reloads it when seen)
     A bookmark record is never dropped, and whatever was shed is fetched again
     the moment that post is opened. */
  const SHED_FIELDS = ['id', 'src', 'sid', 't', 'c', 'srcName', 'grid', 'width', 'height', 'date', 'rating', 'score', 'tags', 'artists', 'characters', 'series', 'detailsReady'];
  // Even the cheapest record keeps the names (artist / character / series), so
  // searching the library by artist still works for every saved post.
  const URL_FIELDS = ['id', 'src', 'sid', 'grid', 'width', 'height', 't', 'artists', 'characters', 'series'];
  const SHED = { mode: 'full', drop: 0, budget: 2.6 * 1024 * 1024, told: {} };
  try { const savedMode = localStorage.getItem('pb-store-mode'); if (['lean', 'url'].includes(savedMode)) SHED.mode = savedMode; } catch (_) {}
  function shedPin(p, fields) {
    if (!record(p)) return p;
    const out = {};
    for (const k of fields) if (p[k] !== undefined) out[k] = p[k];
    // The original/sample URLs are gone, so opening the post asks the source for
    // its details again instead of zooming a thumbnail forever.
    if (p.fileInfoReady) out.fileInfoReady = false;
    return out;
  }
  // How much of the budget the newest posts may spend on tags/names. Older
  // saves keep only their image address until they are opened.
  const LEAN_BUDGET = 2.6 * 1024 * 1024;
  function shedState(s, mode) {
    if (mode === 'full') return snapshot(s, false);   // the full save, feeds included
    const compact = snapshot(s, true);
    const cache0 = compact.pinCache || {};
    const order = list(s.bookmarks).slice().sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0)).map(b => String(b.id));
    const index = new Map(order.map((k, i) => [k, i])), cache = {};
    let used = 0;
    for (const k of order) {
      const v = cache0[k];
      if (!v) continue;
      if (SHED.drop > 0 && index.get(k) >= SHED.drop) continue;   // oldest previews go last
      const lean = shedPin(v, SHED_FIELDS), size = JSON.stringify(lean).length + 8;
      if (used + size <= SHED.budget) { cache[k] = lean; used += size; }
      else cache[k] = shedPin(v, URL_FIELDS);
    }
    // Anything cached for a post that is not a bookmark (e.g. from a board).
    for (const [k, v] of Object.entries(cache0)) if (!index.has(k)) cache[k] = mode === 'url' ? v : shedPin(v, SHED_FIELDS);
    return { ...compact, pinCache: cache };
  }
  const SHED_NOTICE = 'Storage is nearly full. The newest saved posts keep their tags for search; older ones keep their image link and load their details when you open them. Every bookmark is saved.';
  function persist(s) {
    if (state.blocked) return false;
    const write = text => { localStorage.setItem('pb2', text); if (!state.recovery) warning(''); return true; };
    /* Split mode: the records go to localStorage (small, synchronous, crash-safe)
       and only the changed pins go to IndexedDB (big, async). One write of a few
       hundred KB instead of a few megabytes. */
    if (LIB.mode === 'split') {
      try {
        write(JSON.stringify(splitState(s)));
        syncLibrary(s);
        SHED.mode = 'split';
        return true;
      } catch (_) { LIB.mode = 'fallback'; state.warning = ''; }   // quota: use the old shed path below
    }
    const attempt = (mode, notice) => {
      try { write(JSON.stringify(shedState(s, mode))); }
      catch (_) { return false; }
      SHED.mode = mode;
      try { localStorage.setItem('pb-store-mode', mode); } catch (_) {}
      if (notice && !SHED.told.lean) { SHED.told.lean = true; warning(SHED_NOTICE); }
      return true;
    };
    // A library that shrank may fit whole again: try the plain write first.
    if (SHED.mode !== 'full' && list(s.bookmarks).length < 1200) SHED.mode = 'full';
    if (SHED.mode === 'full' && attempt('full')) return true;
    // Give up detail, then tags, then breadth — only the last resort touches previews.
    for (const budget of [SHED.budget || LEAN_BUDGET, 1536 * 1024, 640 * 1024, 0]) {
      SHED.budget = budget;
      if (attempt('lean', 'lean')) return true;
    }
    let drop = list(s.bookmarks).length;
    for (let i = 0; i < 24; i++) {
      drop = Math.floor(drop * 0.8);
      if (drop <= 0) break;
      SHED.drop = drop;
      if (attempt('url')) return true;
    }
    warning('Storage is unavailable or full. Changes could not be saved. Export your bookmarks before closing this tab.');
    return false;
  }
  function downloadJSON(value, filename) {
    const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function exportBackup(s) {
    const rows = list(s.bookmarks), saved = new Set(rows.map(b => String(b.id))), cache = {};
    for (const p of [...Object.values(s.pinCache || {}), ...Object.values(s.live || {}).flat(), ...list(s.custom), ...list(s.explore)]) if (p && saved.has(String(p.id))) cache[p.id] = Object.fromEntries(Object.entries(pin(p)).filter(([k]) => ['id','sid','src','srcName','t','c','r','grid','sample','orig','width','height','tags','artists','characters','series','date','uploadedAt','fileSize','fileType','rating','score','sourceUrls','sourceLinks','detailsReady','fileInfoReady','sourceInfoReady','uploadInfoReady','h','h2','x'].includes(k)));
    downloadJSON({ format: 'pinboard-bookmarks', version: 1, exportedAt: new Date().toISOString(), bookmarks: rows, pinCache: cache, custom: list(s.custom).filter(p => saved.has(String(p.id))).map(p => cache[p.id]) }, 'pinboard-bookmarks-' + new Date().toISOString().slice(0, 10) + '.json');
  }
  function exportRecovery() {
    let text = state.recovery; try { text ||= localStorage.getItem('pb2-recovery-v65') || localStorage.getItem('pb2'); } catch (_) {}
    if (text) downloadJSON(text, 'pinboard-recovery.json');
  }
  function animate(el, frames, options) {
    return el.animate(frames, { ...options, duration: motionQuery.matches ? 0 : options.duration });
  }
  function settle(panel) {
    for (const a of panel.getAnimations()) { try { a.finish(); } catch (_) { a.cancel(); } }
    document.querySelectorAll('body > .sheet-ghost').forEach(n => n.remove());
  }
  function enhance(root) {
    root.querySelectorAll('.li[data-a], .sw[data-a]').forEach(el => {
      el.setAttribute('tabindex', '0'); el.setAttribute('role', el.classList.contains('sw') ? 'switch' : 'button');
      if (el.classList.contains('sw')) { el.setAttribute('aria-checked', el.classList.contains('on')); el.setAttribute('aria-label', el.parentElement.querySelector('b')?.textContent || 'Toggle option'); }
    });
    root.querySelectorAll('.field').forEach(el => {
      if (!el.labels?.length && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.placeholder || 'Input');
    });
  }
  function dialogOpen(panel) {
    if (!state.dialog) {
      state.dialog = true; state.focus = document.activeElement; state.focusKey = state.focus?.dataset?.id || null; state.scroll = scrollY;
      document.body.classList.add('dialog-open');
    }
    for (const key of ['app', 'nav']) { const n = document.getElementById(key); if (n) n.inert = true; }
    panel.tabIndex = -1; enhance(panel);
    if (panel.contains(document.activeElement)) return;
    cancelAnimationFrame(state.focusFrame); const generation = ++state.dialogGeneration;
    state.focusFrame = requestAnimationFrame(() => { if (state.dialog && generation === state.dialogGeneration && panel.isConnected) panel.focus({ preventScroll: true }); });
  }
  function dialogClose() {
    if (!state.dialog) return;
    state.dialog = false; ++state.dialogGeneration; cancelAnimationFrame(state.focusFrame);
    document.body.classList.remove('dialog-open');
    for (const key of ['app', 'nav']) { const n = document.getElementById(key); if (n) n.inert = false; }
    const target = state.focus?.isConnected ? state.focus : state.focusKey ? document.querySelector('[data-id="' + CSS.escape(state.focusKey) + '"][tabindex]') : document.querySelector('#nav button[aria-current="page"]');
    target?.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', e => {
    const panel = document.getElementById('sheet');
    if (!state.dialog || !panel || e.key !== 'Tab') return;
    const notice = document.getElementById('storageNotice'), roots = notice && !notice.hidden ? [panel, notice] : [panel];
    const nodes = roots.flatMap(root => [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href],[tabindex="0"]')]).filter(n => n.getClientRects().length && !n.closest('[inert],[hidden]'));
    if (!nodes.length) { e.preventDefault(); panel.focus({ preventScroll: true }); return; }
    const first = nodes[0], last = nodes[nodes.length - 1], active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel || !roots.some(root => root.contains(active)))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || active === panel || !roots.some(root => root.contains(active)))) { e.preventDefault(); first.focus(); }
  });
  // No inline event handlers: both deployed CSP and saved metadata stay safe.
  document.addEventListener('error', e => {
    const image = e.target;
    if (image instanceof HTMLVideoElement) {
      // A video that will not load reports itself and offers a retry, exactly
      // like a picture — it never leaves a silent black box behind.
      // A player may declare one fallback source (e.g. the proxied copy); use
      // it once before reporting a failure.
      if (image.dataset.fallbackSrc) {
        const next = image.dataset.fallbackSrc; delete image.dataset.fallbackSrc;
        const resume=!image.paused||image.autoplay;image.src = next; try { image.load();if(resume)image.play().catch(()=>{}); } catch (_) {}
        return;
      }
      const area = image.closest('.post-media,.image-viewer'); if (!area) return;
      // Keep the player (and its poster) visible behind the message.
      image.classList.add('video-failed');
      area.classList.add('image-unavailable');
      if (!area.querySelector('.media-failure')) {
        const message = document.createElement('div'); message.className = 'media-failure'; message.setAttribute('role', 'status');
        message.innerHTML = '<p>Video could not play. Check your connection or try again.</p><button type="button" data-a="retryvideo">Retry video</button>';
        area.append(message);
      }
      return;
    }
    if (!(image instanceof HTMLImageElement) || !image.closest('.art,.post-media,.image-viewer')) return;
    const art=image.closest('.art');
    if(art&&image.dataset.posterFallback){
      let options=[];try{options=JSON.parse(image.dataset.posterFallback)||[]}catch(_){}
      const next=options.shift();
      if(next){if(options.length)image.dataset.posterFallback=JSON.stringify(options);else delete image.dataset.posterFallback;image.classList.remove('image-failed');art.classList.remove('image-unavailable');image.alt='';image.src=next;return}
      delete image.dataset.posterFallback;
    }
    image.classList.add('image-failed'); image.alt = 'Image unavailable';
    const area = image.closest('.art,.post-media,.image-viewer'); area.classList.add('image-unavailable');
    if (area.classList.contains('post-media')) { area.setAttribute('role','group'); area.tabIndex=-1; delete area.dataset.a; }
    if (!image.closest('.art') && !area.querySelector('.media-failure')) {
      const message = document.createElement('div'); message.className = 'media-failure'; message.setAttribute('role', 'status');
      message.innerHTML = '<p>Image unavailable. Check your connection or try again.</p><button type="button" data-a="retryimage">Retry image</button>'; area.append(message);
    }
  }, true);
  document.addEventListener('DOMContentLoaded', () => warning(state.warning));
  /* What the rest of the app and the tests ask the store. */
  const libraryReady = () => (LIB.ready || Promise.resolve());
  const libraryStats = () => ({ mode: LIB.mode, hydrated: LIB.hydrated, pins: LIB_STATE && record(LIB_STATE.pinCache) ? Object.keys(LIB_STATE.pinCache).length : 0, failed: LIB.failed });
  const libraryFlush = () => { flushLibrary(); return LIB_WRITES; };
  const libraryMode = () => LIB.mode;
  const libraryHydrated = () => LIB.mode !== 'split' || LIB.hydrated > 0;
  window.PB_RUNTIME = { normalize, load, persist, pin, mediaURL, warning, state, animate, settle, enhance, dialogOpen, dialogClose, exportBackup, exportRecovery, downloadJSON, libraryReady, libraryStats, libraryFlush, libraryMode, libraryHydrated };
})();
