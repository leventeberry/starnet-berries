# Hosted deployment (starnet-berries)

StarNet upstream is a desktop app (Tauri + a local Node sidecar). This fork runs the
same sidecar as a **hosted browser app** at https://starnet.leventeberry.me.

## How a change reaches the server

1. Work on a branch, open a PR into `main`.
2. Merge. `.github/workflows/deploy-image.yml` builds `deploy/Dockerfile` and pushes
   `ghcr.io/leventeberry/starnet-berries:main` (plus `:sha-<commit>`).
3. On the VPS, `autodeploy@starnet.timer` checks `:main` every ~2 minutes. A new digest
   is pinned in `/opt/starnet/.env` (`STARNET_IMAGE=`) and the stack restarts.
4. If the container isn't healthy and `http://172.18.0.1:4320/api/health` doesn't
   answer within the timeout, the previous image is restored automatically and the bad
   digest is skipped. Log: `/var/log/autodeploy/starnet.log`.

Pause deploys: `touch /opt/starnet/.autodeploy-paused` on the VPS.

## What runs on the VPS

```
internet ─▶ Traefik (TLS) ─▶ Authelia forward-auth (2FA, one user)
         ─▶ 172.18.0.1:4320 ─▶ nginx (uid 1000) ─▶ 127.0.0.1:8787 StarNet sidecar
```

- `deploy/compose.yml` = `/opt/starnet/compose.yml`; `deploy/nginx.conf` =
  `/opt/starnet/proxy/nginx.conf`. The server copies are what run; keep these in sync.
- Data (settings, provider keys file, workspaces): Docker volume `starnet_home` → `/home/node`.
- Shared folder for agents: `/srv/starnet-share` on the VPS → `/home/node/shared`.
  Agents only get it after it is added as a project folder in the UI.

## Why the proxy exists (browser-mode constraints in the sidecar)

The sidecar assumes it is a single-user loopback app:

- `sidecar/apiauth.js` `isAllowedHost`: only `Host: 127.0.0.1|localhost` is served
  (DNS-rebinding guard). nginx rewrites `Host` and drops `Origin`.
- `sidecar/peerowner.js`: the per-launch API token is only inlined into `/` for a
  loopback peer owned by the sidecar's own uid. nginx runs as uid 1000 for this.
  Do **not** set `STARNET_TRUST_LOCAL_PEERS=1`.
- The real access control is Authelia in front. Nothing behind it is public.

## Running it locally

```
npm ci
npm start                      # http://127.0.0.1:8787
docker build -f deploy/Dockerfile -t starnet:dev .   # same image CI builds
```

## Claude Code provider

The image includes the Claude Code CLI (`CLAUDE_CODE_VERSION` in `deploy/Dockerfile`), so the
CLAUDE CODE provider runs it inside the container. To sign in, pick CLAUDE CODE, press
SIGN IN WITH CLAUDE, open the sign-in page, sign in on claude.com and paste the code it shows
back into StarNet. The sign-in is stored in `/home/node/.claude` on the `starnet_home` volume.
The CLI's self-updater is off; bump `CLAUDE_CODE_VERSION` to update it.

## Figma (agent tools + FIGMA viewer)
StarNet uses the owner's own Figma OAuth app (Figma refuses StarNet's automatic app registration).
- In the Figma app's settings, add the redirect URL
  `https://starnet.leventeberry.me/api/connectors/oauth/callback`, and under **Embed API** add the embed origin
  `https://starnet.leventeberry.me`.
- On the server, put the app credentials in `/opt/starnet/figma.env` (`chmod 600`, never committed):
  `STARNET_FIGMA_OAUTH_CLIENT_ID=...` and `STARNET_FIGMA_OAUTH_CLIENT_SECRET=...`, then
  `docker compose -p starnet up -d app` from `/opt/starnet` to load them.
- Agents: CONNECT › ABILITIES → Figma → sign in. Tools: `sidecar/mcp/transport.figma.js`.
  Viewer: the FIGMA window (`frontend/app/windows/figma.js`) embeds any figma.com link. It uses only the client ID.
- The redirect uses `STARNET_PUBLIC_URL` (set in `deploy/Dockerfile`).

## Public webhooks (e.g. a portfolio contact form)
A work line can start from a webhook: `POST /api/hooks/trg_<id>` with the trigger's secret
(`Authorization: Bearer <secret>`). The sidecar answers that one path before its host/token gate, and nginx passes
it through, so the only thing blocking outside callers is Authelia. Open **only that path** and keep the rest behind 2FA.

1. **Authelia** (`configuration.yml` on the VPS). Put this rule FIRST under `access_control.rules`, above the rule that
   protects `starnet.leventeberry.me` (rules match top-down):
   ```yaml
   - domain: 'starnet.leventeberry.me'
     methods: ['POST']
     resources:
       - '^/api/hooks/trg_[a-z0-9]{8,24}([?].*)?$'
     policy: 'bypass'
   ```
   Restart Authelia. Anything else (GET, other `/api` paths, the UI) still needs 2FA.
2. **Traefik rate limit (recommended).** StarNet already limits each trigger (default 20/hour) and each line's daily $,
   but cap raw traffic before it reaches the box. Add a `rateLimit` middleware (e.g. `average: 10`, `period: 1m`,
   `burst: 5`) to the StarNet router, or to a separate higher-priority router for
   ``PathRegexp(`^/api/hooks/trg_`)`` that keeps the Authelia middleware off only that path.
3. **Test from outside the server** (replace the id with one from WORKFLOWS › INBOX › "A webhook is called"):
   ```sh
   # StarNet itself answers (401 from the sidecar, NOT an Authelia redirect/login page):
   curl -si -X POST https://starnet.leventeberry.me/api/hooks/trg_xxxxxxxx -H 'Authorization: Bearer wrong' | head -1
   # Everything else is still gated (expect Authelia's 302/401):
   curl -si https://starnet.leventeberry.me/api/hooks/trg_xxxxxxxx | head -1
   curl -si -X POST https://starnet.leventeberry.me/api/routing/triggers | head -1
   # A real call (expect 202 with a jobId):
   curl -si -X POST https://starnet.leventeberry.me/api/hooks/trg_xxxxxxxx \
     -H "Authorization: Bearer $HOOK_SECRET" -H 'Content-Type: application/json' \
     -H 'Idempotency-Key: test-1' -d '{"name":"Test","message":"hello"}'
   ```
   If the first command returns the Authelia login page, the rule is below another rule or the regex didn't match.

Keep the secret on a server (e.g. a Vercel env var read by a serverless function), never in a web page.
The webhook URL StarNet shows uses `STARNET_PUBLIC_URL`. To get a Telegram ping when a webhook job finishes, turn on
CHANNELS › "Send completed-work updates" (the same opt-in routines use). Details: `docs/LINE_WEBHOOKS.md`.
