# Railway / Docker — GLB files via git-lfs (clone fallback when .git is missing from context).
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git git-lfs ca-certificates \
  && git lfs install \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN git lfs install \
  && (git lfs pull --include="upload/model_3d/*.glb" 2>/dev/null || true)

RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
