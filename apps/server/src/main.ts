// SPDX-License-Identifier: Apache-2.0
import { loadConfig } from './config.js';
import { start } from './startup.js';
const app = await start(loadConfig());
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void app.close();
  });
