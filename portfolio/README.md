# leventeberry.me portfolio

A personal builder portfolio in a light, editorial style: who I am, three featured projects with "how AI helped" write-ups,
a live AI site review, and a contact form that hands messages to StarNet.
Static site in `site/`, Vercel functions in `api/`. No build step.

## What each feature does

| Feature | Endpoint | Works with no config | Gets better with |
|---|---|---|---|
| Contact form | `POST /api/lead` (`jobType: general`) | Shows "offline" (or opens email if `CONTACT_EMAIL` is set) | `STARNET_HOOK_LEADS_*` |
| Site review (AI lab) | `POST /api/audit` | Yes: 15 instant checks (speed, SEO, mobile, a11y, security headers) | `ANTHROPIC_API_KEY` adds 3 prioritized fixes; "Email me the report" goes to `STARNET_HOOK_AUDIT_*` |
| "Hiring?" tab (job post → fit letter) | `POST /api/cover-letter` | Sends the post to StarNet if a hook is set | `ANTHROPIC_API_KEY` writes the letter on the spot |
| Agent status pill | `GET /api/status` | Yes | |

Every StarNet call is `POST <hook url>` with `Authorization: Bearer <secret>` and an `Idempotency-Key`, so a
double-submit becomes one job. The JSON body always has `source`, `kind` (`leads`, `audit`, `cover`), `jobType`,
the visitor's fields, and an `instructions` line the workflow can use as its prompt.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Needed for |
|---|---|
| `STARNET_HOOK_LEADS_URL` | `https://starnet.leventeberry.me/api/hooks/trg_…` from WORKFLOWS › INBOX |
| `STARNET_HOOK_LEADS_SECRET` | that webhook's secret (shown once in StarNet) |
| `STARNET_HOOK_AUDIT_URL` / `_SECRET` | optional; a separate workflow for audit follow-ups (falls back to LEADS) |
| `STARNET_HOOK_COVER_URL` / `_SECRET` | optional; a separate workflow for job posts (falls back to LEADS) |
| `ANTHROPIC_API_KEY` | instant audit advice and fit letters |
| `ANTHROPIC_MODEL` | optional, default `claude-opus-5-5` |
| `CONTACT_EMAIL` | optional; mailto fallback when StarNet is unreachable (this address becomes public) |

Secrets only live in Vercel. The browser never sees them.

## Run it locally

```sh
cd portfolio
npm install
npm run dev            # http://localhost:3000, reads .env.local if present
```

`AUDIT_ALLOW_PRIVATE=1 npm run dev` lets the audit check `http://localhost:3000` itself (ignored on Vercel).

## Deploy (Vercel)

Import this repo in Vercel with **Root Directory = `portfolio`** (framework: Other). `vercel.json` serves `site/`,
sets security headers (including a CSP that allows no inline scripts), and
gives functions 60 s. Then add `leventeberry.me` under Project → Domains and point DNS where Vercel says.

## Editing

All copy (bio, how I started, what I love to build, the featured projects and how AI helped each) is in `site/content.js`. Lines marked `DRAFT` are guesses to rewrite. The fit-letter agent only uses facts
from that file, so keep it accurate. `site/styles.css` holds the colors at the top.

Photos: put your portrait and real project screenshots in `site/img/` and set `profile.photo` and each project's
`image` in `content.js`. Until then the page shows your initials and a drawn illustration (`site/visuals.js`) for each project.
