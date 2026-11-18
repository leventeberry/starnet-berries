/* sidecar/routing/line-mail-html.js — THE DESIGNED EMAIL a line-mail job is sent as (starnet-berries, 2026-11-18).

   The bay writes the email body as light Markdown (its brief says so): paragraphs, "## " headings, "- " / "1. " lists, **bold**,
   *italic* and bare https links. This turns it into an email-client-safe HTML page (tables + inline styles, no images, no
   scripts, no web fonts) and into the plain-text part a client without HTML shows. Pure: no IO, no clock.

     render(env, msg)  -> { html, text }
        env  the envelope ({ label, kind }) — picks the kicker line ("SITE INSPECTOR REPORT", …) and the accent
        msg  { subject, text } from line-mail.compose (text is the Markdown body)

   Every character the model or the visitor wrote is HTML-escaped before any markup is added, so a body can never inject a tag,
   an attribute or a link the renderer did not make. Links are only ever made from bare http(s) URLs in the text. */
'use strict';

const BRAND = { name: 'LeVente Berry', site: 'https://leventeberry.me', siteLabel: 'leventeberry.me' };
const KICKER = { 'Site Inspector': 'Site Inspector report', 'Fit Letter': 'Fit letter', 'Contact form': 'A note from LeVente' };
const ACCENT = { 'Site Inspector': '#0f766e', 'Fit Letter': '#7c3aed', 'Contact form': '#c2410c' };
const C = { ink: '#16181d', soft: '#4a4f5a', faint: '#8a8f99', line: '#e7e5e0', paper: '#ffffff', page: '#f4f2ee', head: '#16181d' };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* inline Markdown on ESCAPED text: **bold**, *italic*, `code`, bare https links (the URL is already escaped, so it cannot break
   out of the attribute; a trailing period/comma/paren stays outside the link) */
function inline(raw, accent) {
  let s = esc(raw);
  s = s.replace(/`([^`\n]{1,200})`/g, '<code style="font-family:Menlo,Consolas,monospace;font-size:14px;background:#f1efea;padding:1px 5px;border-radius:4px">$1</code>');
  s = s.replace(/\*\*([^*\n]{1,300}?)\*\*/g, '<strong style="color:' + C.ink + ';font-weight:600">$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*\n]{0,300}?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\bhttps?:\/\/[^\s<>"']{1,400}/g, m => {
    const tail = /[.,;:!?)]+$/.exec(m), url = tail ? m.slice(0, -tail[0].length) : m;
    return '<a href="' + url + '" style="color:' + accent + ';text-decoration:underline">' + url + '</a>' + (tail ? tail[0] : '');
  });
  return s;
}

/* the body as blocks: { t:'h', text } | { t:'p', lines } | { t:'ul'|'ol', items } | { t:'hr' } */
function blocks(md) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const line of String(md || '').split('\n')) {
    const l = line.replace(/\s+$/, '');
    let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = /^\s{0,3}#{1,4}\s+(.+)$/.exec(l))) { flush(); out.push({ t: 'h', text: m[1].replace(/\s*#+\s*$/, '') }); continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push({ t: 'hr' }); continue; }
    if ((m = /^\s{0,6}[-*•]\s+(.+)$/.exec(l))) { if (!cur || cur.t !== 'ul') { flush(); cur = { t: 'ul', items: [] }; } cur.items.push(m[1]); continue; }
    if ((m = /^\s{0,6}\d{1,3}[.)]\s+(.+)$/.exec(l))) { if (!cur || cur.t !== 'ol') { flush(); cur = { t: 'ol', items: [] }; } cur.items.push(m[1]); continue; }
    if (cur && (cur.t === 'ul' || cur.t === 'ol') && /^\s{2,}\S/.test(l)) { cur.items[cur.items.length - 1] += ' ' + l.trim(); continue; }
    if (!cur || cur.t !== 'p') { flush(); cur = { t: 'p', lines: [] }; }
    cur.lines.push(l.trim());
  }
  flush();
  return out;
}

function bodyHtml(md, accent) {
  const P = 'margin:0 0 16px;font-size:16px;line-height:1.65;color:' + C.soft;
  return blocks(md).map(b => {
    if (b.t === 'h') return '<h2 style="margin:28px 0 12px;font-size:13px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:' + accent + '">' + inline(b.text, accent) + '</h2>';
    if (b.t === 'hr') return '<hr style="border:0;border-top:1px solid ' + C.line + ';margin:24px 0">';
    if (b.t === 'p') return '<p style="' + P + '">' + b.lines.map(l => inline(l, accent)).join('<br>') + '</p>';
    const tag = b.t;
    return '<' + tag + ' style="margin:0 0 18px;padding:0 0 0 22px;font-size:16px;line-height:1.6;color:' + C.soft + '">'
      + b.items.map(i => '<li style="margin:0 0 8px;padding-left:4px">' + inline(i, accent) + '</li>').join('') + '</' + tag + '>';
  }).join('\n');
}

/* the plain-text part: the same words without the Markdown marks */
function plain(md) {
  return blocks(md).map(b => {
    if (b.t === 'h') return b.text.toUpperCase();
    if (b.t === 'hr') return '—';
    const strip = s => s.replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, '$1$2').replace(/`([^`\n]+)`/g, '$1');
    if (b.t === 'p') return b.lines.map(strip).join('\n');
    return b.items.map((i, n) => (b.t === 'ol' ? (n + 1) + '. ' : '• ') + strip(i)).join('\n');
  }).join('\n\n') + '\n\n—\n' + BRAND.name + ' · ' + BRAND.siteLabel + '\nReply to this email to reach LeVente directly.';
}

