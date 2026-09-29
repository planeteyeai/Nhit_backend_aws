# Cloud conversion image: Node app + PotreeConverter (Linux).
# Run the worker here (VPS / Lightsail / EC2 / Railway) — not on a laptop.

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates curl unzip libtbb12 \
	&& rm -rf /var/lib/apt/lists/*

# PotreeConverter 2.1.1 Linux x64
ARG POTREE_VERSION=2.1.1
RUN mkdir -p /opt/PotreeConverter \
	&& curl -fsSL -o /tmp/potree.zip \
		"https://github.com/potree/PotreeConverter/releases/download/${POTREE_VERSION}/PotreeConverter_${POTREE_VERSION}_x64_linux.zip" \
	&& unzip -q /tmp/potree.zip -d /opt/PotreeConverter \
	&& rm /tmp/potree.zip \
	&& BIN="$(find /opt/PotreeConverter -type f -name PotreeConverter | head -n 1)" \
	&& ln -sf "$BIN" /usr/local/bin/PotreeConverter \
	&& chmod +x "$BIN" /usr/local/bin/PotreeConverter

ENV POTREE_CONVERTER_PATH=/usr/local/bin/PotreeConverter
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY lib ./lib
COPY api ./api
COPY server ./server
COPY worker ./worker
COPY docker ./docker
COPY public ./public
COPY vercel.json ./

RUN mkdir -p /app/tmp/convert

EXPOSE 3000

# ROLE=web | worker | all
ENV ROLE=all
CMD ["node", "docker/entrypoint.js"]
