// SPDX-License-Identifier: Apache-2.0
import { registerUsage } from './usage.js';
import { registerAccount } from './account.js';
import { registerAdminSettings } from './admin-settings.js';
import { registerTheme } from './theme.js';
import { limitedAuth } from './auth-limits.js';
import { mailQueue, type EnqueueMail } from './mail/queue.js';
import { portalProxy } from './trusted-proxy.js';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Database } from '@portal/db';
import { instanceSettings } from '@portal/db';
import { gatewayConnection, type AdapterFor } from './gateway-connection.js';
import type { Config } from './config.js';
import { createAuth, headersFor, type Auth } from './auth.js';
import { problemHandler } from './problem.js';
import { loadLinter } from './lint/index.js';
import { registerVersions } from './versions.js';
import { registerSearch } from './search.js';
import { registerCatalog } from './catalog.js';
import { registerAgentDocs } from './agent-docs.js';
import { registerImport } from './import.js';
import { registerTeams } from './teams.js';
import { registerProducts } from './products.js';
import { registerAccessRequests } from './access-requests.js';
import { registerProductAccess } from './product-access.js';
import type { EnqueueRevocation } from './revocation.js';
import { registerApps } from './apps.js';
import { registerSetup } from './setup.js';
import { registerGateways } from './gateways.js';
import { registerProxy } from './proxy.js';
import { sql } from 'drizzle-orm';
import { createRequire } from 'node:module';
import { Problem } from './problem.js';
import { registerTracing } from './tracing.js';
const fastifyRequire = createRequire(import.meta.url);
const { stdSerializers } = createRequire(fastifyRequire.resolve('fastify'))(
  'pino',
) as {
  stdSerializers: {
    errWithCause: (err: Error) => {
      type: string;
      message: string;
      stack: string;
      [key: string]: unknown;
    };
  };
};
export interface AppOptions {
  db: Database;
  config: Config;
  adapterFor?: AdapterFor;
  enqueueRevocation?: EnqueueRevocation;
  enqueueReconcile?: () => Promise<unknown>;
  enqueueTracingApply?: () => Promise<unknown>;
  auth?: Auth;
  enqueueMail?: EnqueueMail;
  logger?: FastifyServerOptions['logger'];
  proxyFetch?: typeof fetch;
}
export async function databaseReadiness(
  db: Pick<Database, 'execute'>,
  timeoutMs = 2_000,
) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('readiness timeout')),
          timeoutMs,
        );
      }),
    ]);
    return { status: 'ok', database: 'ok' } as const;
  } catch {
    throw new Problem(
      503,
      'database-unavailable',
      "The server can't reach its database.",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
export async function createApp(options: AppOptions) {
  const { db, config } = options;
  const linter = await loadLinter(config.PORTAL_LINT_RULESET);
  const enqueue = options.enqueueMail ?? mailQueue(config);
  const auth = options.auth ?? createAuth(db, config, enqueue);
  const proxy = portalProxy(config.PORTAL_PROXY_HOST);
  const app = Fastify({
    trustProxy: proxy.trust,
    bodyLimit: 1024 * 1024,
    logger:
      options.logger === false
        ? false
        : {
            level: 'info',
            ...(typeof options.logger === 'object' ? options.logger : {}),
            redact: {
              paths: [
                'key',
                'apikey',
                'authorization',
                'cookie',
                'password',
                'setupToken',
                'adminToken',
                '*.setupToken',
                '*.adminToken',
                'req.headers.apikey',
                'req.headers.authorization',
                'req.headers.cookie',
                '*.password',
                'newPassword',
                'currentPassword',
                'token',
                'smtpPassword',
                '*.newPassword',
                '*.currentPassword',
                '*.token',
                '*.smtpPassword',
                '*.passwordCiphertext',
                '*.link',
                '*.key',
                '*.apikey',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req: (request: { method: string; url: string }) => ({
                method: request.method,
                // Better Auth reset links carry the bearer token in the path.
                // Redact the entire suffix, including malformed extra segments.
                url: request.url
                  .split('?')[0]!
                  .replace(
                    /^(\/api\/auth\/reset-password)\/.*/,
                    '$1/[REDACTED]',
                  ),
              }),
              err: stdSerializers.errWithCause,
            },
          },
  });
  if (linter.health.status === 'error')
    app.log.error({ lint: linter.health }, 'Lint ruleset unavailable');
  const [instance] = await db.select().from(instanceSettings).limit(1);
  if (!instance) throw new Error('Instance missing');
  const connection = gatewayConnection(
    db,
    config,
    instance.instanceId,
    app.log,
    options.adapterFor,
  );
  app.addHook('onRequest', proxy.refresh);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  problemHandler(app);
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, config.PORTAL_PUBLIC_URL);
      const response = await limitedAuth(
        db,
        auth,
        request,
        reply,
        url.pathname,
        () =>
          auth.handler(
            new Request(url, {
              method: request.method,
              headers: headersFor(request),
              body:
                request.body === undefined
                  ? undefined
                  : JSON.stringify(request.body),
            }),
          ),
      );
      const cookies = response.headers.getSetCookie();
      for (const [name, value] of response.headers)
        if (name !== 'set-cookie') reply.header(name, value);
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.code(response.status).send(await response.text());
    },
  });
  registerAccount(app, db, auth, connection, config, enqueue);
  registerAdminSettings(app, db, auth, config);
  await registerTheme(app, db, auth);
  app.get('/api/v1/health/live', async () => ({ status: 'ok' }));
  app.get('/api/v1/health/ready', async () => databaseReadiness(db));
  app.get('/api/v1/health', async () => {
    const gateway = await connection.load();
    const health = gateway?.adapter
      ? await gateway.adapter.health()
      : { reachable: false };
    return {
      status: linter.health.status === 'error' ? 'degraded' : 'ok',
      lint: linter.health,
      version: config.PORTAL_VERSION,
      gateway: gateway
        ? {
            kind: 'kong',
            reachable: health.reachable,
            ...('version' in health && health.version
              ? { version: health.version }
              : {}),
          }
        : null,
    };
  });
  await registerSetup(
    app,
    db,
    auth,
    config.NODE_ENV === 'production',
    config.NODE_ENV === 'production' ? config.PORTAL_ENCRYPTION_KEY : undefined,
  );
  await registerGateways(
    app,
    db,
    auth,
    connection,
    instance.instanceId,
    options.enqueueReconcile ?? (async () => {}),
  );
  registerCatalog(app, db, auth);
  registerAgentDocs(app, db, auth, config.PORTAL_PUBLIC_URL);
  await registerSearch(app, db, auth);
  registerImport(app, db, auth, connection, linter);
  registerVersions(app, db, auth, linter);
  registerTeams(app, db, auth, config, enqueue);
  registerUsage(app, db, auth, connection);
  registerTracing(
    app,
    db,
    auth,
    connection,
    options.enqueueTracingApply,
  );
  registerApps(app, db, auth, connection, enqueue);
  registerAccessRequests(app, db, auth, connection, enqueue);
  registerProductAccess(
    app,
    db,
    auth,
    connection,
    enqueue,
    options.enqueueRevocation ?? (async () => {}),
  );
  registerProducts(
    app,
    db,
    auth,
    options.enqueueReconcile ?? (async () => {}),
    connection,
    enqueue,
    options.enqueueRevocation ?? (async () => {}),
  );
  await registerProxy(app, db, connection.adapterFor, options.proxyFetch, {
    auth,
  });
  return { app, auth };
}
