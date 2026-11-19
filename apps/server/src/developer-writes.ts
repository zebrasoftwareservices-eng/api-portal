// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance, InjectOptions } from 'fastify';

const DEVELOPER_WRITES =
  /^(?:POST \/api\/v1\/apps|POST \/api\/v1\/access-requests|PUT \/api\/v1\/apps\/[^/]+\/plan|POST \/api\/v1\/apps\/[^/]+\/credentials|POST \/api\/v1\/apps\/[^/]+\/credentials\/[^/]+\/regenerate)$/;

// Existing fixtures sign in as a portal admin and then create apps. Spec 024
// refuses those writes. Flip that session to a developer for the five write
// routes only, keeping the same user id, and restore it when they finish.
export function installDeveloperWrites(
  app: FastifyInstance,
  getRole: () => string | undefined,
  setRole: (role: string) => void,
) {
  const original = app.inject.bind(app);
  let holds = 0;
  let restore: string | null = null;
  const wrapped = (opts: InjectOptions | string) => {
    const method = (
      typeof opts === 'string' ? 'GET' : (opts.method ?? 'GET')
    ).toUpperCase();
    const rawUrl = typeof opts === 'string' ? opts : opts.url;
    const path =
      typeof rawUrl === 'string'
        ? (rawUrl.split('?')[0] ?? '')
        : (rawUrl?.pathname ?? '');
    const write = DEVELOPER_WRITES.test(`${method} ${path}`);
    let tracked = false;
    if (write) {
      if (holds === 0 && getRole() === 'admin') {
        restore = 'admin';
        setRole('developer');
      }
      if (restore !== null) {
        holds += 1;
        tracked = true;
      }
    }
    const finish = () => {
      if (!tracked || restore === null) return;
      holds -= 1;
      if (holds === 0) {
        setRole(restore);
        restore = null;
      }
    };
    try {
      return Promise.resolve(original(opts)).finally(finish);
    } catch (error) {
      finish();
      throw error;
    }
  };
  app.inject = wrapped as typeof app.inject;
}
