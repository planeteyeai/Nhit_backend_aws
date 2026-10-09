FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Don't hardcode NODE_ENV here - let it come from Secrets Manager
# ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]
