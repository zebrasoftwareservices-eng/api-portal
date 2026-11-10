// SPDX-License-Identifier: Apache-2.0
import { registerAccount } from './account.js';
import { registerAdminSettings } from './admin-settings.js';
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
import { registerCatalog } from './catalog.js';
import { registerImport } from './import.js';
import { registerApps } from './apps.js';
import { registerSetup } from './setup.js';
import { registerGateways } from './gateways.js';
import { registerProxy } from './proxy.js';
export interface AppOptions {
  db: Database;
  config: Config;
  adapterFor?: AdapterFor;
  setupToken?: string;
  enqueueReconcile?: () => Promise<unknown>;
  auth?: Auth;
  enqueueMail?: EnqueueMail;
  logger?: FastifyServerOptions['logger'];
  proxyFetch?: typeof fetch;
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
  app.get('/api/v1/health', async () => {
    const gateway = await connection.load();
    const health = gateway?.adapter
      ? await gateway.adapter.health()
      : { reachable: false };
    return {
      status: linter.health.status === 'error' ? 'degraded' : 'ok',
      lint: linter.health,
      version: '0.1.0',
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
    options.setupToken,
  );
  await registerGateways(
    app,
    db,
    auth,
    connection,
    instance.instanceId,
    options.enqueueReconcile ?? (async () => {}),
  );
  registerCatalog(app, db);
  registerImport(app, db, auth, connection, linter);
  registerVersions(app, db, auth, linter);
  registerApps(app, db, auth, connection);
  await registerProxy(app, db, connection.adapterFor, options.proxyFetch);
  return { app, auth };
}
