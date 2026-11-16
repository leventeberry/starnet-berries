# starnet-berries: StarNet as a hosted browser app.
# Build from the repo root:  docker build -f deploy/Dockerfile .
# CI (.github/workflows/deploy-image.yml) pushes ghcr.io/leventeberry/starnet-berries:main,
# which the VPS deploys automatically (see deploy/README.md).
FROM node:20-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# --chown here instead of a later `chown -R`, which would copy every file into a second layer
COPY --chown=node:node . .
ARG BUILD_SHA=unknown
ENV HOME=/home/node NODE_ENV=production STARNET_BUILD_SHA=$BUILD_SHA
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "sidecar/index.js"]
