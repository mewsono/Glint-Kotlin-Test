/* Pinboard dev server — Node only, no dependencies.
 *
 * `npm start` used to mean "run a static file server", which cannot work: the
 * app fetches every booru through `/api/proxy`, so a plain static host answers
 * 404 for the feed and the grid stays empty. This file is the same server as
 * `server.py` — static files from the same allow-list plus `/api/proxy` — but
 * in Node, so `npm start` is enough.
 *
 *   npm start                 # http://localhost:8000
 *   PORT=8080 npm start
 *   PINBOARD_TEST_MODE=1 npm start   # same relaxations the Python QA server has
 *
 * The allow-list, validation, auth rules and bounded bodies come from
 * `proxy-core.cjs` (the same module Vercel and Netlify use), so there is one
 * security implementation, not three. Media (videos, anything a player ranges)
 * is streamed with its Range header passed through instead of being buffered.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const proxy = require("./proxy-core.cjs");
const { openMedia } = require("./media-stream.cjs");
const POLICY = require("./proxy-policy.json");
const SECURITY = require("./web-security.json");

const PORT = Number(process.env.PORT || 8000);
const TEST_MODE = process.env.PINBOARD_TEST_MODE === "1";
const UA = "Mozilla/5.0 (compatible; Pinboard/65; +https://github.com/khoadng/Boorusama)";
const PROXY_CSP = "default-src 'none'; sandbox; frame-ancestors 'none'";
const MAX_BODY = Number(POLICY.max_response_bytes) || 64 * 1024 * 1024;
const MEDIA = /\.(?:jpe?g|png|webp|gif|avif|bmp|svg|mp4|webm|m4v|mov|mkv|m3u8|ts)$/i;

/* Static surface — identical to server.py: no directory listings, no source
   files other than the shell the browser actually needs. */
const STATIC_FILES = new Set([
  "/", "/Glint.html", "/index.html", "/styles.css", "/app.js", "/sources.js", "/runtime.js",
  "/drive.js", "/boot.js", "/pwa.js", "/sw.js", "/manifest.webmanifest",
  "/offline.html", "/README.md", "/SOURCE-ACCOUNTS.md", "/QA-v65.md"
]);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};

function staticFile(urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  if (STATIC_FILES.has(p)) return p === "/" ? "/index.html" : p;
  if (/^\/icons\/[A-Za-z0-9_-]+\.(?:png|svg)$/.test(p)) return p;
  if (TEST_MODE && /^\/_[A-Za-z0-9_-]+\.js$/.test(p)) return p;
  return null;
}

function securityHeaders(isProxy) {
  const out = {};
  for (const [name, value] of Object.entries(SECURITY)) {
    if (isProxy && name.toLowerCase() === "content-security-policy") continue;
    out[name] = TEST_MODE && name.toLowerCase() === "content-security-policy"
      ? String(value).replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")
      : value;
  }
  return out;
}

function refuse(res, status, message) {
  const body = Buffer.from(JSON.stringify({ error: message }));
  res.writeHead(status, {
    ...securityHeaders(true), "content-type": "application/json",
    "cache-control": "no-store, private", "content-length": body.length,
    "access-control-allow-origin": "*",
    "content-security-policy": PROXY_CSP
  });
  res.end(body);
}

/* Media and anything the player ranges: stream through, never buffer. */
async function streamMedia(target, range, res) {
  const upstream = await openMedia(target, range);
  const headers = {
    ...securityHeaders(true),
    "access-control-allow-origin": "*", 
    "access-control-allow-headers": "Content-Type, Accept, Range",
    "access-control-expose-headers": "Content-Length, Content-Range, Accept-Ranges",
    "cache-control": "no-store, private",
    "content-security-policy": PROXY_CSP,
    "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
    "content-type": upstream.headers.get("content-type") || "application/octet-stream"
  };
  for (const name of ["content-length", "content-range", "last-modified", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  res.writeHead(upstream.status, headers);
  if (!upstream.body) return res.end();
  const cancelUpstream = () => { if (!res.writableEnded) upstream.body.cancel?.().catch(() => {}); };
  res.once("close", cancelUpstream);
  try {
    for await (const chunk of upstream.body) {
      if (res.destroyed) return;
      if (!res.write(Buffer.from(chunk))) {
        await new Promise(resolve => {
          const ready = () => { res.off("drain", ready); res.off("close", ready); resolve(); };
          res.once("drain", ready); res.once("close", ready);
        });
        if (res.destroyed) return;
      }
    }
    res.end();
  } finally {
    res.off("close", cancelUpstream);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const isProxy = url.pathname === "/api/proxy";

  if (isProxy) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "Content-Type, Accept, Range",
        "access-control-allow-methods": "GET,POST,OPTIONS", "content-length": "0"
      });
      return res.end();
    }
    try {
      let body = null;
      if (req.method === "POST") {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > Number(POLICY.max_request_bytes || 128 * 1024)) return refuse(res, 413, "Request is too large.");
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const target = url.searchParams.get("u") || "";
      const range = req.headers.range;
      const isMedia = MEDIA.test(new URL(target, "https://example.invalid").pathname);
      if (isMedia || range) {
        try { proxy.validateTarget(target); } // same allow-list, same refusals
        catch { return refuse(res, 403, "Only allow-listed HTTPS source URLs are permitted."); }
        try { return await streamMedia(target, range, res); }
        catch {
          if (res.headersSent) { res.destroy(); return; }
          return refuse(res, 502, "Media source failed or returned an unsafe redirect.");
        }
      }
      // Refuse a bad target before anything else, with the same 403 the Python
      // server answers (the serverless handler folds this into its 502).
      if (target) proxy.validateTarget(target);
      const answer = await proxy.handleProxy(req.method, target, body);
      res.writeHead(answer.statusCode, { ...answer.headers, "content-length": answer.body.length });
      return res.end(answer.body);
    } catch (error) {
      return refuse(res, 403, "Only allow-listed HTTPS source URLs are permitted.");
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") return refuse(res, 404, "Not found.");
  const file = staticFile(url.pathname);
  if (!file) return refuse(res, 404, "Not found.");
  const disk = path.join(ROOT, file);
  let stat;
  try { stat = fs.statSync(disk); } catch (e) { return refuse(res, 404, "Not found."); }
  if (!stat.isFile()) return refuse(res, 404, "Not found.");
  const headers = {
    ...securityHeaders(false),
    "content-type": TYPES[path.extname(disk)] || "application/octet-stream",
    "content-length": stat.size,
    "service-worker-allowed": "/"
  };
  if (/\.(?:html|js|css|webmanifest)$/.test(disk) || file === "/index.html") {
    headers["cache-control"] = "no-cache, max-age=0, must-revalidate";
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(disk).pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Glint on http://localhost:${PORT}  (static + /api/proxy, allow-list ${POLICY.hosts.length} hosts)`);
});
