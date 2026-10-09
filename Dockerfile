FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm ci --omit=dev

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
