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
- Figma: `sidecar/mcp/transport.figma.js`, `frontend/app/windows/figma.js` (+ its script tag after
  `windows/trophies.js`), the `figma` row in `sidecar/mcp/catalog.js`, and `starnet-berries`-marked lines in
  `sidecar/index.js` (Figma env client, refreshEndpoint, /api/figma/embed, CSP
  frame-src) and `sidecar/mcp/catalog.js`/`frontend/app/places.js`. See `deploy/README.md` § Figma.
- Public webhooks: `starnet-berries`-marked lines in `sidecar/index.js` (`triggerHookUrl`/`hookBase` use
  `PUBLIC_BASE`; `notifyTriggerFinished` pings chats when a webhook job settles), the `onFinished` dep in
  `sidecar/routing/trigger-runner.js`, and the hosted help text in `frontend/app/workflowpanel.js`. See
  `deploy/README.md` § Public webhooks.
- SWITCH machine (a FILTER whose cases are values of a JSON field, default `tag`): `switch`-marked entries next to
  every `filter` one in `frontend/app/{pipeline,worldmodel,build,lineedit,linelayout,stationbuilder,stationcommands,conveyor}.js`,
  `F.switch` + its catalog row in `propsprites.js`, `paintSwitch` in `workflowpanel.js`, `text:` on the routing ctx in
  `sidecar/routing/chain.js` and `steptest.js`, and `test/switch.test.js`. It compiles to a filter junction with `field` set,
  so FILTER plans and hashes are unchanged. After editing `frontend/`, run `node scripts/sync-website-app.mjs`.

## Browser-mode notes
- The sidecar only serves loopback `Host`s and only gives its API token to a same-uid
  loopback peer (`sidecar/apiauth.js`, `sidecar/peerowner.js`); the VPS proxy works
  around both. If you change auth, keep a real gate: the page carries a token that can
  drive agents with tool access.
- Desktop-only features (OS keychain, Tauri shell, computer control, local voice models)
  need browser-safe fallbacks or should be hidden in hosted mode.
- Never commit secrets. Provider keys are entered in the UI and stored on the server.
