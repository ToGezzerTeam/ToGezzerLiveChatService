FROM debian:bookworm-slim AS base
WORKDIR /app
ENV MEDIASOUP_MAX_CORES=1
ENV npm_config_jobs=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       curl \
       ca-certificates \
       python3 \
       python3-pip \
       build-essential \
  # Installer Node.js 22 via NodeSource
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM debian:bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=1024

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/src/main.js"]