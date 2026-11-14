// SPDX-License-Identifier: Apache-2.0
import { SchemaAheadError } from '@portal/db';
import { ConfigError, loadConfig } from './config.js';
import { start } from './startup.js';

export function formatStartupError(error: unknown) {
  if (error instanceof ConfigError)
    return error.settings.map((setting) => `${setting}: ${error.code}`).join('\n');
  if (error instanceof SchemaAheadError)
    return 'This database was upgraded by a newer portal version. Nothing was changed. To roll back: restore the backup taken before the upgrade, then start the previous version. See docs/install/production.md#roll-back.';
  return undefined;
}

try {
  const app = await start(loadConfig());
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => { void app.close(); });
} catch (error) {
  const message = formatStartupError(error);
  if (!message) throw error;
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
