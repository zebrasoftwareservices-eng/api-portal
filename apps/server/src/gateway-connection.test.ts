// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from 'vitest';
import type { GatewayAdapter } from '@portal/adapter-sdk';
import {
  checkAddress,
  checkConnection,
  connectionFailure,
  normalizeUrl,
  resolveToken,
  type GatewayRow,
} from './gateway-connection.js';
import { loadConfig } from './config.js';
import { encrypt } from './crypto.js';
const config = loadConfig({});
const previous = {
  adminUrl: 'http://kong:8001/admin',
  adminTokenCiphertext: encrypt('unique-secret', config.PORTAL_ENCRYPTION_KEY),
} as GatewayRow;
it('normalizes comparison and never sends a stored token to a changed URL', () => {
  expect(normalizeUrl('HTTP://KONG:80/admin/', 'adminUrl')).toBe(
    'http://kong/admin',
  );
  expect(resolveToken('', previous.adminUrl, previous, config)).toBe(
    'unique-secret',
  );
  for (const url of [
    'https://kong:8001/admin',
    'http://other:8001/admin',
    'http://kong:8002/admin',
    'http://kong:8001/else',
  ])
    expect(() => resolveToken('', url, previous, config)).toThrow(
      'Enter the token',
    );
  expect(resolveToken(null, 'http://other', previous, config)).toBeUndefined();
});
it('gives safe recovery guidance for unreadable stored tokens', () => {
  expect(() =>
    resolveToken(
      '',
      previous.adminUrl,
      { ...previous, adminTokenCiphertext: 'unreadable' },
      config,
    ),
  ).toThrow('Enter the token again');
  expect(
    resolveToken(
      'replacement',
      previous.adminUrl,
      { ...previous, adminTokenCiphertext: 'unreadable' },
      config,
    ),
  ).toBe('replacement');
});
it.each([
  'ftp://kong',
  'http://user:pass@kong',
  'http://kong?q=x',
  'http://kong/#fragment',
])('rejects invalid URL %s', (url) =>
  expect(() => normalizeUrl(url, 'adminUrl')).toThrow(),
);
it('blocks metadata including encoded IPv4, IPv6 and DNS results, while allowing private networks', async () => {
  for (const url of [
    'http://169.254.169.254',
    'http://2852039166/',
    'http://[fe80::1]',
    'http://[::ffff:169.254.169.254]',
    'http://100.100.100.200',
    'http://[fd00:ec2::254]',
  ])
    await expect(checkAddress(url, 'adminUrl')).rejects.toThrow();
  const lookup = vi.fn(async () => [{ address: '169.254.169.254', family: 4 }]);
  await expect(
    checkAddress('http://metadata.test', 'adminUrl', lookup as never),
  ).rejects.toThrow();
  await expect(
    checkAddress('http://10.0.0.1', 'adminUrl'),
  ).resolves.toBeUndefined();
});
it('maps outcomes without exposing adapter data and checks the proxy only after Kong', async () => {
  const proxy = vi.fn(async () => true);
  const adapter = {
    checkConnection: async () => ({ outcome: 'unreachable' }),
    checkProxy: proxy,
  } as unknown as GatewayAdapter;
  await expect(
    checkConnection(
      {
        adminUrl: 'http://localhost',
        proxyInternalUrl: 'http://127.0.0.1',
        proxyPublicUrl: 'http://localhost',
      },
      adapter,
    ),
  ).rejects.toThrow('resolved from the portal server');
  expect(proxy).not.toHaveBeenCalled();
});
it.each(['localhost', '127.0.0.1', '[::1]'])(
  'explains how to replace unreachable loopback address %s',
  (host) => {
    expect(
      connectionFailure('unreachable', `http://${host}:8001`).message,
    ).toBe(
      "The portal couldn't reach that address. It's resolved from the portal server, not your machine, so localhost means the server itself. If Kong runs in the same compose network, use its service name, like http://kong:8001.",
    );
    expect(connectionFailure('refused', `http://${host}:8001`).message).toBe(
      'Kong refused the request because the Admin API token is wrong or missing. Check the token and try again.',
    );
  },
);
it('keeps non-loopback unreachable guidance specific to the Admin API', () => {
  expect(connectionFailure('unreachable', 'http://kong:8001').message).toBe(
    "The portal couldn't reach that address. Check the Admin API URL and that Kong is running.",
  );
});
