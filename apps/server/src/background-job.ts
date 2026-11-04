// SPDX-License-Identifier: Apache-2.0
import type { FastifyBaseLogger } from 'fastify';
import { GatewayUnavailableError } from '@portal/adapter-sdk';

export function backgroundJob(
  queue: string,
  log: FastifyBaseLogger,
  run: () => Promise<void>,
) {
  return async () => {
    try {
      await run();
    } catch (err) {
      log.error(
        { err, queue },
        err instanceof GatewayUnavailableError
          ? 'Background job failed: gateway unavailable'
          : 'Background job failed: unexpected failure',
      );
      throw err;
    }
  };
}
