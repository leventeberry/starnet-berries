/* test/line-mail.test.js — LINE MAIL (starnet-berries): a webhook job's approved result is emailed through Resend.
   Pure core (line-mail.js), the host (line-mail-host.js) over fake stores/fetch, LineJobs.setMail and the trigger config. */
'use strict';
const A = require('./_assert.js');
const M = require('../sidecar/routing/line-mail.js');
const { makeLineMailHost } = require('../sidecar/routing/line-mail-host.js');
const LineJobs = require('../sidecar/routing/linejobs.js');
const T = require('../sidecar/routing/triggers.js');

const CFG = { from: "LeVente's Agent <agent@mail.leventeberry.me>", replyTo: 'hello@leventeberry.me' };
const body = o => JSON.stringify(Object.assign({ source: 'leventeberry.me', kind: 'leads', jobType: 'general', email: 'v@example.com' }, o));

/* ---- envelope ---- */
let r = M.envelopeFrom(CFG, body());
A.ok(r.ok, 'a contact-form body makes an envelope');
A.eq(r.envelope.to, 'v@example.com', 'to = the body email');
A.eq(r.envelope.from, "LeVente's Agent <agent@mail.leventeberry.me>", 'from = the configured sender');
A.eq(r.envelope.replyTo, 'hello@leventeberry.me', 'reply_to = the configured address');
A.eq(r.envelope.label, 'Contact form', 'kind leads -> Contact form');
A.eq(M.envelopeFrom(CFG, body({ kind: 'audit', jobType: 'audit' })).envelope.label, 'Site Inspector', 'audit -> Site Inspector');
A.eq(M.envelopeFrom(CFG, body({ kind: 'cover', jobType: 'job-posting' })).envelope.label, 'Fit Letter', 'cover -> Fit Letter');
A.eq(M.envelopeFrom(CFG, body({ replyFrom: 'Agent B <b@mail.leventeberry.me>' })).envelope.from, 'Agent B <b@mail.leventeberry.me>', 'replyFrom on the same domain wins');
A.eq(M.envelopeFrom(CFG, body({ replyFrom: 'Evil <ceo@bank.com>' })).envelope.from, CFG.from, 'replyFrom on another domain is ignored');
A.ok(!M.envelopeFrom(CFG, body({ email: 'not an email' })).ok, 'a bad email makes no envelope');
A.ok(!M.envelopeFrom(CFG, body({ email: 'a@b.com, c@d.com' })).ok, 'a list of addresses is refused');
A.ok(!M.envelopeFrom(CFG, 'plain text').ok, 'a non-JSON body makes no envelope');
A.ok(!M.envelopeFrom({ from: 'nope' }, body()).ok, 'a bad sender config makes no envelope');

/* ---- compose ---- */
let c = M.compose({ label: 'Contact form' }, 'Subject: Thanks, Ana\n\nHi Ana,\n\nThanks for writing.\n\nVERDICT: blocked');
A.eq(c.subject, 'Thanks, Ana', 'the Subject line is the subject');
A.eq(c.text, 'Hi Ana,\n\nThanks for writing.', 'the VERDICT line and the subject line are not in the body');
c = M.compose({ label: 'Fit Letter' }, '**Subject:** Fit for Acme\nBody');
A.eq(c.subject, 'Fit for Acme', 'a bolded Subject line is read');
A.eq(M.compose({ label: 'Site Inspector' }, 'Just a body').subject, 'Your site report', 'no Subject line -> the label default');
A.ok(!M.compose({}, 'VERDICT: approved').ok, 'an empty body is refused');

/* ---- request / response ---- */
const q = M.request(r.envelope, { subject: 's', text: 't' }, 'job-abc12345');
A.eq(q.url, 'https://api.resend.com/emails', 'posts to Resend');
A.eq(q.idempotencyKey, 'starnet-job-abc12345', 'idempotency key per job');
A.eq(q.body.reply_to, 'hello@leventeberry.me', 'reply_to is set');
A.eq(JSON.stringify(q.body.to), '["v@example.com"]', 'to is the visitor');
A.eq(M.readResponse(200, { id: 'em_1' }).id, 'em_1', 'a 200 with id is sent');
A.ok(/422.*invalid/.test(M.readResponse(422, { message: 'invalid from' }).error), 'an error says the status and why');

/* ---- approvedByPerson ---- */
const dec = (...ds) => ({ continuation: { decisions: ds } });
A.ok(M.approvedByPerson(dec({ action: 'approve', state: 'adopted' })), 'an adopted approve counts');
A.ok(M.approvedByPerson(dec({ action: 'approve', state: 'complete' })), 'a complete approve counts');
A.ok(!M.approvedByPerson(dec({ action: 'approve', state: 'refused' })), 'a refused approve does not');
A.ok(!M.approvedByPerson(dec({ action: 'approve', state: 'complete' }, { action: 'stop', state: 'complete' })), 'the last word wins');
A.ok(M.approvedByPerson(dec({ action: 'send_back', state: 'complete' }, { action: 'approve', state: 'adopted' }, { action: 'stop', state: 'refused' })), 'a refused later decision changes nothing');
A.ok(!M.approvedByPerson({ status: 'delivered' }), 'no hold, no approval');

