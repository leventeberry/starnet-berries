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
