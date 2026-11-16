// Lets the page show which agent features are live, without revealing any secret.
import { json, hookFor, hasClaude } from './_lib.js';

export function GET() {
  return json(200, {
    leads: Boolean(hookFor('leads')),
    audit: { instant: true, ai: hasClaude(), starnet: Boolean(hookFor('audit')) },
    cover: { ai: hasClaude(), starnet: Boolean(hookFor('cover')) },
    contactEmail: process.env.CONTACT_EMAIL || '',
  });
}
