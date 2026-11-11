// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';

// Run on a clean checkout: node --experimental-strip-types --test tests/spec003-hygiene.test.ts
// Needs the built dependency packages and local loopback/Orca runtime access.
test(
  'JSO-230 JSO-188 clean build and HOSTNAME=myhost dev leave git clean',
  { timeout: 300000 },
  async () => {
    const status = () =>
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
    assert.equal(status(), '', 'Start from a clean checkout.');
    writeFileSync(
      '/tmp/qa003-clean-build.log',
      execFileSync('pnpm', ['build'], {
        timeout: 240000,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    );
    assert.equal(status(), '', 'Build must not introduce source changes.');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOSTNAME: 'myhost',
      PORT: '3000',
      NEXT_INTERNAL_PORT: '3314',
      PORTAL_DEMO_MODE: 'on',
    };
    delete env.SERVER_URL;
    const child = spawn('pnpm', ['dev'], {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    try {
      await new Promise<void>((resolve, reject) => {
        const capture = (chunk: Buffer) => {
          output += chunk.toString();
          if (/Ready in/.test(output)) resolve();
        };
        child.stdout.on('data', capture);
        child.stderr.on('data', capture);
        child.once('error', reject);
        child.once('exit', (code) =>
          reject(new Error(`dev exited before ready: ${code}\n${output}`)),
        );
      });
      const response = await fetch('http://127.0.0.1:3000/');
      assert.equal(response.status, 200);
      const inventory = JSON.parse(
        execFileSync('orca', ['ports', '--json'], { encoding: 'utf8' }),
      );
      assert.ok(
        inventory.result.ports.some(
          (port: { port: number; bindHost: string }) =>
            port.port === 3000 &&
            ['*', '0.0.0.0', '::'].includes(port.bindHost),
        ),
        'Ingress must bind a wildcard address despite HOSTNAME=myhost.',
      );
    } finally {
      const exited = once(child, 'exit');
      process.kill(-child.pid!, 'SIGINT');
      await exited;
      writeFileSync('/tmp/qa003-clean-dev.log', output);
    }
    assert.equal(
      status(),
      '',
      'Starting and stopping dev must not introduce source changes.',
    );
  },
);
