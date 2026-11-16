'use strict';
// starnet-berries: the Figma connector (sidecar/mcp/transport.figma.js + catalog row) and the FIGMA viewer's embed URLs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const figma = require('../sidecar/mcp/transport.figma.js');
const catalog = require('../sidecar/mcp/catalog.js');

const KEY = 'BAZsTPbh6W1r66Bdo1234';

test('fileKey accepts keys and figma.com links, refuses anything else', () => {
  assert.strictEqual(figma.fileKey(KEY), KEY);
  assert.strictEqual(figma.fileKey('https://www.figma.com/design/' + KEY + '/My-file?node-id=1-2'), KEY);
  assert.strictEqual(figma.fileKey('https://figma.com/board/' + KEY + '/Board'), KEY);
  assert.strictEqual(figma.fileKey('https://embed.figma.com/proto/' + KEY), KEY);
  for (const bad of ['', 'short', '../../me', 'https://evil.example/design/' + KEY, KEY + '/../x']) assert.throws(() => figma.fileKey(bad));
});

test('requestFor builds api.figma.com requests and normalises node ids', () => {
  const r = figma.requestFor('render_images', { file: KEY, nodeIds: ['1-2', '3:4'], format: 'png', scale: 2 });
  assert.strictEqual(r.url, 'https://api.figma.com/v1/images/' + KEY);
  assert.deepStrictEqual(r.query, { ids: '1:2,3:4', format: 'png', scale: 2 });
  assert.strictEqual(figma.requestFor('whoami', {}).url, 'https://api.figma.com/v1/me');
  const c = figma.requestFor('post_comment', { file: KEY, message: 'hi', nodeId: '5-6' });
  assert.strictEqual(c.method, 'POST');
  assert.deepStrictEqual(c.body, { message: 'hi', client_meta: { node_id: '5:6', node_offset: { x: 0, y: 0 } } });
  assert.throws(() => figma.requestFor('get_nodes', { file: KEY, nodeIds: ['1:2"><x'] }));
});

function fakeFetch(calls, status) {
  return async (url, init) => {
    calls.push({ url, init });
    const text = JSON.stringify(url.endsWith('/me') ? { id: '1', handle: 'me' } : { ok: true });
    return { ok: (status || 200) < 300, status: status || 200, text: async () => text, body: null };
  };
}
async function rpc(t, msg) { let out; t.onMessage(m => { out = m; }); await t.send(Object.assign({ jsonrpc: '2.0', id: 1 }, msg)); return out; }

test('transport: initialize probes /me, tools/call sends the bearer token, bad args are refused', async () => {
  const calls = [];
  const t = figma.makeFigmaTransport({ url: figma.URL_ID, token: 'tok', fetchImpl: fakeFetch(calls) });
  assert.ok((await rpc(t, { method: 'initialize', params: {} })).result.serverInfo);
  assert.strictEqual(calls[0].url, 'https://api.figma.com/v1/me');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.strictEqual((await rpc(t, { method: 'tools/list' })).result.tools.length, figma.TOOLS.length);
  const res = await rpc(t, { method: 'tools/call', params: { name: 'get_file', arguments: { file: KEY, depth: 2 } } });
  assert.strictEqual(res.result.isError, false);
  assert.strictEqual(calls[1].url, 'https://api.figma.com/v1/files/' + KEY + '?depth=2');
  await assert.rejects(t.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_file', arguments: { file: KEY, depth: 99 } } }), /Invalid argument/);
  await assert.rejects(t.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'render_images', arguments: { file: KEY, nodeIds: ['1:2'], scale: 9 } } }), /Invalid argument/);
});

test('transport: a 401 surfaces as connector HTTP 401 so the manager refreshes the token', async () => {
  const t = figma.makeFigmaTransport({ url: figma.URL_ID, token: 'old', fetchImpl: fakeFetch([], 401) });
  await assert.rejects(t.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), /connector HTTP 401/);
  await assert.rejects(figma.makeFigmaTransport({ url: figma.URL_ID, token: '' }).send({ jsonrpc: '2.0', id: 1, method: 'initialize' }), /401/);
});

test('catalog row: pre-registered Figma OAuth with its own refresh endpoint, routed to the local adapter', () => {
  const e = catalog.get('figma');
  assert.ok(e && e.figmaApi && e.authType === 'oauth');
  assert.ok(figma.isFigmaUrl(e.url));
  assert.strictEqual(e.staticOauth.authorizationEndpoint, 'https://www.figma.com/oauth');
  assert.strictEqual(e.staticOauth.tokenEndpoint, 'https://api.figma.com/v1/oauth/token');
  assert.strictEqual(e.staticOauth.refreshEndpoint, 'https://api.figma.com/v1/oauth/refresh');
  assert.ok(!e.staticOauth.scopes.includes('files:read'), 'files:read is deprecated');
});

test('FIGMA viewer: figma.com links become embed.figma.com URLs with embed-host and client-id', () => {
  const ctx = { window: {}, localStorage: null, URL, StationUI: { registerWindow() {}, h: { esc: s => s } } };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'windows', 'figma.js'), 'utf8'), ctx);
  const embedUrl = ctx.StarnetFigmaEmbed.embedUrl;
  const u = new URL(embedUrl('https://www.figma.com/file/' + KEY + '/Name?node-id=1-2', { clientId: 'abc123', embedHost: 'starnet' }));
  assert.strictEqual(u.origin + u.pathname, 'https://embed.figma.com/design/' + KEY + '/Name');
  assert.strictEqual(u.searchParams.get('node-id'), '1-2');
  assert.strictEqual(u.searchParams.get('embed-host'), 'starnet');
  assert.strictEqual(u.searchParams.get('client-id'), 'abc123');
  assert.strictEqual(new URL(embedUrl('https://www.figma.com/proto/' + KEY, {})).searchParams.get('client-id'), null);
  for (const bad of ['javascript:alert(1)', 'https://evil.example/design/' + KEY, 'https://www.figma.com/community/file/1', 'http://www.figma.com/design/' + KEY]) assert.strictEqual(embedUrl(bad, {}), null);
});
