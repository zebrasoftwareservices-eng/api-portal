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
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @portal/portal... build
FROM node:22-alpine AS runtime
ARG PORTAL_VERSION=dev
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    PORTAL_VERSION=${PORTAL_VERSION} TMPDIR=/tmp
LABEL org.opencontainers.image.source="https://github.com/zebrasoftwareservices-eng/api-portal" \
      org.opencontainers.image.version=${PORTAL_VERSION}
COPY --from=build --chown=node:node /app/apps/portal/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=build --chown=node:node /app/apps/portal/dist ./apps/portal/dist
USER node
EXPOSE 3000
CMD ["node", "apps/portal/dist/start.js"]
