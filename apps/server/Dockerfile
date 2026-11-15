# SPDX-License-Identifier: Apache-2.0
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
# Keep the build toolchain separate from the service's production dependencies.
FROM deps AS production-deps
COPY . .
# fetch populates both the content store and a full workspace virtual store.
# Relink only the server's production graph; keep the content store for offline use.
RUN rm -rf node_modules && pnpm --filter @portal/server... install --prod --offline --frozen-lockfile
FROM deps AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @portal/server... build
FROM node:22-alpine AS runtime
ARG PORTAL_VERSION=dev
ENV NODE_ENV=production PORTAL_VERSION=${PORTAL_VERSION}
LABEL org.opencontainers.image.source="https://github.com/zebrasoftwareservices-eng/api-portal" \
      org.opencontainers.image.version="${PORTAL_VERSION}"
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/packages ./packages
COPY --from=production-deps /app/apps/server ./apps/server
COPY --from=build /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/adapter-sdk/dist ./packages/adapter-sdk/dist
COPY --from=build /app/packages/adapter-kong/dist ./packages/adapter-kong/dist
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/rulesets ./apps/server/rulesets
USER node
EXPOSE 4000
CMD ["node", "apps/server/dist/main.js"]
