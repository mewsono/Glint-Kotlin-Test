import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const files = [
  "index.html",
  "Glint.html",
  "offline.html",
  "styles.css",
  "app.js",
  "boot.js",
  "drive.js",
  "runtime.js",
  "sources.js",
  "pwa.js",
  "sw.js",
  "manifest.webmanifest",
  "_headers"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) await cp(path.join(root, file), path.join(output, file));
await cp(path.join(root, "icons"), path.join(output, "icons"), { recursive: true });
console.log(`Cloudflare Pages assets prepared in ${path.relative(root, output)} (${files.length} files + icons).`);
