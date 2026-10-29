/* Google Drive sync — your bookmarks, boards and settings in your own Drive.
   ---------------------------------------------------------------------------
   Ported from the BooruHub app's sync design (assets/www/app.js in that APK):
   a single JSON file in Drive's hidden app folder, merge-by-newest with
   tombstones for deletions, a modifiedTime check so two devices never bounce
   the same copy back and forth, and a 4-second debounce that uploads after a
   change without ever opening a popup in the background.

   What it never does: it never sends anything to a server of ours (there is
   none), never touches source API keys unless you ask it to, and never opens a
   sign-in window on its own — background syncs only reuse the 1-hour token you
   already granted.                                              */
(function () {
  'use strict';

  const FILE_NAME = 'pinboard-data.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const TOKEN_KEY = 'pb-drive-token';
  const LEAN = ['id', 'src', 'sid', 't', 'c', 'srcName', 'grid', 'width', 'height', 'date', 'rating', 'score', 'tags', 'artists', 'characters', 'series', 'detailsReady', 'fileInfoReady', 'sourceInfoReady', 'uploadInfoReady'];
  const PREFS = ['cols', 'theme', 'sw', 'iq', 'srcs', 'src', 'forder', 'stags', 'mode'];
  const TOMBSTONE_DAYS = 90;

  const S = () => window.S || {};
  const state = { busy: false, resync: false, timer: null, armed: false, error: '', note: '', account: '', sig: '', bookSig: '' };
  let quiet = false;   // while true, our own writes must not look like user changes

  /* ---------- tiny helpers ------------------------------------------------ */
  const stable = value => JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((out, k) => { out[k] = v[k]; return out; }, {}) : v));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clientId = () => String((S().driveClientId || window.PB_DRIVE_CLIENT_ID || '')).trim();
  const store = (key, value) => { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch (_) {} };
  const read = (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } };
  const drop = key => { try { localStorage.removeItem(key); } catch (_) {} };

  /* ---------- payload ----------------------------------------------------- */
  function leanPin(p) {
    if (!p) return null;
    const out = {};
    for (const key of LEAN) if (p[key] !== undefined) out[key] = p[key];
    return out.id ? out : null;
  }
  function tombstones() {
    const s = S(), map = s.bmDeleted && typeof s.bmDeleted === 'object' ? s.bmDeleted : {};
    const cutoff = Date.now() - TOMBSTONE_DAYS * 864e5, out = {};
    for (const [id, when] of Object.entries(map)) if (Number(when) > cutoff) out[id] = Number(when);
    return out;
  }
  function payload() {
    const s = S(), pins = {};
    for (const record of (s.bookmarks || [])) {
      const p = leanPin((s.pinCache || {})[record.id]);
      if (p) pins[record.id] = p;
    }
    const settings = { setAt: Number(s.setAt) || 0 };
    for (const key of PREFS) if (s[key] !== undefined) settings[key] = s[key];
    if (s.syncKeys) settings.keys = window.pbAuth || {};   // credentials only when the user opts in
    return {
      app: 'pinboard', version: 1, savedAt: new Date().toISOString(), device: navigator.userAgent.slice(0, 60),
      data: {
        bookmarks: (s.bookmarks || []).map(r => ({ id: String(r.id), savedAt: Number(r.savedAt) || 0 })),
        deleted: tombstones(),
        pins,
        boards: (s.boards || []).map(b => ({ id: b.id, n: b.n, d: b.d, n0: b.n0, p: b.p, pins: b.pins || [], seed: b.seed || [] })),
        hidden: s.hidden || [],
        customSources: typeof window.pbCustomRecords === 'function' ? window.pbCustomRecords() : []
      },
      settings
    };
  }
  /* Merge is by newest event per id: a later delete beats an earlier save, and
     the other way round, so a removal on one device never comes back. */
  function mergeInto(remote, local) {
    const s = S();
    const localSaved = new Map((local.data && local.data.bookmarks || []).map(r => [String(r.id), Number(r.savedAt) || 0]));
    const remoteSaved = new Map((remote.data && remote.data.bookmarks || []).map(r => [String(r.id), Number(r.savedAt) || 0]));
    const localGone = local.data && local.data.deleted || {};
    const remoteGone = remote.data && remote.data.deleted || {};
    const ids = new Set([...localSaved.keys(), ...remoteSaved.keys(), ...Object.keys(localGone), ...Object.keys(remoteGone)]);
    const bookmarks = [], deleted = {};
    for (const id of ids) {
      const savedAt = Math.max(localSaved.get(id) || 0, remoteSaved.get(id) || 0);
      const goneAt = Math.max(Number(localGone[id]) || 0, Number(remoteGone[id]) || 0);
      if (goneAt && goneAt >= savedAt) { deleted[id] = goneAt; continue; }
      if (savedAt) bookmarks.push({ id, savedAt });
    }
    bookmarks.sort((a, b) => b.savedAt - a.savedAt);

    const pins = { ...(remote.data && remote.data.pins || {}) };
    for (const [id, p] of Object.entries(local.data && local.data.pins || {})) {
      const mine = leanPin(p), theirs = pins[id];
      if (!theirs) { pins[id] = mine; continue; }
      const better = (mine.tags || []).length + (mine.artists || []).length >= (theirs.tags || []).length + (theirs.artists || []).length ? mine : theirs;
      pins[id] = better;
    }

    const byId = (a, b) => { const map = new Map(); for (const row of a.concat(b)) if (row && row.id !== undefined) map.set(String(row.id), row); return [...map.values()]; };
    const boards = byId(local.data && local.data.boards || [], remote.data && remote.data.boards || []).map(b => {
      const other = (remote.data && remote.data.boards || []).find(x => String(x.id) === String(b.id));
      if (!other) return b;
      return { ...b, pins: [...new Set([...(b.pins || []), ...(other.pins || [])])] };
    });
    const hidden = [...new Set([...(local.data && local.data.hidden || []), ...(remote.data && remote.data.hidden || [])])];
    const customSources = byId(local.data && local.data.customSources || [], remote.data && remote.data.customSources || []);

    const settings = { ...(remote.settings || {}) };
    const mine = local.settings || {};
    if ((mine.setAt || 0) >= (settings.setAt || 0)) { for (const key of Object.keys(mine)) settings[key] = mine[key]; }
    return { bookmarks, deleted, pins, boards, hidden, customSources, settings };
  }

  function applyMerged(merged) {
    const s = S();
    s.bookmarks = merged.bookmarks;
    s.bmDeleted = merged.deleted;
    s.pinCache = { ...(s.pinCache || {}) };
    for (const [id, p] of Object.entries(merged.pins || {})) {
      const normal = window.PB_RUNTIME && PB_RUNTIME.pin ? PB_RUNTIME.pin(p) : p;
      if (!normal) continue;
      const existing = s.pinCache[id];
      const richer = (normal.tags || []).length + (normal.artists || []).length;
      const current = existing ? (existing.tags || []).length + (existing.artists || []).length : -1;
      if (richer >= current) s.pinCache[id] = { ...existing, ...normal };
    }
    if (Array.isArray(merged.boards) && merged.boards.length) {
      const known = new Map((s.boards || []).map(b => [String(b.id), b]));
      for (const board of merged.boards) known.set(String(board.id), { ...known.get(String(board.id)), ...board });
      s.boards = [...known.values()];
    }
    if (Array.isArray(merged.hidden)) s.hidden = merged.hidden;
    if (Array.isArray(merged.customSources) && merged.customSources.length && typeof window.pbWriteCustomRecords === 'function') {
      const known = new Map((window.pbCustomRecords() || []).map(r => [String(r.id), r]));
      for (const row of merged.customSources) known.set(String(row.id), row);
      window.pbWriteCustomRecords([...known.values()]);
    }
    const settings = merged.settings || {};
    let touched = false;
    if ((settings.setAt || 0) > (Number(s.setAt) || 0)) {
      for (const key of PREFS) if (settings[key] !== undefined) { s[key] = settings[key]; touched = true; }
      if (settings.keys && s.syncKeys && window.pbAuth) window.pbAuth = settings.keys;
      s.setAt = settings.setAt || 0;
    }
    if (typeof window.forgetBookmarkIds === 'function') forgetBookmarkIds();
    if (typeof window.save === 'function') save(true);
    if (touched && typeof window.render === 'function') render();
    return true;
  }

  /* ---------- Google sign-in ---------------------------------------------- */
  function loadGIS() {
    if (document.getElementById('gis')) return;
    const tag = document.createElement('script');
    tag.id = 'gis'; tag.src = 'https://accounts.google.com/gsi/client'; tag.async = true;
    document.head.append(tag);
  }
  async function waitGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return true;
    if (location.protocol === 'file:') return false;
    loadGIS();
    for (let i = 0; i < 60; i++) {
      if (window.google && google.accounts && google.accounts.oauth2) return true;
      await new Promise(r => setTimeout(r, 150));
    }
    return false;
  }
  const scopeOk = response => {
    try { return typeof google.accounts.oauth2.hasGrantedAllScopes !== 'function' || google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE); }
    catch (_) { return true; }
  };
  const needsTap = message => Object.assign(new Error(message), { needGesture: true });
  const takeToken = tokens => {
    state.token = tokens.access_token;
    state.exp = Date.now() + (Number(tokens.expires_in) || 3600) * 1000;
    store(TOKEN_KEY, { token: state.token, exp: state.exp });
    return state.token;
  };
  const dropToken = () => { state.token = ''; state.exp = 0; drop(TOKEN_KEY); };
  /* What to do about "Error 400: origin_mismatch" — the setting lives in the
     Cloud project, not in this app, and it has to match scheme + host + port. */
  function originProblem(kind) {
    const origin = (typeof location !== "undefined" && location.origin) || "this origin";
    const lead = kind === "origin_mismatch"
      ? "Google blocked the sign-in: this page's origin is not registered for your OAuth Client ID."
      : "Google sign-in did not complete" + (kind ? " (" + kind + ")" : "") + ".";
    return lead + " In Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 " +
      "Client ID (type: Web application) → Authorized JavaScript origins, add exactly " +
      origin + " (no trailing slash), save, wait a few minutes, then reload this page.";
  }
  const cachedToken = () => {
    const saved = read(TOKEN_KEY, null);
    if (saved && saved.token && saved.exp > Date.now() + 60000) { state.token = saved.token; state.exp = saved.exp; return saved.token; }
    return '';
  };

  function requestToken(interactive) {
    return new Promise((resolve, reject) => {
      const s = S();
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: SCOPE,
        callback: response => {
          if (response.error) return reject(response.error === 'interaction_required' || response.error === 'access_denied'
            ? needsTap('Tap “Connect & sync” to allow Google Drive again.')
            : /origin_mismatch|origin/i.test(response.error + ' ' + (response.error_description || ''))
              ? new Error(originProblem())
              : new Error(response.error_description || response.error));
          if (!scopeOk(response)) return reject(Object.assign(new Error('Google Drive access was not ticked on the sign-in screen. Connect again and tick it.'), { reconnect: true }));
          s.driveOn = true;
          takeToken(response);
          resolve(state.token);
        },
        error_callback: event => {
          const kind = event && event.type;
          // "Access blocked: Error 400: origin_mismatch" is drawn *inside* the
          // popup, so all we see is a closed window with no token — point at the
          // one setting that causes it instead of a bare error code.
          reject(kind === 'popup_failed_to_open' || kind === 'popup_closed' || kind === 'popup_closed_by_user'
            ? needsTap('Tap “Connect & sync” again to finish signing in.')
            : new Error(kind === 'origin_mismatch' ? originProblem() : originProblem(kind)));
        }
      });
      client.requestAccessToken({ prompt: interactive && !s.driveEmail ? 'consent' : '' });
    });
  }
  async function getToken(interactive) {
    if (cachedToken()) return state.token;
    if (!clientId()) throw new Error('Add your Google OAuth Client ID first (Settings → Google Drive sync).');
    // A background sync must never open a window: browsers block it and it looks
    // like a failed sign-in. Wait for a real tap instead.
    if (!interactive) throw needsTap('Tap “Connect & sync” to renew the Google session.');
    if (!(await waitGIS())) throw new Error('The Google sign-in script could not load. Check your connection and try again.');
    return requestToken(true);
  }
  async function gfetch(url, options = {}, retried) {
    const bearer = await getToken(false);
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + bearer } });
    if (response.status === 401) {
      dropToken();
      if (!retried) return gfetch(url, options, true);
      throw needsTap('Google session expired — tap “Connect & sync”.');
    }
    return response;
  }
  async function driveError(response, what) {
    let reason = '', message = '';
    try {
      const body = await response.json();
      const error = body.error || {};
      message = error.message || '';
      reason = (error.errors && error.errors[0] && error.errors[0].reason) || error.status || '';
    } catch (_) {}
    if (response.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(reason + message)) {
      return new Error('The Google Drive API is switched off in your Cloud project. console.cloud.google.com → APIs & Services → Library → “Google Drive API” → Enable, wait a minute, then sync again.');
    }
    if (response.status === 403 && /insufficient|scope/i.test(reason + message)) {
      return Object.assign(new Error('Google did not grant Drive access. Connect again and tick the Drive box.'), { reconnect: true });
    }
    if (response.status === 401) return needsTap('Google session expired — tap “Connect & sync”.');
    return new Error('Drive ' + what + ' failed: HTTP ' + response.status + (message ? ' – ' + message : '') + (reason && !message.includes(reason) ? ' [' + reason + ']' : ''));
  }

  /* ---------- Drive file --------------------------------------------------- */
  async function findRemote() {
    const response = await gfetch(DRIVE + '/files?spaces=appDataFolder&q=' + encodeURIComponent("name='" + FILE_NAME + "'") + '&fields=files(id,modifiedTime)&pageSize=1');
    if (!response.ok) throw await driveError(response, 'list');
    const file = ((await response.json()).files || [])[0];
    return file ? { id: file.id, mod: file.modifiedTime } : { id: '', mod: '' };
  }
  async function readRemote(id) {
    const response = await gfetch(DRIVE + '/files/' + encodeURIComponent(id) + '?alt=media');
    if (!response.ok) throw await driveError(response, 'read');
    const text = await response.text();
    if (!text.trim()) return null;
    try { return JSON.parse(text); } catch (_) { throw new Error('The Drive copy is not readable (it may be from another app). Nothing was overwritten.'); }
  }
  async function uploadRemote(id, content) {
    if (id) {
      const response = await gfetch(UPLOAD + '/files/' + encodeURIComponent(id) + '?uploadType=media&fields=id,modifiedTime', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content });
      if (!response.ok) throw await driveError(response, 'upload');
      const body = await response.json();
      return { id: body.id || id, mod: body.modifiedTime || '' };
    }
    const boundary = 'pb' + Math.random().toString(36).slice(2);
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + content + '\r\n--' + boundary + '--';
    const response = await gfetch(UPLOAD + '/files?uploadType=multipart&fields=id,modifiedTime', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
    if (!response.ok) throw await driveError(response, 'create');
    const created = await response.json();
    return { id: created.id, mod: created.modifiedTime || '' };
  }
  async function loadAccount() {
    try {
      const response = await gfetch(DRIVE + '/about?fields=user(emailAddress,displayName)');
      if (!response.ok) return;
      const user = (await response.json()).user || {};
      state.account = user.emailAddress || user.displayName || '';
      const s = S(); s.driveEmail = state.account;
      saveQuiet();
    } catch (_) {}
  }

  /* ---------- sync --------------------------------------------------------- */
  let syncTimer = null;
  /* Writing state from inside a sync is not a user change. */
  function saveQuiet() {
    quiet = true;
    try { if (typeof window.save === 'function') save(true); } finally { quiet = false; }
  }
  /* A bookmark is often one of several the user is about to make, so it waits
     10 s before uploading; a settings change goes up after 4 s. `soon` is for
     "we just came back online / the tab is closing". */
  const BOOKMARK_WAIT = 10000, SETTINGS_WAIT = 4000;
  function scheduleSync(soon, wait) {
    const s = S();
    if (!s.driveOn || !s.driveAuto) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncNow(false); }, soon ? 600 : (wait || SETTINGS_WAIT));
  }
  /* Bookmarks are counted rather than stringified: a 5 000-post library made the
     old signature a megabyte of JSON on every single save. */
  const bookSig = s => [list(s.bookmarks).length, latestSaved(s), Object.keys(tombstones()).length, latestGone()].join("|");
  const list = v => (Array.isArray(v) ? v : []);
  const latestSaved = s => { let top = 0; for (const r of list(s.bookmarks)) { const t = Number(r.savedAt) || 0; if (t > top) top = t; } return top; };
  const latestGone = () => { let top = 0; for (const v of Object.values(tombstones())) { const t = Number(v) || 0; if (t > top) top = t; } return top; };
  function noteChange() {
    if (quiet) return;
    const s = S();
    const books = bookSig(s);
    const bookmarksChanged = books !== state.bookSig;
    state.bookSig = books;
    const signature = stable({ data: { bookmarks: s.bookmarks, deleted: tombstones(), boards: s.boards, hidden: s.hidden }, settings: payload().settings });
    if (signature === state.sig) return;
    state.sig = signature;
    s.driveDirty = true;
    paintRings();
    if (s.driveOn && s.driveAuto) scheduleSync(false, bookmarksChanged ? BOOKMARK_WAIT : SETTINGS_WAIT);
  }
  async function syncNow(interactive, quiet) {
    const s = S();
    if (state.busy) { state.resync = true; return false; }
    if (!s.driveOn && !interactive) return false;
    if (!navigator.onLine) { state.note = 'Offline — will sync when you are back.'; paint(); return false; }
    state.busy = true; state.error = ''; state.note = 'Syncing…'; paint();
    // The pin cache lives in IndexedDB now; a sync that ran before it hydrated
    // would upload bookmark ids with no previews and look like data loss.
    try { await window.PB_RUNTIME?.libraryReady?.(); } catch (_) {}
    const before = stable(payload().data);
    try {
      await getToken(interactive);
      let id = s.driveFileId || '', mod = '';
      if (id) {
        const meta = await gfetch(DRIVE + '/files/' + encodeURIComponent(id) + '?fields=modifiedTime');
        if (meta.status === 404) { id = ''; }
        else if (!meta.ok) throw await driveError(meta, 'read');
        else mod = (await meta.json()).modifiedTime;
      }
      if (!id) { const found = await findRemote(); id = found.id; mod = found.mod; }

      const remoteChanged = !!id && mod !== s.driveMod;
      if (remoteChanged) {
        const remote = await readRemote(id);
        if (remote && remote.app === 'pinboard') applyMerged(mergeInto(remote, payload()));
        else if (remote && remote.app && remote.app !== 'pinboard') throw new Error('That Drive file belongs to “' + esc(remote.app) + '”. Nothing was changed.');
      }
      // Upload only when something actually differs, or two devices would keep
      // bouncing the same identical copy back and forth.
      const mine = payload();
      const differs = !id || s.driveDirty || remoteChanged || stable(mine.data) !== before;
      if (differs) {
        const uploaded = await uploadRemote(id, JSON.stringify(mine));
        id = uploaded.id; mod = uploaded.mod;
      }
      s.driveFileId = id; s.driveMod = mod; s.lastSync = Date.now(); s.driveDirty = false;
      s.driveOn = true;
      s.setAt = s.setAt || Date.now();
      saveQuiet();
      state.sig = stable({ data: { bookmarks: s.bookmarks, deleted: tombstones(), boards: s.boards, hidden: s.hidden }, settings: payload().settings });
      if (!state.account) await loadAccount();
      state.note = 'Synced ' + new Date(s.lastSync).toLocaleTimeString();
      if (remoteChanged && typeof window.render === 'function' && !quiet) render();
      paint();
      return true;
    } catch (error) {
      state.error = error.message || 'Sync failed.';
      state.note = '';
      if (error.needGesture) armGesture();
      if (error.reconnect) { dropToken(); drop(TOKEN_KEY); const s2 = S(); s2.driveOn = false; saveQuiet(); }
      paint();
      return false;
    } finally {
      state.busy = false;
      paint();   // the ring must settle the moment the sync is really over
      if (state.resync) { state.resync = false; scheduleSync(true); }
    }
  }
  function armGesture() {
    if (state.armed) return;
    state.armed = true;
    document.addEventListener('pointerdown', () => { state.armed = false; syncNow(true, true); }, { once: true, capture: true });
  }

  /* ---------- what the settings sheet shows -------------------------------- */
  function summary() {
    const s = S();
    if (state.error) return state.error;
    if (!s.driveOn) return clientId() ? 'Not connected. Tap “Connect & sync” to allow Google Drive once.' : 'Paste your Google OAuth Client ID, then tap “Connect & sync”.';
    let text = 'Connected' + (state.account ? ' as ' + state.account : '') + (s.driveAuto ? ' · auto-sync on' : ' · auto-sync off');
    if (s.driveDirty) text += ' · changes waiting';
    if (s.lastSync) text += ' · last sync ' + new Date(s.lastSync).toLocaleString();
    return text + '.';
  }
  /* Shared sync status for the profile control and the Glint header dots:
     red = off or a problem, pulsing green = syncing, steady green = synced. */
  function ringState() {
    const s = S();
    if (state.error || !navigator.onLine) return 'error';
    if (state.busy) return 'busy';
    if (!s.driveOn) return 'off';
    if (s.driveDirty) return 'busy';
    return 'ok';
  }
  const RING_TEXT = {
    off: 'Google Drive sync is off',
    error: 'Google Drive sync has a problem',
    busy: 'Syncing with Google Drive…',
    ok: 'Synced with Google Drive'
  };
  function paintRings() {
    const mode = ringState();
    for (const ring of document.querySelectorAll('[data-drive-ring]')) {
      if (ring.getAttribute('data-drive-ring') !== mode) ring.setAttribute('data-drive-ring', mode);
      ring.setAttribute('title', RING_TEXT[mode]);
    }
    for (const dot of document.querySelectorAll('.glint-live[data-drive-ring]')) dot.setAttribute('aria-label', RING_TEXT[mode]);
    const profile = document.querySelector('#nav [data-v="profile"]');
    if (profile) {
      profile.setAttribute('aria-label', 'Profile · ' + RING_TEXT[mode]);
      profile.dataset.driveState = mode;
    }
  }
  function paint() {
    paintRings();
    const badge = document.querySelector('[data-drive-status]');
    if (badge) { badge.textContent = state.note || summary(); badge.dataset.tone = state.error ? 'error' : state.busy ? 'busy' : S().driveOn ? 'ok' : ''; }
    const button = document.querySelector('[data-a="drivesync"] .drive-connect-label');
    if (button) button.textContent = state.busy ? 'Syncing…' : S().driveOn ? 'Sync now' : 'Connect & sync';
    const toggle = document.querySelector('[data-a="driveauto"]');
    if (toggle) { toggle.classList.toggle('on', !!S().driveAuto); toggle.setAttribute('aria-checked', String(!!S().driveAuto)); }
  }

  /* ---------- public API --------------------------------------------------- */
  const api = {
    get state() { return { ...state, connected: !!S().driveOn, dirty: !!S().driveDirty, auto: !!S().driveAuto, clientId: clientId(), lastSync: Number(S().lastSync) || 0, account: state.account || S().driveEmail || '' }; },
    summary, paint, paintRings, ringState, noteChange,
    /* Tapping the avatar in the nav: an explicit "do it now" from a real tap, so
       a lapsed session may renew itself instead of waiting to be armed. */
    async forceSync() {
      const s = S();
      if (!s.driveOn) { if (typeof window.toast === 'function') toast('Google Drive sync is off.'); return false; }
      clearTimeout(syncTimer);
      s.driveDirty = true;
      const ok = await syncNow(true);
      if (!ok && typeof window.toast === 'function') toast(state.error || 'Sync failed.');
      return ok;
    },
    setClientId(value) { const s = S(); s.driveClientId = String(value || '').trim(); dropToken(); s.driveOn = false; saveQuiet(); paint(); },
    async connect() {
      const s = S();
      if (!clientId()) { if (typeof window.toast === 'function') toast('Add your Google OAuth Client ID first.'); return false; }
      s.driveOn = true;
      saveQuiet();
      const ok = await syncNow(true);
      if (ok && typeof window.toast === 'function') toast('Google Drive sync is on.');
      return ok;
    },
    async backup() {
      const s = S();
      if (!clientId() && !s.driveOn) { if (typeof window.toast === 'function') toast('Connect Google Drive first.'); return false; }
      s.driveDirty = true;
      const ok = await syncNow(true);
      if (typeof window.toast === 'function') toast(ok ? 'Backed up to Google Drive.' : (state.error || 'Backup failed.'));
      return ok;
    },
    async restore() {
      const s = S();
      if (!s.driveOn) { if (typeof window.toast === 'function') toast('Connect Google Drive first.'); return false; }
      const ok = await syncNow(true);
      if (typeof window.toast === 'function') toast(ok ? 'Merged with your Drive copy.' : (state.error || 'Nothing to restore.'));
      return ok;
    },
    toggleAuto() {
      const s = S(); s.driveAuto = !s.driveAuto;
      saveQuiet();
      if (s.driveAuto && s.driveOn) scheduleSync(true);
      paint();
    },
    disconnect() {
      const s = S();
      s.driveOn = false; s.driveFileId = ''; s.driveMod = ''; s.driveDirty = false; s.driveEmail = '';
      dropToken(); state.account = ''; state.note = 'Disconnected. Your Drive copy is untouched.';
      saveQuiet();
      paint();
      if (typeof window.toast === 'function') toast('Drive sync off. Your Drive copy is untouched.');
    },
    reset() { dropToken(); state.account = ''; state.sig = ''; state.error = ''; state.note = ''; }
  };
  window.PB_DRIVE = api;

  /* ---------- background sync --------------------------------------------- */
  function boot() {
    if (!window.S) return;
    cachedToken();
    const original = window.save;
    if (typeof original === 'function' && !original.__driveWrapped) {
      const wrapped = function (...args) { const out = original.apply(this, args); try { noteChange(); } catch (_) {} return out; };
      wrapped.__driveWrapped = true;
      window.save = wrapped;
    }
    document.addEventListener('visibilitychange', () => {
      const s = S();
      if (!s.driveOn || !s.driveAuto) return;
      if (document.visibilityState === 'hidden') { if (s.driveDirty) syncNow(false, true); }
      else if (Date.now() - (Number(s.lastSync) || 0) > 30000) syncNow(false, true);
    });
    window.addEventListener('online', () => { paint(); scheduleSync(true); });
    window.addEventListener('offline', paint);
    setInterval(() => {
      const s = S();
      if (document.visibilityState === 'visible' && s.driveOn && s.driveAuto) syncNow(false, true);
    }, 120000);
    state.sig = stable({ data: { bookmarks: S().bookmarks, deleted: tombstones(), boards: S().boards, hidden: S().hidden }, settings: payload().settings });
    state.bookSig = bookSig(S());
    /* Opening the app always checks Drive once — auto-sync governs changes you
       make afterwards, not "is this copy current". The library store hydrates
       first, so the upload always carries every pinned preview. */
    if (S().driveOn) setTimeout(async () => {
      try { await window.PB_RUNTIME?.libraryReady?.(); } catch (_) {}
      syncNow(false, true);
    }, 900);
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
