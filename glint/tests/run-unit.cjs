/* Run local-only Node regression tests. Network-backed/live tests are excluded. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = __dirname;
const excluded = new Set(['danbooru-live.test.cjs']);
const files = fs.readdirSync(root)
  .filter(name => name.endsWith('.test.cjs') && !excluded.has(name))
  .sort();
let failed = 0;
console.log(`Running ${files.length} offline Node suites; live-source tests are excluded.`);
for (const name of files) {
  const result = spawnSync(process.execPath, [path.join(root, name)], { stdio: 'inherit' });
  if (result.error) {
    console.error(`${name}: ${result.error.message}`);
    failed++;
  } else if (result.status !== 0) {
    console.error(`${name}: FAILED (exit ${result.status ?? 'signal'})`);
    failed++;
  }
}
console.log(`${files.length - failed}/${files.length} offline Node suites passed.`);
if (failed) process.exitCode = 1;
