// Shared helpers for the serverless functions. Files that start with "_" are not routes on Vercel.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

// ---------- input ----------
export async function readJson(request, maxBytes = 24_000) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Send JSON.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That is too long. Please trim it down.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'That request was not valid JSON.'); }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const clean = (v, max = 2000) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
export const isEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(v);

// Bots fill every field; people never see this one.
export const isBot = (body) => Boolean(body && clean(body.company_website));

// ---------- rate limit (per warm instance; a cheap first line, StarNet also caps each webhook) ----------
const buckets = new Map();
export function rateLimit(request, key, limit, windowMs) {
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const hits = (buckets.get(id) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) throw new HttpError(429, 'Easy there. Try again in a minute.');
  hits.push(now);
  buckets.set(id, hits);
  if (buckets.size > 5000) buckets.clear();
}

// ---------- StarNet webhooks ----------
// Each kind (LEADS, AUDIT, COVER) can have its own trigger; anything unset falls back to the LEADS hook,
// so one webhook is enough to start. The secret only ever lives in Vercel env vars.
export function hookFor(kind) {
  const k = kind.toUpperCase();
  const url = process.env[`STARNET_HOOK_${k}_URL`] || process.env.STARNET_HOOK_LEADS_URL || '';
  const secret = process.env[`STARNET_HOOK_${k}_SECRET`] || process.env.STARNET_HOOK_LEADS_SECRET || '';
  return url && secret ? { url, secret } : null;
}

export async function sendToStarNet(kind, payload) {
  const hook = hookFor(kind);
  if (!hook) return { queued: false, reason: 'not_configured' };
  // No timestamp in the body: StarNet binds the Idempotency-Key to the exact body, so a double-submit
  // of the same form becomes one job instead of two.
  const body = JSON.stringify({ source: 'leventeberry.me', kind, ...payload });
  const idem = createHash('sha256').update(body).digest('hex').slice(0, 48);
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${hook.secret}`, 'content-type': 'application/json', 'idempotency-key': idem },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 202 || res.ok) return { queued: true, jobId: data.jobId || null };
    console.error(`StarNet ${kind} hook answered ${res.status}`, data && data.error);
    return { queued: false, reason: `starnet_${res.status}` };
  } catch (err) {
    console.error(`StarNet ${kind} hook failed:`, err.message);
    return { queued: false, reason: 'starnet_unreachable' };
  }
}

// ---------- Claude ----------
export const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY);
let client;
export async function askClaude({ system, prompt, maxTokens = 2000, effort = 'low' }) {
  client ||= new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'The agent declined that one. Try rephrasing it.');
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

export function claudeError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.RateLimitError) return new HttpError(429, 'The agent is busy. Try again in a minute.');
  if (err instanceof Anthropic.APIError) {
    console.error('Claude API error', err.status, err.message);
    return new HttpError(502, 'The agent hit a snag. Try again shortly.');
  }
  console.error(err);
  return new HttpError(500, 'Something broke on my side.');
}

// Wraps a handler so thrown HttpErrors become clean JSON responses.
export const handle = (fn) => async (request) => {
  try { return await fn(request); } catch (err) {
    const e = err instanceof HttpError ? err : claudeError(err);
    return json(e.status, { ok: false, error: e.message });
  }
};
