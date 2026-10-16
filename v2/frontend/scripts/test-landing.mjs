/**
 * Real server-side render of the *public* root with no backend configuration.
 * This test intentionally runs WITHOUT database, Paystack or VTpass variables.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

delete process.env.VITE_API_URL;
delete process.env.DATABASE_URL;
delete process.env.PAYSTACK_SECRET_KEY;
delete process.env.VTPASS_API_KEY;
delete process.env.VTPASS_SECRET_KEY;

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { default: App } = await server.ssrLoadModule('/src/App.tsx');
  const html = renderToString(React.createElement(App));

  for (const text of [
    'All your bills.',
    'Everything you pay for',
    'How it works',
    'Airtime',
    'Data bundles',
    'Electricity',
    'Cable TV',
    'Wallet',
    'Get started',
    'Development preview',
  ]) {
    assert.ok(html.includes(text), 'Static homepage is missing: ' + text);
  }

  // API keys and endpoints are never needed by the public homepage.
  assert.equal(html.includes('/api/'), false);
  assert.equal(html.includes('sk_test_'), false);
  assert.equal(html.includes('DATABASE_URL'), false);
  assert.ok(html.includes('Illustrative balance'));
  console.log('PASS: Public homepage server-renders without any backend or environment variables.');
} finally {
  await server.close();
}
