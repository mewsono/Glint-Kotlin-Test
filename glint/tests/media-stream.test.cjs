/* Media redirect policy tests use fake responses only; no source traffic. */
'use strict';
const assert = require('node:assert/strict');
const { openMedia } = require('../media-stream.cjs');

const redirect = location => ({
  status: 302,
  headers: { get(name) { return name.toLowerCase() === 'location' ? location : null; } },
  body: { cancelled: false, async cancel() { this.cancelled = true; } }
});
const ok = status => ({ status, headers: { get() { return null; } }, body: null });

(async () => {
  const allowedCalls = [];
  const final = ok(206);
  const result = await openMedia('https://static1.e621.net/a.mp4', 'bytes=0-99', async (url, options) => {
    allowedCalls.push({ url, options });
    return allowedCalls.length === 1 ? redirect('https://files.yande.re/a.mp4?part=1') : final;
  });
  assert.equal(result, final);
  assert.equal(allowedCalls.length, 2);
  assert.equal(allowedCalls[0].options.headers.Range, 'bytes=0-99');
  assert.equal(allowedCalls[0].options.redirect, 'manual');
  assert.equal(allowedCalls[1].options.headers.Range, 'bytes=0-99');
  assert.equal(allowedCalls[1].options.headers.Referer, 'https://files.yande.re/');

  for (const location of [
    'https://evil.example/a.mp4',
    'http://127.0.0.1/private.mp4',
    'https://static1.e621.net:8443/a.mp4'
  ]) {
    let requests = 0;
    await assert.rejects(
      openMedia('https://static1.e621.net/a.mp4', null, async () => {
        requests++;
        return redirect(location);
      }),
      /(Invalid source URL|allow-listed HTTPS source URLs)/
    );
    assert.equal(requests, 1, `unsafe redirect must be rejected before a second request: ${location}`);
  }

  let secretCalls = 0;
  await openMedia('https://static1.e621.net/a.mp4?token=secret', null, async () => {
    secretCalls++;
    return redirect('https://files.yande.re/a.mp4?token=secret');
  });
  assert.equal(secretCalls, 1, 'credential-bearing media URLs never follow redirects');

  let hops = 0;
  await assert.rejects(openMedia('https://static1.e621.net/a.mp4', null, async () => {
    hops++;
    return redirect('/redirect.mp4');
  }), /Too many media redirects/);
  assert.equal(hops, 6, 'redirect chain is capped at five redirects');
  console.log('PASS media streaming revalidates every redirect, refuses private/disallowed targets, limits hops and does not forward credential-bearing URLs. No real network.');
})().catch(error => { console.error(error); process.exitCode = 1; });
