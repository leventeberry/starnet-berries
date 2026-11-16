'use strict';
/* starnet-berries: local MCP adapter over Figma's REST API (api.figma.com/v1), the same shape as
   transport.google.js (initialize / tools/list / tools/call). The Commander signs in once with the station's
   pre-registered Figma OAuth app (catalog row `figma`, client from STARNET_FIGMA_OAUTH_CLIENT_ID/_SECRET);
   the connector manager owns the token, refresh, permissions and tool projection. No hosted intermediary. */
const google = require('./transport.google.js');

const API = 'https://api.figma.com/v1';
const URL_ID = API + '#starnet-figma';
const STR = { type: 'string' };
const FILE = { type: 'string', description: 'A Figma file key, or a figma.com file/design/board/proto URL.' };
const IDS = { type: 'array', items: STR, minItems: 1, maxItems: 100, description: 'Node IDs such as "1:2" (a URL\'s node-id=1-2 also works).' };
function tool(name, description, properties, required, readOnly) {
  return { name, description, inputSchema: { type: 'object', properties, required: required || [], additionalProperties: false },
    annotations: { readOnlyHint: !!readOnly, destructiveHint: false, openWorldHint: true } };
}
const TOOLS = [
  tool('whoami', 'Show the Figma account StarNet is signed in as.', {}, [], true),
  tool('get_file', 'Read a Figma file\'s document tree. Large files are big: pass depth (1 = pages only, 2 = top-level frames) or nodeIds to narrow it.', { file: FILE, depth: { type: 'integer', minimum: 1, maximum: 10 }, nodeIds: IDS, version: STR }, ['file'], true),
  tool('get_nodes', 'Read specific nodes (frames, components, layers) of a Figma file, with their full subtrees.', { file: FILE, nodeIds: IDS, depth: { type: 'integer', minimum: 1, maximum: 10 } }, ['file', 'nodeIds'], true),
  tool('get_file_meta', 'Read a Figma file\'s metadata: name, owner, last modified, editor type, thumbnail.', { file: FILE }, ['file'], true),
  tool('render_images', 'Render nodes of a Figma file as images. Returns temporary download URLs (valid about 30 days) per node ID.', { file: FILE, nodeIds: IDS, format: { type: 'string', enum: ['png', 'jpg', 'svg', 'pdf'] }, scale: { type: 'number', minimum: 0.01, maximum: 4 } }, ['file', 'nodeIds'], true),
  tool('list_versions', 'List the version history of a Figma file.', { file: FILE }, ['file'], true),
  tool('list_components', 'List the published components in a Figma file.', { file: FILE }, ['file'], true),
  tool('list_comments', 'Read the comments on a Figma file.', { file: FILE }, ['file'], true),
  tool('post_comment', 'Post a comment on a Figma file as the signed-in user (visible to everyone with access). Pass replyTo to answer an existing comment, or nodeId to pin it to a node.', { file: FILE, message: STR, replyTo: STR, nodeId: STR }, ['file', 'message'])
];

function fileKey(value) {
  const s = String(value || '').trim();
  const m = /^https:\/\/(?:www\.|embed\.)?figma\.com\/(?:file|design|board|proto|slides|deck)\/([A-Za-z0-9]+)/.exec(s);
  const key = m ? m[1] : s;
  if (!/^[A-Za-z0-9]{10,64}$/.test(key)) throw new Error('Invalid argument: file (expected a Figma file key or figma.com URL)');
  return key;
}
const nodeId = v => { const s = String(v).trim().replace(/^(\d+)-(\d+)$/, '$1:$2'); if (!/^[A-Za-z0-9:;_-]{1,128}$/.test(s)) throw new Error('Invalid node ID'); return s; };
const nodeList = a => a.map(nodeId).join(',');

