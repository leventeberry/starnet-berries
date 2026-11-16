# starnet-berries: StarNet as a hosted browser app.
# Build from the repo root:  docker build -f deploy/Dockerfile .
# CI (.github/workflows/deploy-image.yml) pushes ghcr.io/leventeberry/starnet-berries:main,
# which the VPS deploys automatically (see deploy/README.md).
# Node 22: the station browser drives Chrome over the global WebSocket, which Node 20 lacks.
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Claude Code CLI for the CLAUDE CODE provider (it runs `claude` on the station, i.e. this container).
# Sign-in happens in the browser: StarNet shows a claude.com link and you paste back the code it gives.
# The sign-in lives in /home/node/.claude on the starnet_home volume, so it survives redeploys.
# Pinned on purpose: CI caches this layer, so bump the version here to update it.
ARG CLAUDE_CODE_VERSION=2.1.311
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} --no-audit --no-fund \
 && npm cache clean --force && claude --version
# root owns the install, so the CLI can't update itself; updates come from bumping the version above
ENV DISABLE_AUTOUPDATER=1
# Agent CLIs: GitHub (gh) and Vercel. StarNet scrubs token-like env vars from agent shells and hands
# KEYS-tab entries over as <NAME>_API_KEY, so the wrappers in deploy/agent-bin map a "GitHub" key to
# GH_TOKEN and a "Vercel" key to VERCEL_TOKEN. git over https authenticates through gh.
ARG VERCEL_CLI_VERSION=65.15.0
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh && rm -rf /var/lib/apt/lists/* \
 && npm install -g --prefix /opt/vercel-cli --no-audit --no-fund vercel@${VERCEL_CLI_VERSION} && npm cache clean --force \
 && git config --system credential.https://github.com.helper '' \
 && git config --system --add credential.https://github.com.helper '!/usr/local/bin/gh auth git-credential'
COPY deploy/agent-bin/gh deploy/agent-bin/vercel /usr/local/bin/
# Station browser: Debian's Chromium plus its system libraries and fonts. Docker's seccomp profile blocks the
# user namespaces Chromium's sandbox needs (the container itself is the boundary: cap_drop ALL, no-new-privileges),
# so it runs --no-sandbox; /dev/shm is 64 MB in Docker, hence --disable-dev-shm-usage.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/* \
 && echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage"' > /etc/chromium.d/starnet-docker
ENV STARNET_CHROME=/usr/bin/chromium
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# --chown here instead of a later `chown -R`, which would copy every file into a second layer
COPY --chown=node:node . .
ARG BUILD_SHA=unknown
ENV HOME=/home/node NODE_ENV=production STARNET_BUILD_SHA=$BUILD_SHA
# OAuth redirect URIs (connectors like Vercel, Spotify) must point at the address the browser uses, not the container's loopback
ENV STARNET_PUBLIC_URL=https://starnet.leventeberry.me
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "sidecar/index.js"]
