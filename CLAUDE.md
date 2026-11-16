# starnet-berries

Fork of androoAGI/starnet (MIT). Goal: turn the desktop-first StarNet harness into a
first-class **hosted browser app**, deployed to the owner's VPS at
https://starnet.leventeberry.me (behind Authelia 2FA).

Start with `CODE_MAP.md` (layout) and `deploy/README.md` (how deploys work and the
browser-mode constraints). Upstream's own docs are in `docs/`.

## Workflow
- Branch from `main`, open a PR into `main`. Merging to `main` deploys automatically
  (CI builds the image; the VPS picks it up within ~2 min and rolls back on a failed
  health check). Keep `main` deployable.
- Fast local checks: `node --check sidecar/index.js`; targeted tests via
  `node scripts/run-test-list.mjs` / files in `test/`. The full upstream suites are long.
- Release-claims lock: `test/qa-product-perfect-claims.test.js` (gate CI) fails whenever a release-surface
  file changes (most of `frontend/`, `sidecar/`, the top-level docs). After committing such a change, run
  `node scripts/qa/product-perfect/relock-surface.mjs` on the clean tree and commit `qa/product-perfect/claims.json`.
- Upstream sync: `git remote add upstream https://github.com/androoAGI/starnet` and merge
  `upstream/feat/harness-backend` (upstream's default branch). `sidecar/index.js` is the
  usual conflict hotspot, so keep our changes there small and well-marked.

## Fork-specific code (keep these when merging upstream)
- `frontend/app/mobile.js`, `frontend/mobile.css` and their tags in `frontend/index.html` (the script tag goes right
  after `app/bootguard.js`, which `test/bootguard.test.js` requires to be the first script):
  zoom lock and touch controls (touch → the mouse/wheel events `frontend/app/world.js`
  already handles), plus the phone layout fixes (full-screen COMMS, scrollable build sheet,
  full-height windows). The `mobile.css` link is the LAST stylesheet in `<head>` so its phone
  rules win; one small marked tweak lives in `frontend/app/glass-demo.js` (`seat`).
- `deploy/` and `.github/workflows/deploy-image.yml`.

## Browser-mode notes
- The sidecar only serves loopback `Host`s and only gives its API token to a same-uid
  loopback peer (`sidecar/apiauth.js`, `sidecar/peerowner.js`); the VPS proxy works
  around both. If you change auth, keep a real gate: the page carries a token that can
  drive agents with tool access.
- Desktop-only features (OS keychain, Tauri shell, computer control, local voice models)
  need browser-safe fallbacks or should be hidden in hosted mode.
- Never commit secrets. Provider keys are entered in the UI and stored on the server.
