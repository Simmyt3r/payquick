// Run from v2/frontend with npm run test:services or in GitHub CI.
// No Vercel account, database, secrets or backend startup required.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const load = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const config = JSON.parse(load('../../../vercel.json'));
const services = config.services || {};
assert.deepEqual(Object.keys(services).sort(), ['backend', 'frontend']);
assert.equal(services.backend.root, 'v2/backend');
assert.equal(services.backend.framework, 'flask');
assert.equal(services.backend.entrypoint, 'app:app');
assert.equal(services.frontend.root, 'v2/frontend');
assert.equal(services.frontend.framework, 'vite');
for (const key of ['functions', 'buildCommand', 'installCommand', 'outputDirectory', 'framework']) {
  assert.equal(Object.hasOwn(config, key), false, 'Invalid top-level runtime key: ' + key);
}
for (const [name, service] of Object.entries(services)) {
  for (const binding of service.bindings || []) {
    assert.equal(binding.type, 'service');
    assert.equal(binding.format, 'url');
    assert.ok(services[binding.service], name + ' references unknown service');
    assert.match(binding.env, /^[A-Z_][A-Z_0-9]*$/);
  }
}
assert.deepEqual(services.backend.bindings || [], [], 'Flask must not call Vite server');
assert.deepEqual(services.frontend.bindings || [], [], 'Browser code cannot use a runtime service binding');
const rules = config.rewrites;
assert.equal(rules.at(-1).source, '/(.*)', 'Catch-all must be last');
function destination(path) {
  for (const route of rules) {
    const pattern = new RegExp('^' + route.source + '$');
    if (pattern.test(path)) return route.destination;
  }
  return null;
}
assert.equal(destination('/api/health')?.service, 'backend');
assert.equal(destination('/api/auth/login')?.service, 'backend');
assert.equal(destination('/api/vtu/catalog')?.service, 'backend');
assert.equal(destination('/api/webhooks/paystack')?.service, 'backend');
for (const path of ['/login', '/register', '/app', '/setup', '/admin']) {
  assert.deepEqual(destination(path), {service:'frontend', path:'/index.html'});
}
for (const path of ['/', '/assets/app.js', '/icon.svg', '/manifest.webmanifest']) {
  assert.equal(destination(path)?.service, 'frontend');
}
const backend = load('../../backend/app.py');
assert.match(backend, /@app\.get\("\/api\/health"\)/);
assert.match(backend, /@app\.post\("\/api\/auth\/login"\)/);
const api = load('../src/api.ts');
assert.match(api, /nativeClient \? nativeApiOrigin : ''/);
assert.match(api, /'\/api' \+ path/);
assert.ok(!api.includes("baseUrl + '/api'"), 'Web must not bypass the service rewrite');
const vite = load('../vite.config.ts');
assert.ok(vite.includes("target: 'http://localhost:5000'"), 'Local npm dev proxy remains available');
console.log('PASS: Vercel multi-service paths, Flask routes, PWA deep links and same-origin browser API.');
