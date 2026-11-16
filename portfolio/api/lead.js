// Contact form + "Hire me for X" briefs → StarNet Leads workflow.
import { json, readJson, clean, isEmail, isBot, rateLimit, sendToStarNet, handle, HttpError } from './_lib.js';
import { services } from '../site/content.js';

const JOB_TYPES = new Set(['general', ...services.map((s) => s.id)]);

export const POST = handle(async (request) => {
  rateLimit(request, 'lead', 5, 10 * 60_000);
  const body = await readJson(request);
  if (isBot(body)) return json(200, { ok: true, queued: true }); // pretend success for bots

  const name = clean(body.name, 120);
  const email = clean(body.email, 254);
  const message = clean(body.message, 4000);
  const jobType = JOB_TYPES.has(body.jobType) ? body.jobType : 'general';
  if (!name) throw new HttpError(400, 'Please add your name.');
  if (!isEmail(email)) throw new HttpError(400, 'That email address does not look right.');

  // Job-specific answers from the brief form, kept small and flat.
  const answers = {};
  if (body.answers && typeof body.answers === 'object') {
    for (const [k, v] of Object.entries(body.answers).slice(0, 12)) answers[clean(k, 40)] = clean(String(v ?? ''), 1500);
  }
  if (!message && !Object.values(answers).some(Boolean)) throw new HttpError(400, 'Tell me a little about what you need.');

  const result = await sendToStarNet('leads', {
    jobType,
    name,
    email,
    company: clean(body.company, 160),
    budget: clean(body.budget, 60),
    message,
    answers,
    instructions:
      'New portfolio lead. Draft a warm, specific reply for LeVente to approve (do not send it), ' +
      'plus a short scope with open questions and a rough estimate range for this job type.',
  });

  if (!result.queued) {
    const fallbackEmail = process.env.CONTACT_EMAIL || '';
    return json(503, {
      ok: false,
      reason: result.reason,
      fallbackEmail,
      error: fallbackEmail
        ? 'My inbox agent is offline right now. Your email app will open with this message instead.'
        : 'My inbox agent is offline right now. Please try again a bit later.',
    });
  }
  return json(202, { ok: true, queued: true, jobId: result.jobId });
});
