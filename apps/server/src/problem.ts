// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import {
  GatewayRejectedError,
  GatewayUnavailableError,
} from '@portal/adapter-sdk';
export class Problem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
    readonly errors?: { message: string; pointer?: string }[],
    readonly fields?: {
      apis?: number;
      activeKeys?: number;
      affectedKeys?: number;
    },
    readonly errorCount?: number,
  ) {
    super(detail);
  }
}
export const notFound = () =>
  new Problem(404, 'not-found', 'The requested resource was not found.');
export function problemHandler(app: FastifyInstance) {
  app.setNotFoundHandler((_req, reply) =>
    reply
      .code(404)
      .type('application/problem+json')
      .send({ type: '/problems/not-found', title: 'Not found', status: 404 }),
  );
  app.setErrorHandler((err, req, reply) => {
    let p: Problem;
    if (err instanceof Problem) p = err;
    else if (err instanceof GatewayUnavailableError)
      p = new Problem(
        503,
        'gateway-unavailable',
        "The API gateway didn't respond. Nothing was created. Try again in a moment.",
      );
    else if (err instanceof GatewayRejectedError)
      p = new Problem(
        502,
        'gateway-rejected',
        'The API gateway rejected the request. Nothing was changed.',
      );
    else if (err instanceof ZodError)
      p = new Problem(
        400,
        'validation',
        'Request validation failed.',
        err.issues.map((i) => ({
          message: i.message,
          pointer: '/' + i.path.join('/'),
        })),
      );
    else if (
      err instanceof Error &&
      'statusCode' in err &&
      err.statusCode === 413
    )
      p = new Problem(
        413,
        'payload-too-large',
        'The request body exceeds the allowed size.',
      );
    else if (
      err instanceof Error &&
      (('statusCode' in err && err.statusCode === 400) || 'validation' in err)
    )
      p = new Problem(400, 'validation', 'Request validation failed.');
    else {
      p = new Problem(500, 'internal', 'An unexpected error occurred.');
      app.log.error({ err, reqId: req.id, code: 'internal' }, 'Request failed');
    }
    if (p.status === 503) reply.header('Retry-After', '5');
    return reply
      .code(p.status)
      .type('application/problem+json')
      .send({
        type: `/problems/${p.code}`,
        title:
          (
            {
              'gateway-unreachable': "The portal couldn't reach that address",
              'gateway-token-refused': 'Kong refused the token',
              'gateway-not-kong': "That address isn't a Kong Admin API",
              'gateway-read-only': "This Kong can't be written to",
              'gateway-proxy-unreachable':
                "The portal can't reach Kong's proxy",
              'gateway-token-required': 'Enter the token again',
              'gateway-exists': 'This portal already has a gateway',
              'gateway-env-managed':
                'This gateway is set by environment variables',
              'gateway-in-use': 'This gateway is still in use',
              'gateway-keys-missing': "Some keys won't work on this Kong",
              'gateway-disabled': 'Gateway disabled',
              'gateway-not-connected': 'No gateway connected',
              'setup-complete': 'This portal already has an admin',
              'setup-token-invalid': 'Setup token not accepted',
              'sample-not-available': "The sample isn't available here",
              'gateway-service-has-acl':
                'Another ACL plugin applies to this service',
              'gateway-service-already-linked':
                'This service already has a published API',
            } as Record<string, string>
          )[p.code] ?? p.code.replaceAll('-', ' '),
        status: p.status,
        detail: p.message,
        instance: req.url.split('?')[0],
        ...(p.errors ? { errors: p.errors } : {}),
        ...(p.errorCount === undefined ? {} : { errorCount: p.errorCount }),
        ...p.fields,
      });
  });
}
