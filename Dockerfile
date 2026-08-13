# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/

RUN apt-get update \
    && apt-get install --yes --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --registry="${NPM_REGISTRY}"

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app

RUN groupadd --gid 10001 northstar \
    && useradd --uid 10001 --gid northstar --no-create-home --shell /usr/sbin/nologin northstar

COPY --from=build --chown=northstar:northstar /app/package.json /app/package-lock.json ./
COPY --from=build --chown=northstar:northstar /app/node_modules ./node_modules
COPY --from=build --chown=northstar:northstar /app/dist ./dist
COPY --chown=northstar:northstar public ./public

USER 10001:10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/src/server.js"]
