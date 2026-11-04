// SPDX-License-Identifier: Apache-2.0
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createIngress } from './proxy.js';

const mode = process.argv[2] || 'standalone';
if (!['dev', 'start', 'standalone'].includes(mode))
  throw new Error('Invalid portal mode');
const port = Number(process.env.PORT || 3000);
const innerPort = Number(process.env.NEXT_INTERNAL_PORT || port + 1);
if (
  !Number.isInteger(port) ||
  !Number.isInteger(innerPort) ||
  port === innerPort
)
  throw new Error('Portal and internal Next ports must be distinct integers');
const require = createRequire(import.meta.url);
const args =
  mode === 'standalone'
    ? [fileURLToPath(new URL('../server.js', import.meta.url))]
    : [
        require.resolve('next/dist/bin/next'),
        mode,
        '--hostname',
        '127.0.0.1',
        '--port',
        String(innerPort),
      ];
const ingress = createIngress(innerPort);
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(innerPort), HOSTNAME: '127.0.0.1' },
});
ingress.on('error', () => {
  child.kill();
  process.exitCode = 1;
});
ingress.listen(port, process.env.HOSTNAME || '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    ingress.close();
    child.kill(signal);
  });
child.on('error', () => {
  ingress.close();
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  ingress.closeAllConnections();
  ingress.close();
  process.exitCode =
    code ?? (signal === 'SIGTERM' || signal === 'SIGINT' ? 0 : 1);
});
