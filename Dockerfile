# Railway / Docker: install git-lfs, pull GLB binaries, verify, then start API.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git git-lfs ca-certificates \
  && git lfs install \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Full git clone (incl. .git) is required for git lfs pull on Railway.
COPY . .

ENV GIT_LFS_SKIP_SMUDGE=0

RUN set -eux \
  && git lfs install \
  && git lfs pull --include="upload/model_3d/*.glb" \
  && NODE_ENV=production node scripts/verify-glb-deploy.js \
  && npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "start"]