/* ---- trigger config ---- */
const trg = T.normalizeTrigger({ id: 'trg_abcdefgh12', lineId: 'line-p1', kind: 'webhook', config: { task: 'x', mail: CFG } });
A.eq(trg.config.mail.from, CFG.from, 'a webhook keeps config.mail');
A.ok(!T.normalizeTrigger({ id: 'trg_abcdefgh12', lineId: 'line-p1', kind: 'folder', config: { path: '/x', mail: CFG } }).config.mail, 'a folder trigger never mails');
A.ok(!T.validateInput({ config: { mail: { from: 'bad' } } }, { partial: true }).ok, 'a bad mail config is refused');
A.eq(T.validateInput({ config: { mail: null } }, { partial: true }).fields.config.mail, null, 'mail: null turns it off');

/* ---- LineJobs.setMail ---- */
let st = LineJobs.start({ jobs: [] }, { id: 'job-abc12345', line: 'line-p1', text: 't', streamId: 's1', at: 1, entry: 'trigger', name: 'Fit Letter' }).state;
st = LineJobs.finish(st, 'job-abc12345', { status: 'delivered', outcome: 'delivered', at: 2, usd: 0, output: 'o', runs: [] }).state;
let w = LineJobs.setMail(st, 'job-abc12345', { state: 'sent', id: 'em_1', to: 'v@example.com', label: 'Fit Letter', at: 3 }, false);
A.eq(w.job.mail.id, 'em_1', 'the Resend id is on the job');
A.eq(w.job.status, 'delivered', 'a sent email keeps the job delivered');
A.eq(LineJobs.summary(w.job).mail.state, 'sent', 'the summary carries the mail');
A.eq(w.job.name, 'Fit Letter', 'the job keeps its label');
w = LineJobs.setMail(w.state, 'job-abc12345', { state: 'failed', error: 'Resend answered 403', to: 'v@example.com', at: 4 }, true);
A.eq(w.job.status, 'failed', 'a failed send marks the job failed');
A.ok(/Email not sent: Resend answered 403/.test(w.job.error), 'and says why');

/* ---- the host ---- */
(async () => {
  const mem = { value: { jobs: {} } };
  const store = { load: () => ({ value: JSON.parse(JSON.stringify(mem.value)) }), save: v => { mem.value = JSON.parse(JSON.stringify(v)); return { ok: true }; } };
  const calls = [], notes = [], marks = [];
  let reply = { status: 200, json: { id: 'em_42' } }, key = 're_test';
  const host = makeLineMailHost({ store, key: () => key, now: () => 10, warn: () => {}, notify: t => notes.push(t),
    jobs: { get: () => null, setMail: (id, m, failed) => marks.push({ id, m, failed }) },
    fetch: async (u, o) => { calls.push({ u, o }); return { status: reply.status, json: async () => reply.json }; } });
  const t = { id: 'trg_abcdefgh12', config: { mail: CFG } };
  A.eq(host.admit(t, body({ kind: 'cover' }), 'job-11111111'), 'Fit Letter', 'admit returns the label');
  A.eq(host.admit({ id: 'trg_x', config: {} }, body(), 'job-22222222'), '', 'a trigger without mail admits nothing');
  const approved = { continuation: { decisions: [{ action: 'approve', state: 'adopted' }] } };
  host.settled(Object.assign({ id: 'job-11111111', status: 'delivered', output: 'Subject: Hi\n\nLetter\nVERDICT: blocked' }, approved));
  await new Promise(res => setTimeout(res, 5));
  A.eq(calls.length, 1, 'an approved delivered job is sent once');
  A.eq(calls[0].o.headers.authorization, 'Bearer re_test', 'the key is read at send time');
  A.eq(calls[0].o.headers['idempotency-key'], 'starnet-job-11111111', 'with the job idempotency key');
  A.eq(JSON.parse(calls[0].o.body).text, 'Letter', 'the body is the approved draft');
  A.eq(host.get('job-11111111').id, 'em_42', 'the Resend id is kept');
  A.eq(marks[marks.length - 1].m.id, 'em_42', 'and written onto the job');
  host.settled(Object.assign({ id: 'job-11111111', status: 'delivered', output: 'x' }, approved));
  await new Promise(res => setTimeout(res, 5));
  A.eq(calls.length, 1, 'a sent job is never sent again');

  host.admit(t, body(), 'job-33333333');
  host.settled({ id: 'job-33333333', status: 'delivered', output: 'x' });
  await new Promise(res => setTimeout(res, 5));
  A.eq(calls.length, 1, 'a job nobody approved is not sent');
  A.eq(host.get('job-33333333').state, 'skipped', 'it is written down as skipped');

  host.admit(t, body(), 'job-44444444');
  reply = { status: 403, json: { message: 'domain not verified' } };
  host.settled(Object.assign({ id: 'job-44444444', status: 'delivered', output: 'x' }, approved));
  await new Promise(res => setTimeout(res, 5));
  A.eq(host.get('job-44444444').state, 'failed', 'a refused send is failed');
  A.ok(marks[marks.length - 1].failed, 'the job is marked failed');
  A.ok(/NOT sent.*domain not verified/.test(notes[0]), 'the owner is told why');

  host.admit(t, body(), 'job-55555555');
  key = '';
  host.settled(Object.assign({ id: 'job-55555555', status: 'delivered', output: 'x' }, approved));
  await new Promise(res => setTimeout(res, 5));
  A.ok(/RESEND_API_KEY/.test(host.get('job-55555555').error), 'no key: failed, and says so');
  A.report('line-mail');
})();
