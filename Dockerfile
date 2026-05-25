# Railway / Docker — GLB files via git-lfs (clone fallback when .git is missing from context).
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git git-lfs ca-certificates \
  && git lfs install \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

ARG GIT_REPO_URL=https://github.com/vishalbhor-45/nhit-backend.git
ARG GIT_BRANCH=main
ENV GIT_LFS_SKIP_SMUDGE=0

RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "start"]
