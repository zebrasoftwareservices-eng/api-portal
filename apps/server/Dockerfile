# SPDX-License-Identifier: Apache-2.0
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Shared with the portal build: fetch the locked workspace graph once.
RUN pnpm fetch
FROM deps AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @portal/server... build
# Deploy copies only the server's production graph and the package files lists.
# Reuse the fetched store rather than deleting/reinstalling the workspace tree.
RUN pnpm --filter @portal/server deploy --prod --offline /runtime
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /runtime ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