function requestFor(name, a) {
  if (name === 'whoami') return { url: API + '/me' };
  const f = API + '/files/' + fileKey(a.file);
  if (name === 'get_file') return { url: f, query: { depth: a.depth, ids: a.nodeIds && nodeList(a.nodeIds), version: a.version } };
  if (name === 'get_nodes') return { url: f + '/nodes', query: { ids: nodeList(a.nodeIds), depth: a.depth } };
  if (name === 'get_file_meta') return { url: f + '/meta' };
  if (name === 'render_images') return { url: API + '/images/' + fileKey(a.file), query: { ids: nodeList(a.nodeIds), format: a.format, scale: a.scale } };
  if (name === 'list_versions') return { url: f + '/versions' };
  if (name === 'list_components') return { url: f + '/components' };
  if (name === 'list_comments') return { url: f + '/comments' };
  if (name === 'post_comment') {
    if (!a.message.trim() || a.message.length > 10000) throw new Error('Invalid argument: message');
    const body = { message: a.message };
    if (a.replyTo) body.comment_id = nodeId(a.replyTo);
    else if (a.nodeId) body.client_meta = { node_id: nodeId(a.nodeId), node_offset: { x: 0, y: 0 } };
    return { url: f + '/comments', method: 'POST', body };
  }
  throw new Error('Unknown Figma tool');
}

function makeFigmaTransport({ token, fetchImpl = fetch, timeoutMs = 30000 }) {
  let receive = () => {}, closed = false;
  const controllers = new Set();
  async function request(spec) {
    if (!token) throw new Error('connector HTTP 401 — sign in to Figma');
    const target = new URL(spec.url);
    for (const [k, v] of Object.entries(spec.query || {})) if (v !== undefined && v !== '') target.searchParams.set(k, String(v));
    const ctrl = new AbortController(); controllers.add(ctrl);
    let timer;
    try {
      return await Promise.race([new Promise((_, reject) => { timer = setTimeout(() => { ctrl.abort(); reject(new Error('Figma request timed out')); }, timeoutMs); }), (async () => {
        let r;
        try { r = await fetchImpl(target.href, { method: spec.method || 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' }, body: spec.body ? JSON.stringify(spec.body) : undefined, redirect: 'error', signal: ctrl.signal }); }
        catch (_) { throw new Error('Figma request failed or was cancelled'); }
        if (!r.ok) {
          try { await r.body?.cancel(); } catch (_) { ctrl.abort(); }
          throw new Error('connector HTTP ' + r.status + (r.status === 403 ? ' — Figma denied access; the signed-in account may not be able to open this file' : r.status === 404 ? ' — no such Figma file or node' : r.status === 429 ? ' — Figma rate limit; wait and retry' : ''));
        }
        const reader = r.body?.getReader(); let text = '';
        if (reader) {
          const chunks = []; let size = 0;
          try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Figma response exceeds 8 MiB; pass a smaller depth or specific nodeIds'); } chunks.push(Buffer.from(value)); } }
          finally { reader.releaseLock(); }
          text = Buffer.concat(chunks).toString('utf8');
        } else text = await r.text();
        try { return text ? JSON.parse(text) : {}; } catch (_) { throw new Error('Figma returned invalid JSON'); }
      })()]);
    } finally { clearTimeout(timer); controllers.delete(ctrl); }
  }
  async function send(msg) {
    if (msg.id == null) return;
    if (closed) throw new Error('Figma connector closed');
    let result;
    if (msg.method === 'initialize') {
      await request({ url: API + '/me' });   // prove the sign-in works before reporting connected
      result = { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'StarNet Figma API connector', version: '1' } };
    } else if (msg.method === 'tools/list') result = { tools: TOOLS };
    else if (msg.method === 'tools/call') {
      const def = TOOLS.find(t => t.name === msg.params?.name);
      if (!def) throw new Error('Unknown Figma tool');
      const args = msg.params.arguments || {};
      google.validate(def, args);
      const value = await request(requestFor(def.name, args));
      result = { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false };
    } else if (msg.method === 'ping') result = {};
    else throw new Error('Unsupported Figma MCP method');
    if (!closed) receive({ jsonrpc: '2.0', id: msg.id, result });
  }
  return { send, onMessage(cb) { receive = cb; }, close() { closed = true; for (const c of controllers) c.abort(); controllers.clear(); } };
}

const isFigmaUrl = url => url === URL_ID;
module.exports = { API, URL_ID, TOOLS, fileKey, requestFor, isFigmaUrl, makeFigmaTransport };
