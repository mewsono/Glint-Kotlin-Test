/* Regression coverage for service-worker version cleanup and exact cache URLs. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const alias = fs.readFileSync(path.join(root, 'Glint.html'), 'utf8');
assert.equal(alias, entry, 'Glint.html stays byte-identical to index.html');

const names = new Set([
  'glint-v2-redesign-62-static',
  'glint-v2-redesign-63-static',
  'glint-v2-redesign-63-runtime',
  'glint-v2-redesign-64-static',
  'glint-v2-redesign-64-runtime',
  'glint-v2-redesign-65-static',
  'glint-v2-redesign-65-runtime',
  'glint-v2-redesign-66-static',
  'glint-v2-redesign-66-runtime',
  'glint-v2-redesign-67-static',
  'glint-v2-redesign-67-runtime',
  'glint-v2-redesign-68-static',
  'glint-v2-redesign-68-runtime',
  'glint-v2-redesign-69-static',
  'glint-v2-redesign-69-runtime',
  'glint-v2-redesign-70-static',
  'glint-v2-redesign-70-runtime',
  'glint-v2-redesign-71-static',
  'glint-v2-redesign-71-runtime',
  'glint-v2-redesign-72-static',
  'glint-v2-redesign-72-runtime',
  'glint-v2-redesign-73-static',
  'glint-v2-redesign-73-runtime',
  'glint-v2-redesign-74-static',
  'glint-v2-redesign-74-runtime',
  'glint-v2-redesign-75-static',
  'glint-v2-redesign-75-runtime',
  'glint-v2-redesign-76-static',
  'glint-v2-redesign-76-runtime',
  'pinboard-v65-static',
  'pinboard-img-v1',
  'pinboard-api-v1',
  'unrelated-app-cache'
]);
const deleted = [];
const requestUrls = new Map();
const cacheFor = name => ({
  async put(request) {
    if (!requestUrls.has(name)) requestUrls.set(name, []);
    requestUrls.get(name).push(typeof request === 'string' ? request : request.url);
  },
  async keys() { return []; },
  async delete() { return true; }
});
const caches = {
  async keys() { return [...names]; },
  async open(name) { names.add(name); return cacheFor(name); },
  async delete(name) { deleted.push(name); names.delete(name); return true; }
};
const listeners = {};
const self = {
  location: { href: 'https://glint.test/sw.js' },
  clients: { async claim() {} },
  addEventListener(name, fn) { listeners[name] = fn; }
};
const sandbox = {
  self, caches, Request, Response, URL,
  fetch: async () => new Response('ok', { status: 200 }),
  console
};
vm.runInNewContext(workerSource, sandbox, { filename: 'sw.js' });

(async () => {
  const installTasks = [];
  listeners.install({ waitUntil(task) { installTasks.push(task); } });
  await Promise.all(installTasks);
  const cachedUrls = requestUrls.get('glint-v2-redesign-76-static') || [];
  assert.ok(cachedUrls.includes('https://glint.test/styles.css?v=74'), 'precache the current stylesheet URL');
  assert.ok(!cachedUrls.includes('https://glint.test/styles.css?v=69'), 'do not precache the stale stylesheet URL');
  assert.ok(cachedUrls.includes('https://glint.test/app.js?v=75'), 'precache the current app script URL');
  assert.ok(!cachedUrls.includes('https://glint.test/app.js?v=69'), 'do not precache the stale app script URL');

  const activateTasks = [];
  listeners.activate({ waitUntil(task) { activateTasks.push(task); } });
  await Promise.all(activateTasks);
  assert.ok(deleted.includes('glint-v2-redesign-62-static'));
  assert.ok(deleted.includes('glint-v2-redesign-63-static'));
  assert.ok(deleted.includes('glint-v2-redesign-63-runtime'));
  assert.ok(deleted.includes('pinboard-v65-static'));
  assert.ok(deleted.includes('glint-v2-redesign-64-static'));
  assert.ok(deleted.includes('glint-v2-redesign-64-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-65-static'));
  assert.ok(deleted.includes('glint-v2-redesign-65-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-66-static'));
  assert.ok(deleted.includes('glint-v2-redesign-66-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-67-static'));
  assert.ok(deleted.includes('glint-v2-redesign-67-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-68-static'));
  assert.ok(deleted.includes('glint-v2-redesign-68-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-69-static'));
  assert.ok(deleted.includes('glint-v2-redesign-69-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-70-static'));
  assert.ok(deleted.includes('glint-v2-redesign-70-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-71-static'));
  assert.ok(deleted.includes('glint-v2-redesign-71-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-72-static'));
  assert.ok(deleted.includes('glint-v2-redesign-72-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-73-static'));
  assert.ok(deleted.includes('glint-v2-redesign-73-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-74-static'));
  assert.ok(deleted.includes('glint-v2-redesign-74-runtime'));
  assert.ok(deleted.includes('glint-v2-redesign-75-static'));
  assert.ok(deleted.includes('glint-v2-redesign-75-runtime'));
  assert.ok(!deleted.includes('glint-v2-redesign-76-static'));
  assert.ok(!deleted.includes('glint-v2-redesign-76-runtime'));
  assert.ok(!deleted.includes('pinboard-img-v1'), 'retain reusable media cache');
  assert.ok(!deleted.includes('pinboard-api-v1'), 'retain public API cache');
  assert.ok(!deleted.includes('unrelated-app-cache'), 'leave unrelated origin caches alone');
  console.log('PASS service-worker precaches the exact current stylesheet and removes obsolete Glint shell/runtime caches without deleting current, media, API or unrelated caches.');
})().catch(error => { console.error(error); process.exitCode = 1; });
