/* sidecar/routing/line-mail-host.js — the live side of line-mail.js (starnet-berries, 2026-11-18).

   admit(trigger, rawBody, jobId)  a webhook call on a trigger with config.mail: its envelope (who the email goes to, from whom) is
                                   written down under the job id BEFORE the job runs. Returns the job's label ('Fit Letter', …) or ''.
   settled(record)                 a line job finished (index.js wraps the line runner's finish): a delivered job a PERSON approved is
                                   sent; any other end is written down as skipped, with why. Never throws.
   boot()                          a send a restart cut short goes again (the same Idempotency-Key, so Resend sends it once); a
                                   delivered job whose send never started is sent.
   get(jobId)                      the envelope and its state.

   The API key is read from the environment (deps.key(), the KEYS tab's RESEND_API_KEY) at the moment of each send, so a new key
   takes effect with no restart. It is never stored here, logged or put on a record.

   deps: { store: { load() -> {value}, save(value) }, fetch, key() -> string, jobs: { get(id), setMail(id, mail, failed) },
           notify(text), now(), warn(msg) } */
'use strict';
const M = require('./line-mail.js');
const { note: failNote } = require('../failopen.js');

const MAX_KEEP = 300, TIMEOUT_MS = 20000;

function makeLineMailHost(deps) {
  const d = deps || {};
  const inflight = new Set();
  const load = () => { const v = d.store.load().value; return v && v.jobs && typeof v.jobs === 'object' ? v : { jobs: {} }; };
  function put(jobId, patch) {
    const v = load(), cur = v.jobs[jobId] || {};
    v.jobs[jobId] = Object.assign({}, cur, patch);
    const ids = Object.keys(v.jobs);
    if (ids.length > MAX_KEEP) ids.sort((a, b) => (v.jobs[a].at || 0) - (v.jobs[b].at || 0)).slice(0, ids.length - MAX_KEEP).forEach(id => { delete v.jobs[id]; });
    const r = d.store.save(v);
    if (!r || r.ok === false) throw new Error('line mail could not be saved' + (r && r.error ? ': ' + r.error : ''));
    return v.jobs[jobId];
  }
  function record(jobId, env, failed) {
    try { d.jobs.setMail(jobId, M.normMail(env), !!failed); } catch (e) { d.warn('[line-mail] job ' + jobId + ' not updated: ' + ((e && e.message) || e)); }
  }

  function admit(t, rawBody, jobId) {
    const cfg = t && t.config && t.config.mail;
    if (!cfg || !jobId) return '';
    if (load().jobs[jobId]) return load().jobs[jobId].label || '';   // a replayed webhook call: already written down
    const made = M.envelopeFrom(cfg, rawBody), bad = made.ok ? '' : made.reason;
    const env = made.ok ? Object.assign(made.envelope, { at: d.now(), triggerId: t.id })
      : { state: 'skipped', error: 'No email will be sent: ' + bad + '.', to: '', label: '', at: d.now(), triggerId: t.id };
    put(jobId, env);
    return env.label || '';
  }

  function settled(rec) {
    try {
      if (!rec || !rec.id) return;
      const env = load().jobs[rec.id];
      if (!env) return;
      if (env.state === 'skipped') { record(rec.id, env, false); return; }
      if (env.state !== 'waiting') return;
      if (rec.status !== 'delivered') return finishSkipped(rec.id, 'the job ended ' + rec.status + ', so nothing was sent');
      if (!M.approvedByPerson(rec)) return finishSkipped(rec.id, 'nobody approved it, so nothing was sent');
      send(rec.id, rec.output);
    } catch (e) { d.warn('[line-mail] settle ' + (rec && rec.id) + ': ' + ((e && e.message) || e)); }
  }
  function finishSkipped(jobId, why) { record(jobId, put(jobId, { state: 'skipped', error: why, at: d.now() }), false); }

  async function send(jobId, output) {
    if (inflight.has(jobId)) return;
    inflight.add(jobId);
    let env;
    try {
      env = load().jobs[jobId];
      const msg = M.compose(env, output);
      if (!msg.ok) return fail(jobId, msg.reason);
      const key = String(d.key() || '').trim();
      if (!key) return fail(jobId, 'RESEND_API_KEY is not set (add it under KEYS)');
      env = put(jobId, { state: 'sending', subject: msg.subject, at: d.now() });
      record(jobId, env, false);
      const req = M.request(env, msg, jobId);
      let status = 0, json = null;
      try {
        const res = await d.fetch(req.url, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': req.idempotencyKey },
          body: JSON.stringify(req.body) });
        status = res.status;
        json = await res.json().catch(e => { failNote('line-mail.response-json', e); return null; });
      } catch (e) { return fail(jobId, 'Resend could not be reached: ' + ((e && e.message) || e)); }
      const r = M.readResponse(status, json);
      if (!r.ok) return fail(jobId, r.error);
      const sent = put(jobId, { state: 'sent', id: r.id, error: '', at: d.now() });
      record(jobId, sent, false);
      sentNote(jobId, sent, msg);
    } catch (e) {
      try { fail(jobId, 'the send could not be recorded: ' + ((e && e.message) || e)); } catch (e2) { failNote('line-mail.fail-record', e2); }
      d.warn('[line-mail] send ' + jobId + ': ' + ((e && e.message) || e));
    } finally { inflight.delete(jobId); }
  }
  /* the Commander's copy in chat: who it went to, the subject, and the words as sent (to copy or forward); the bcc, when set, is the
     same email in their inbox */
  function sentNote(jobId, env, msg) {
    try {
      const words = M.plainOf(env, msg), cap = 3000;
      d.notify('✉️ Sent the ' + (env.label || 'webhook') + ' email to ' + env.to + ' (job ' + jobId + ')' + (env.bcc ? ' — a copy went to ' + env.bcc : '')
        + '\nSubject: ' + msg.subject + '\n\n' + (words.length > cap ? words.slice(0, cap) + '\n…' : words));
    } catch (e) { d.warn('[line-mail] notify: ' + ((e && e.message) || e)); }
  }
  function fail(jobId, why) {
    const env = put(jobId, { state: 'failed', error: String(why).slice(0, 360), at: d.now() });
    record(jobId, env, true);
    try { d.notify('The ' + (env.label || 'webhook') + ' email to ' + (env.to || 'the visitor') + ' was NOT sent (job ' + jobId + '): ' + env.error); }
    catch (e) { d.warn('[line-mail] notify: ' + ((e && e.message) || e)); }
  }

  function boot() {
    let v;
    try { v = load(); } catch (e) { d.warn('[line-mail] boot: ' + ((e && e.message) || e)); return; }
    for (const id of Object.keys(v.jobs)) {
      const env = v.jobs[id], rec = d.jobs.get(id);
      if (!rec) continue;
      if (env.state === 'sending' && rec.status === 'delivered') send(id, rec.output);   // idempotent: Resend keeps the key 24 h
      else if (env.state === 'waiting' && rec.status !== 'running' && rec.status !== 'held' && rec.status !== 'paused') settled(rec);
    }
  }

  return { admit, settled, boot, get: id => load().jobs[id] || null, send };
}

module.exports = { makeLineMailHost };
