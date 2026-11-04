// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export function demoEnabled(env: Record<string, string | undefined>): boolean {
  return (
    env.PORTAL_DEMO_MODE === 'on' || (env.VERCEL === '1' && !env.SERVER_URL)
  );
}
export async function loadSampleDocument() {
  const { parse } = await import('yaml');
  return parse(
    await readFile(
      fileURLToPath(
        new URL('../../server/seed/sample-api.openapi.yaml', import.meta.url),
      ),
      'utf8',
    ),
  ) as Record<string, unknown>;
}
