/* sidecar/routing/line-mail.js — EMAIL A HELD JOB'S APPROVED RESULT (2026-11-18, owner: portfolio workflows).

   A webhook trigger may say `config.mail` (from, replyTo). A job that came in through it is then a draft email to the person the
   webhook named (body.email): the line drafts it, a reviewer's gate HOLDS it for the Commander, and only when the Commander APPROVES
   and the line delivers does the host send it through Resend (index.js lineMail*). Nothing here does IO: no fs, no fetch, no clock.

     envelopeFrom(cfg, rawBody)  -> { ok:true, envelope } | { ok:false, reason }
        cfg      the trigger's config.mail { from, replyTo }
        rawBody  the webhook body exactly as received; JSON with an `email`. `replyFrom` (optional) replaces the sender when it is
                 a well-formed address on the SAME domain as cfg.from (a body can never send as someone else). `kind`/`jobType`
                 pick the label.
     labelFor(kind, jobType)     -> 'Contact form' | 'Site Inspector' | 'Fit Letter' | ''
     approvedByPerson(job)       -> did a PERSON approve this job's hold (its last decision that was not refused is APPROVE)?
     compose(envelope, output)   -> { ok:true, subject, text } | { ok:false, reason }   the delivered output as the email: a first line
                                    "Subject: …" is the subject, every VERDICT line is dropped
     request(envelope, msg, jobId) -> { url, idempotencyKey, body }   the Resend call (the caller adds Authorization at send time)
     readResponse(status, json)  -> { ok:true, id } | { ok:false, error }
     normMail(m)                 -> the bounded `mail` field a LineJob keeps */
'use strict';

const RESEND_URL = 'https://api.resend.com/emails';
const EMAIL_RE = /^[^\s@<>",;:()[\]\\]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;
const NAME_RE = /^[^<>"\r\n\\]{1,80}$/;
const STATES = ['waiting', 'sending', 'sent', 'failed', 'skipped'];
const SUBJECT_MAX = 200, TEXT_MAX = 60000, ERROR_MAX = 400;
const LABELS = { leads: 'Contact form', general: 'Contact form', audit: 'Site Inspector', cover: 'Fit Letter', 'job-posting': 'Fit Letter' };
const DEFAULT_SUBJECT = { 'Contact form': 'Thanks for reaching out', 'Site Inspector': 'Your site report', 'Fit Letter': 'Your fit letter' };

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

/* parseAddress('Name <a@b.c>' | 'a@b.c') -> { name, email } | null */
function parseAddress(v) {
  const s = str(v, 200);
  const m = /^(?:"?([^"<>]*?)"?\s*)?<([^<>\s]+)>$/.exec(s);
  const name = m ? str(m[1], 80) : '', email = m ? m[2] : s;
  if (!EMAIL_RE.test(email) || (name && !NAME_RE.test(name))) return null;
  return { name, email };
}
const formatAddress = a => (a.name ? a.name + ' <' + a.email + '>' : a.email);
const domainOf = email => String(email).split('@')[1].toLowerCase();

function labelFor(kind, jobType) { return LABELS[str(kind, 20).toLowerCase()] || LABELS[str(jobType, 20).toLowerCase()] || ''; }

function normCfg(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const from = parseAddress(c.from), replyTo = c.replyTo == null || c.replyTo === '' ? null : parseAddress(c.replyTo);
  if (!from || (c.replyTo && !replyTo)) return null;
  return { from: formatAddress(from), replyTo: replyTo ? replyTo.email : '' };
}

function envelopeFrom(cfg, rawBody) {
  const c = normCfg(cfg);
  if (!c) return { ok: false, reason: 'the webhook has no valid mail sender' };
  let body;
  try { body = JSON.parse(String(rawBody == null ? '' : rawBody)); } catch (_) { return { ok: false, reason: 'the webhook body is not JSON' }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'the webhook body is not a JSON object' };
  const to = parseAddress(body.email);
  if (!to || to.name) return { ok: false, reason: 'the webhook body has no valid "email"' };
  let from = parseAddress(c.from);
  const asked = body.replyFrom == null || body.replyFrom === '' ? null : parseAddress(body.replyFrom);
  if (asked && domainOf(asked.email) === domainOf(from.email)) from = asked;   // another domain is never honoured
  const label = labelFor(body.kind, body.jobType);
  return { ok: true, envelope: { to: to.email, from: formatAddress(from), replyTo: c.replyTo, kind: str(body.kind, 20), label, state: 'waiting' } };
}

/* A person approved: the hold's decisions, newest last; a refused decision changes nothing, so the last one that was not refused
   is the person's word. Only APPROVE that the station carried out (adopted / complete) counts. */
function approvedByPerson(job) {
  const c = job && job.continuation;
  const ds = c && Array.isArray(c.decisions) ? c.decisions.filter(d => d && d.state !== 'refused') : [];
  const last = ds[ds.length - 1];
  return !!last && last.action === 'approve' && (last.state === 'adopted' || last.state === 'complete');
}

function compose(env, output) {
  let lines = String(output == null ? '' : output).replace(/\r\n?/g, '\n').split('\n')
    .filter(l => !/^\s*\**\s*VERDICT\s*:/i.test(l));
  while (lines.length && !lines[0].trim()) lines.shift();
  let subject = '';
  const m = lines.length ? /^\s*\**\s*Subject\s*:\s*\**\s*(.+?)\s*\**\s*$/i.exec(lines[0]) : null;
  if (m) { subject = str(m[1], SUBJECT_MAX); lines = lines.slice(1); }
  while (lines.length && !lines[0].trim()) lines.shift();
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return { ok: false, reason: 'the approved result has no email body' };
  if (!subject) subject = DEFAULT_SUBJECT[env && env.label] || 'A note from LeVente';
  return { ok: true, subject, text: text.slice(0, TEXT_MAX) };
}

function request(env, msg, jobId) {
  const body = { from: env.from, to: [env.to], subject: msg.subject, text: msg.text };
  if (env.replyTo) body.reply_to = env.replyTo;
  if (env.label) body.tags = [{ name: 'kind', value: env.label.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') }];
  return { url: RESEND_URL, idempotencyKey: 'starnet-' + String(jobId), body };
}

function readResponse(status, json) {
  const j = json && typeof json === 'object' ? json : {};
  if (status >= 200 && status < 300 && typeof j.id === 'string' && j.id) return { ok: true, id: str(j.id, 80) };
  const why = str(j.message || j.error || j.name, ERROR_MAX - 40);
  return { ok: false, error: 'Resend answered ' + status + (why ? ': ' + why : '') };
}

function normMail(m) {
  if (!m || typeof m !== 'object' || STATES.indexOf(m.state) < 0) return null;
  const out = { state: m.state, to: str(m.to, 200), label: str(m.label, 40) };
  if (m.id) out.id = str(m.id, 80);
  if (m.error) out.error = str(m.error, ERROR_MAX);
  if (typeof m.at === 'number' && isFinite(m.at) && m.at > 0) out.at = m.at;
  return out;
}

module.exports = { RESEND_URL, STATES, parseAddress, labelFor, normCfg, envelopeFrom, approvedByPerson, compose, request, readResponse, normMail };
