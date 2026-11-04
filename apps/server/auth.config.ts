// SPDX-License-Identifier: Apache-2.0
import { createAuth } from './src/auth.js';
import { loadConfig } from './src/config.js';
import { connect } from '@portal/db';
export const auth = createAuth(
  connect(loadConfig().DATABASE_URL).db,
  loadConfig(),
);
