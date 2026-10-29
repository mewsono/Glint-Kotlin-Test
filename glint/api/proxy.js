/* Vercel: same private-account contract as the local and Netlify proxy.
   CommonJS on purpose — the repo has a package.json without "type": "module",
   so both the Vercel handler and netlify/functions/proxy.js load the same way. */
const proxy = require('../proxy-core.cjs');
module.exports = async function handler(req, res) {
  const r = await proxy.handleProxy(req.method, req.query.u || '', req.body);
  for (const [name, value] of Object.entries(r.headers)) res.setHeader(name, value);
  res.status(r.statusCode).send(r.body);
};
module.exports.default = module.exports;   // both `require` and ESM interop reach it
