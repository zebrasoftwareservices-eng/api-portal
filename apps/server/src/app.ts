// SPDX-License-Identifier: Apache-2.0
import { portalProxy } from './trusted-proxy.js';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Database } from '@portal/db';
import type { GatewayAdapter } from '@portal/adapter-sdk';
import type { Config } from './config.js';
import { createAuth, headersFor, requireUser, type Auth } from './auth.js';
import { problemHandler } from './problem.js';
import { registerCatalog } from './catalog.js';
import { registerImport } from './import.js';
import { registerApps } from './apps.js';
import { registerProxy } from './proxy.js';
export interface AppOptions {
  db: Database;
  config: Config;
  adapter: GatewayAdapter;
  gatewayId: string;
  auth?: Auth;
  logger?: FastifyServerOptions['logger'];
  proxyFetch?: typeof fetch;
}
export async function createApp(options: AppOptions) {
  const { db, config, adapter, gatewayId } = options;
  const auth = options.auth ?? createAuth(db, config);
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
                'req.headers.apikey',
                'req.headers.authorization',
                'req.headers.cookie',
                '*.password',
                '*.key',
                '*.apikey',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req: (request: { method: string; url: string }) => ({
                method: request.method,
                url: request.url.split('?')[0],
              }),
            },
          },
  });
  app.addHook('onRequest', proxy.refresh);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  problemHandler(app);
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, config.PORTAL_PUBLIC_URL);
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: headersFor(request),
          body:
            request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
        }),
      );
      const cookies = response.headers.getSetCookie();
      for (const [name, value] of response.headers)
        if (name !== 'set-cookie') reply.header(name, value);
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.code(response.status).send(await response.text());
    },
  });
  app.get('/api/v1/me', async (request) => {
    const user = await requireUser(auth, request);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  });
  app.get('/api/v1/health', async () => {
    const health = await adapter.health();
    return {
      status: 'ok',
      version: '0.1.0',
      gateway: {
        kind: 'kong',
        reachable: health.reachable,
        ...(health.version ? { version: health.version } : {}),
      },
    };
  });
  registerCatalog(app, db);
  registerImport(app, db, auth, adapter, gatewayId);
  registerApps(app, db, auth, adapter, gatewayId);
  await registerProxy(app, db, options.proxyFetch);
  return { app, auth };
}
