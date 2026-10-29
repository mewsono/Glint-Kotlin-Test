#!/usr/bin/env node
/* Which sources actually answer from *this* network?
 *
 *   npm run check:sources              # every source, through proxy-core (no server needed)
 *   npm run check:sources -- danbooru  # only the ones you name
 *
 * It prints the HTTP status of the same list request the app makes, so a source
 * that 403s here 403s in the app too — the difference is the network, not the app.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const proxy = require("../proxy-core.cjs");

const ENDPOINTS = {
  danbooru: "https://danbooru.donmai.us/posts.json?limit=5",
  safebooru: "https://safebooru.donmai.us/posts.json?limit=5",
  yandere: "https://yande.re/post.json?limit=5",
  konachan: "https://konachan.com/post.json?limit=5",
  sakugabooru: "https://www.sakugabooru.com/post.json?limit=5",
  e621: "https://e621.net/posts.json?limit=5",
  derpibooru: "https://derpibooru.org/api/v1/json/search/images?q=*&per_page=5",
  ponybooru: "https://ponybooru.org/api/v1/json/search/images?q=*&per_page=5",
  animepictures: "https://api.anime-pictures.net/api/v3/posts?page=0&lang=en",
  eshuushuu: "https://e-shuushuu.net/api/v1/images?page=1&per_page=5",
  gelbooru: "https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=5",
};

const WHY = status =>
  status === 200 ? "ok" :
  status === 401 ? "needs an account key" :
  status === 403 ? "denied — Cloudflare challenge or this network's IP is blocked" :
  status === 404 ? "endpoint moved" :
  status === 429 ? "rate-limited — wait a minute" :
  status === 502 ? "unreachable from here" :
  `status ${status}`;

const pick = process.argv.slice(2).filter(a => !a.startsWith("-"));
const names = pick.length ? pick.filter(n => ENDPOINTS[n]) : Object.keys(ENDPOINTS);
if (pick.length && names.length !== pick.length) {
  console.error("Unknown source(s):", pick.filter(n => !ENDPOINTS[n]).join(", "));
  console.error("Known:", Object.keys(ENDPOINTS).join(", "));
  process.exit(2);
}

console.log(`Pinboard source check · User-Agent: ${"Mozilla/5.0 (compatible; Pinboard/65)"}…\n`);
const rows = [];
for (const name of names) {
  const started = Date.now();
  const answer = await proxy.handleProxy("GET", ENDPOINTS[name], null);
  const ms = Date.now() - started;
  let items = "";
  if (answer.statusCode === 200) {
    try {
      const text = answer.body.toString("utf8");
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data
        : data.posts || data.images || data.tags || null;
      items = list ? `${list.length} records` : "200 (shape not a list)";
    } catch (e) { items = "200 but not JSON"; }
  }
  rows.push({ name, status: answer.statusCode, ms, note: answer.statusCode === 200 ? items : WHY(answer.statusCode) });
  console.log(`${name.padEnd(14)} ${String(answer.statusCode).padEnd(4)} ${String(ms + " ms").padEnd(8)} ${rows.at(-1).note}`);
}

const bad = rows.filter(r => r.status !== 200);
console.log(`\n${rows.length - bad.length}/${rows.length} sources reachable${bad.length ? " · failing: " + bad.map(r => `${r.name} (${r.status})`).join(", ") : ""}.`);
if (bad.some(r => r.status === 403)) {
  console.log("A 403 here is the site's own answer to this network, not an app bug: the same request answers 200 from another connection.");
}
process.exit(bad.length ? 1 : 0);
