import proxy from "../../proxy-core.cjs";
import media from "../../media-stream.cjs";

async function readBoundedBody(request, limit) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw new RangeError("Request body is too large.");
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError("Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function responseFrom(result) {
  const body = result.statusCode === 204 || result.statusCode === 304 ? null : result.body;
  return new Response(body, { status: result.statusCode, headers: result.headers });
}

const MEDIA_EXT = /\.(?:jpe?g|png|webp|gif|avif|bmp|svg|mp4|webm|m4v|mov|mkv|m3u8|ts)$/i;
const MEDIA_CSP = "default-src 'none'; sandbox; frame-ancestors 'none'";
async function streamMedia(request, target) {
  try {
    proxy.validateTarget(target);
    const upstream = await media.openMedia(target, request.headers.get("range"));
    const headers = new Headers({
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Accept, Range",
      "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges",
      "cache-control": "no-store, private",
      "content-security-policy": MEDIA_CSP,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
      "content-type": upstream.headers.get("content-type") || "application/octet-stream"
    });
    for (const name of ["content-length", "content-range", "last-modified", "etag"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    const body = [204, 304].includes(upstream.status) ? null : upstream.body;
    return new Response(body, { status: upstream.status, headers });
  } catch (_) {
    return responseFrom(proxy.reply(502, JSON.stringify({ error: "Media source failed or returned an unsafe redirect." })));
  }
}

export async function onRequest({ request }) {
  let body = null;
  if (request.method === "POST") {
    try {
      body = await readBoundedBody(request, proxy.maxRequestBytes);
    } catch (error) {
      if (!(error instanceof RangeError)) {
        return responseFrom(proxy.reply(400, JSON.stringify({ error: "Invalid request body." })));
      }
      return responseFrom(proxy.reply(413, JSON.stringify({ error: "Request is too large." })));
    }
  }

  const target = new URL(request.url).searchParams.get("u") || "";
  let mediaTarget = false;
  try { mediaTarget = MEDIA_EXT.test(new URL(target).pathname); } catch (_) {}
  if (request.method === "GET" && (mediaTarget || request.headers.has("range"))) {
    return streamMedia(request, target);
  }
  const result = await proxy.handleProxy(request.method, target, body);
  return responseFrom(result);
}
