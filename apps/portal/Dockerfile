# SPDX-License-Identifier: Apache-2.0
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
FROM deps AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1 SERVER_URL=http://server:4000
RUN pnpm --filter @portal/portal... build
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/portal/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/portal/.next/static ./apps/portal/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/portal/server.js"]
