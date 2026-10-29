/* Cloudflare Pages media route tests with mocked upstream fetches. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const file = path.resolve(__dirname, '../functions/api/proxy.js');
const moduleText = fs.readFileSync(file, 'utf8')
  .replace('from "../../proxy-core.cjs"', `from "${pathToFileURL(path.resolve(__dirname, '../proxy-core.cjs')).href}"`)
  .replace('from "../../media-stream.cjs"', `from "${pathToFileURL(path.resolve(__dirname, '../media-stream.cjs')).href}"`);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleText).toString('base64')}`;

(async () => {
  const { onRequest } = await import(moduleUrl);
  const originalFetch = globalThis.fetch;
  try {
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      if (requests.length === 1) return new Response(null, { status: 302, headers: { location: 'https://files.yande.re/sample.mp4?part=1' } });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('streamed media')); controller.close(); } }), {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-length': '14', 'content-range': 'bytes 0-13/100', 'accept-ranges': 'bytes' }
      });
    };
    const target = 'https://static1.e621.net/sample.mp4';
    const request = new Request('https://glint.test/api/proxy?u=' + encodeURIComponent(target), { headers: { Range: 'bytes=0-13' } });
    const response = await onRequest({ request });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), 'streamed media');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.redirect, 'manual');
    assert.equal(requests[0].options.headers.Range, 'bytes=0-13');
    assert.equal(requests[1].options.headers.Range, 'bytes=0-13');
    assert.equal(response.headers.get('content-range'), 'bytes 0-13/100');
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    assert.match(response.headers.get('content-security-policy'), /sandbox/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

    let unsafeRequests = 0;
    globalThis.fetch = async () => {
      unsafeRequests++;
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private.jpg' } });
    };
    const imageTarget = 'https://static1.e621.net/large.jpg';
    const imageResponse = await onRequest({ request: new Request('https://glint.test/api/proxy?u=' + encodeURIComponent(imageTarget)) });
    assert.equal(imageResponse.status, 502, 'unsafe media redirects return a bounded generic failure');
    assert.equal(unsafeRequests, 1, 'do not request an unsafe redirect destination');

    let imageStreamed = false;
    globalThis.fetch = async (_url, options) => {
      imageStreamed = options.redirect === 'manual';
      return new Response('image bytes', { status: 200, headers: { 'content-type': 'image/jpeg' } });
    };
    const image = await onRequest({ request: new Request('https://glint.test/api/proxy?u=' + encodeURIComponent(imageTarget)) });
    assert.equal(image.status, 200);
    assert.equal(imageStreamed, true, 'ordinary images are streamed rather than buffered under the JSON size cap');
    assert.equal(await image.text(), 'image bytes');
    console.log('PASS Pages serves ranged video and proxied images as safe streams; every redirect remains allow-listed; CORS/range metadata, sandbox CSP and private no-store headers stay in place. No real network.');
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
