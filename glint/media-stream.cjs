/* Safe, streaming media transport for the local Node preview server.
 * Every redirect is revalidated against the shared HTTPS host allow-list before
 * another request is made. Do not use fetch's automatic redirect handling here:
 * an allowed CDN URL can redirect to an arbitrary/private host. */
'use strict';
const proxy = require('./proxy-core.cjs');
const UA = 'Mozilla/5.0 (compatible; Pinboard/65; +https://github.com/khoadng/Boorusama)';
const SECRET = /^(login|api_key|key|user_api_key|password_hash|pass_hash|password|token|access_token|refresh_token)$/i;
const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 25_000;

function hasSensitiveQuery(url) {
  return [...url.searchParams.keys()].some(key => SECRET.test(key));
}

function idleBoundBody(response, controller) {
  if (!response.body?.getReader || typeof ReadableStream === 'undefined') return response;
  const reader = response.body.getReader();
  const body = new ReadableStream({
    async pull(destination) {
      let timer;
      const failIdle = () => {
        const error = new Error('Media source stopped responding');
        controller.abort(error);
        reader.cancel(error).catch(() => {});
        destination.error(error);
      };
      timer = setTimeout(failIdle, CONNECT_TIMEOUT_MS);
      try {
        const { done, value } = await reader.read();
        clearTimeout(timer);
        if (done) destination.close();
        else destination.enqueue(value);
      } catch (error) {
        clearTimeout(timer);
        destination.error(error);
      }
    },
    async cancel(reason) {
      controller.abort(reason);
      await reader.cancel(reason);
    }
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function openMedia(target, range, fetchImpl = globalThis.fetch) {
  let current = proxy.validateTarget(target).href;
  const initial = new URL(current);
  // Never follow a URL that may carry account credentials to a second host.
  let privateTarget = hasSensitiveQuery(initial);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = proxy.validateTarget(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: url.origin + '/',
          ...(range ? { Range: range } : {})
        },
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers?.get?.('location');
    if (!privateTarget && response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, url);
      // Validate before any request to the redirected host. This rejects HTTP,
      // IP literals, private hosts, nonstandard ports and non-allow-listed CDNs.
      try { proxy.validateTarget(next.href); }
      catch (error) { try { await response.body?.cancel?.(); } catch (_) {} throw error; }
      try { await response.body?.cancel?.(); } catch (_) {}
      if (hop === MAX_REDIRECTS) throw new Error('Too many media redirects');
      privateTarget = privateTarget || hasSensitiveQuery(next);
      current = next.href;
      continue;
    }
    return idleBoundBody(response, controller);
  }
  throw new Error('Too many media redirects');
}

module.exports = { openMedia, hasSensitiveQuery, MAX_REDIRECTS };