function render(env, msg) {
  const label = (env && env.label) || '';
  const accent = ACCENT[label] || ACCENT['Contact form'];
  const kicker = KICKER[label] || 'A note from LeVente';
  const subject = String((msg && msg.subject) || '');
  const md = String((msg && msg.text) || '');
  const preheader = plain(md).replace(/\s+/g, ' ').slice(0, 140);
  const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>' + esc(subject) + '</title></head>\n'
    + '<body style="margin:0;padding:0;background:' + C.page + ';-webkit-text-size-adjust:100%">\n'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + esc(preheader) + '</div>\n'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.page + '"><tr><td align="center" style="padding:32px 12px">\n'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:' + FONT + '">\n'
    // header: wordmark + kicker
    + '<tr><td style="background:' + C.head + ';border-radius:14px 14px 0 0;padding:26px 36px 22px">'
    + '<div style="font-size:18px;font-weight:700;letter-spacing:-.01em;color:#ffffff">' + esc(BRAND.name) + '</div>'
    + '<div style="margin-top:6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#b9bcc4">' + esc(kicker) + '</div>'
    + '</td></tr>\n'
    + '<tr><td style="height:4px;line-height:4px;font-size:0;background:' + accent + '">&nbsp;</td></tr>\n'
    // card
    + '<tr><td style="background:' + C.paper + ';padding:36px 36px 12px;border-left:1px solid ' + C.line + ';border-right:1px solid ' + C.line + '">'
    + '<h1 style="margin:0 0 22px;font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-.015em;color:' + C.ink + '">' + esc(subject) + '</h1>\n'
    + bodyHtml(md, accent)
    + '</td></tr>\n'
    // sign-off
    + '<tr><td style="background:' + C.paper + ';padding:8px 36px 32px;border-left:1px solid ' + C.line + ';border-right:1px solid ' + C.line + ';border-radius:0 0 14px 14px;border-bottom:1px solid ' + C.line + '">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' + C.line + ';width:100%"><tr><td style="padding-top:20px;font-size:14px;line-height:1.6;color:' + C.soft + '">'
    + '<strong style="color:' + C.ink + '">' + esc(BRAND.name) + '</strong><br>'
    + 'Reply to this email to reach me directly.<br>'
    + '<a href="' + BRAND.site + '" style="color:' + accent + ';text-decoration:none">' + esc(BRAND.siteLabel) + '</a>'
    + '</td></tr></table>'
    + '</td></tr>\n'
    + '<tr><td style="padding:18px 36px 0;font-size:12px;line-height:1.6;color:' + C.faint + ';text-align:center">'
    + 'You are getting this because you asked for it on ' + esc(BRAND.siteLabel) + '.'
    + '</td></tr>\n'
    + '</table>\n</td></tr></table>\n</body></html>\n';
  return { html, text: plain(md) };
}

module.exports = { render, blocks, inline, plain, esc };
