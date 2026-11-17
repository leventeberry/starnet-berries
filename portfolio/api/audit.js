// Live site audit: deterministic checks run instantly (no keys needed); Claude adds prioritized advice when
// ANTHROPIC_API_KEY is set; the result is also handed to StarNet when an audit (or leads) hook is configured.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { json, readJson, clean, isEmail, isBot, rateLimit, sendToStarNet, hasClaude, askClaude, handle, HttpError } from './_lib.js';

const MAX_BYTES = 1_500_000;

function isPrivate(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// Local preview only (never on Vercel): lets `npm run dev` audit its own localhost page.
const allowPrivate = process.env.AUDIT_ALLOW_PRIVATE === '1' && !process.env.VERCEL;

async function assertPublic(url) {
  if (allowPrivate) return;
  if (!/^https?:$/.test(url.protocol)) throw new HttpError(400, 'Use an http or https address.');
  if (url.port && !['80', '443'].includes(url.port)) throw new HttpError(400, 'Only standard web ports are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new HttpError(400, 'That address is not public.');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new HttpError(400, "I couldn't find that site. Check the address.");
  if (addrs.some((a) => isPrivate(a.address))) throw new HttpError(400, 'That address is not public.');
}

async function fetchPage(input) {
  let url = new URL(input);
  const started = Date.now();
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PortfolioAuditBot/1.0)', accept: 'text/html,*/*;q=0.8' },
      signal: AbortSignal.timeout(9000),
    });
    const ttfb = Date.now() - started;
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    const reader = res.body?.getReader();
    const chunks = []; let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length; chunks.push(value);
      if (size > MAX_BYTES) { reader.cancel(); break; }
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return { finalUrl: url.href, status: res.status, headers: res.headers, html, bytes: size, ttfb, total: Date.now() - started, hops: hop };
  }
  throw new HttpError(400, 'That site redirects too many times.');
}

const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];
const metaContent = (html, key) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const n = (attr(tag, 'name') || attr(tag, 'property') || '').toLowerCase();
    if (n === key) return attr(tag, 'content') || '';
  }
  return null;
};

function analyze(page) {
  const { html, headers } = page;
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
  const desc = metaContent(html, 'description');
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((t) => attr(t, 'alt') == null).length;
  const h1 = (html.match(/<h1\b/gi) || []).length;
  const scripts = (html.match(/<script\b[^>]*\bsrc=/gi) || []).length;
  const https = page.finalUrl.startsWith('https:');
  const checks = [];
  const add = (group, label, pass, detail, weight = 1) => checks.push({ group, label, pass, detail, weight });

  add('Speed', 'Server response time', page.ttfb < 800, `${page.ttfb} ms to first response`, 2);
  add('Speed', 'Page weight', page.bytes < 500_000, `${Math.round(page.bytes / 1024)} KB of HTML`);
  add('Speed', 'Script count', scripts <= 15, `${scripts} external scripts`);
  add('Speed', 'Compression', /gzip|br|zstd/.test(headers.get('content-encoding') || '') || page.bytes < 20_000,
    headers.get('content-encoding') ? `Served with ${headers.get('content-encoding')}` : 'No compression header seen');
  add('SEO', 'Page title', title.length >= 10 && title.length <= 65, title ? `“${title.slice(0, 80)}” (${title.length} chars)` : 'Missing', 2);
  add('SEO', 'Meta description', !!desc && desc.length >= 50 && desc.length <= 170, desc ? `${desc.length} chars` : 'Missing', 2);
  add('SEO', 'One main heading', h1 === 1, `${h1} <h1> tag${h1 === 1 ? '' : 's'}`);
  add('SEO', 'Social preview', !!metaContent(html, 'og:image') && !!metaContent(html, 'og:title'), metaContent(html, 'og:image') ? 'Open Graph image set' : 'No Open Graph image');
  add('Mobile', 'Mobile viewport', !!metaContent(html, 'viewport'), metaContent(html, 'viewport') || 'No viewport tag', 2);
  add('Accessibility', 'Language set', /<html\b[^>]*\blang=/i.test(html), /<html\b[^>]*\blang=/i.test(html) ? 'lang attribute present' : 'No lang attribute');
  add('Accessibility', 'Image alt text', noAlt === 0, imgs.length ? `${imgs.length - noAlt} of ${imgs.length} images have alt text` : 'No images found');
  add('Security', 'HTTPS', https, https ? 'Served over HTTPS' : 'Not using HTTPS', 3);
  add('Security', 'HSTS', !!headers.get('strict-transport-security'), headers.get('strict-transport-security') ? 'Enabled' : 'Missing Strict-Transport-Security');
  add('Security', 'Content Security Policy', !!headers.get('content-security-policy'), headers.get('content-security-policy') ? 'Present' : 'Missing');
  add('Security', 'Clickjacking protection', !!headers.get('x-frame-options') || /frame-ancestors/.test(headers.get('content-security-policy') || ''), 'X-Frame-Options or frame-ancestors');

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  return {
    url: page.finalUrl,
    status: page.status,
    score: Math.round((got / total) * 100),
    timing: { ttfb: page.ttfb, total: page.total },
    title,
    checks: checks.map(({ weight, ...c }) => c),
  };
}

export const POST = handle(async (request) => {
  rateLimit(request, 'audit', 6, 10 * 60_000);
  const body = await readJson(request);
  if (isBot(body)) throw new HttpError(400, 'Nope.');
  let raw = clean(body.url, 500);
  if (!raw) throw new HttpError(400, 'Enter a site address.');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed; try { parsed = new URL(raw); } catch { throw new HttpError(400, 'That does not look like a web address.'); }

  let page;
  try { page = await fetchPage(parsed.href); } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, err.name === 'TimeoutError' ? 'That site took too long to answer.' : "I couldn't reach that site.");
  }
  if (!/html/i.test(page.headers.get('content-type') || 'text/html')) throw new HttpError(400, "That address isn't a web page.");
  const report = analyze(page);

  // Claude's take: short, prioritized, plain-language fixes.
  report.advice = null;
  if (hasClaude()) {
    try {
      const failing = report.checks.filter((c) => !c.pass).map((c) => `- ${c.group}: ${c.label} (${c.detail})`).join('\n') || '- none';
      const text = await askClaude({
        system:
          'You are a senior web consultant writing for a small-business owner. Be concrete and brief. ' +
          'Return exactly 3 numbered recommendations, highest impact first, each one or two sentences. ' +
          'After them, one line starting "AI idea:" naming one realistic way an AI agent could save this business time, ' +
          'based on what the page is about. No preamble, no markdown headings.',
        prompt:
          `Site: ${report.url}\nTitle: ${report.title || '(none)'}\nScore: ${report.score}/100\nFailing checks:\n${failing}\n\n` +
          `Visible text sample:\n${page.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2500)}`,
        maxTokens: 900,
      });
      report.advice = text;
    } catch (err) { console.error('audit advice failed', err.message); }
  }

  // Hand the lead to StarNet if they asked for the full report.
  const email = clean(body.email, 254);
  report.followUp = null;
  if (email) {
    if (!isEmail(email)) throw new HttpError(400, 'That email address does not look right.');
    const r = await sendToStarNet('audit', {
      jobType: 'audit', email, name: clean(body.name, 120), url: report.url, score: report.score,
      failing: report.checks.filter((c) => !c.pass), advice: report.advice,
      instructions: 'A visitor ran the site audit and asked for the full report. Draft a detailed audit email for LeVente to review, with a short offer to fix the top issues.',
    });
    report.followUp = r.queued ? 'queued' : 'unavailable';
  }
  return json(200, { ok: true, report });
});
