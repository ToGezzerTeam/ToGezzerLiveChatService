FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ \
  && ln -s /usr/bin/python3 /usr/local/bin/python \
  && python3 -m pip install --break-system-packages invoke \
  && rm -rf /var/lib/apt/lists/*

# Limite la compilation C++ de mediasoup
ENV MEDIASOUP_MAX_CORES=2

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]