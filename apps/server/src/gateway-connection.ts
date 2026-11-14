// SPDX-License-Identifier: Apache-2.0
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { gateways, type Database } from '@portal/db';
import type { GatewayAdapter } from '@portal/adapter-sdk';
import { KongAdapter } from '@portal/adapter-kong';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import { decrypt } from './crypto.js';
import { Problem } from './problem.js';
export type GatewayRow = typeof gateways.$inferSelect;
export type AdapterFor = (
  row: GatewayRow & { adminToken?: string },
) => GatewayAdapter;
export type DbConnection =
  Database | Parameters<Parameters<Database['transaction']>[0]>[0];
export interface LoadedGateway {
  row: GatewayRow;
  adapter: GatewayAdapter | null;
}
export interface GatewayConnection {
  load(db?: DbConnection): Promise<LoadedGateway | null>;
  adapterFor: AdapterFor;
  config: Config;
}
export function gatewayConnection(
  db: Database,
  config: Config,
  instanceId: string,
  log: Pick<FastifyBaseLogger, 'error'>,
  adapterFor: AdapterFor = (row) =>
    new KongAdapter({
      adminUrl: row.adminUrl,
      adminToken: row.adminToken,
      instanceId,
      rateLimitPolicy: config.PORTAL_RATE_LIMIT_POLICY,
    }),
): GatewayConnection {
  return {
    config,
    adapterFor,
    async load(connection = db) {
      const [row] = await connection.select().from(gateways).limit(1);
      if (!row) return null;
      try {
        const adminToken = row.adminTokenCiphertext
          ? decrypt(row.adminTokenCiphertext, config.PORTAL_ENCRYPTION_KEY)
          : undefined;
        return { row, adapter: adapterFor({ ...row, adminToken }) };
      } catch {
        log.error(
          { gatewayId: row.id },
          'Stored gateway token cannot be decrypted',
        );
        return { row, adapter: null };
      }
    },
  };
}
export function requireGateway(
  gateway: LoadedGateway | null,
): LoadedGateway & { adapter: GatewayAdapter } {
  if (!gateway)
    throw new Problem(
      409,
      'gateway-not-connected',
      'No gateway is connected. An admin can connect one in Admin → Gateways. Nothing was created.',
    );
  if (!gateway.adapter) throw storedTokenUnavailable();
  return gateway as LoadedGateway & { adapter: GatewayAdapter };
}
export function requireEnabled(gateway: LoadedGateway | null) {
  if (gateway && !gateway.row.enabled)
    throw new Problem(
      409,
      'gateway-disabled',
      "The gateway connection is disabled, so this can't be done right now. Nothing was created.",
    );
  return requireGateway(gateway);
}
export function storedTokenUnavailable() {
  return new Problem(
    503,
    'gateway-unavailable',
    "The stored Admin API token can't be read. Enter the token again, or choose This Kong needs no token, then test and save the connection.",
  );
}
export function normalizeUrl(value: string, field: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidUrl(
      field,
      'Enter a URL that starts with http:// or https://.',
    );
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw invalidUrl(
      field,
      'Enter a URL that starts with http:// or https://.',
    );
  if (url.username || url.password || url.search || url.hash)
    throw invalidUrl(
      field,
      'Remove the username, password, query or fragment from this URL.',
    );
  return (url.origin + url.pathname).replace(/\/+$/, '');
}
function invalidUrl(
  field: string,
  message = "The portal doesn't connect to link-local or cloud metadata addresses. Enter a different address.",
) {
  return new Problem(400, 'validation', 'Check the connection URLs.', [
    { pointer: '/' + field, message },
  ]);
}
const blocked = new BlockList();
blocked.addSubnet('169.254.0.0', 16, 'ipv4');
blocked.addAddress('100.100.100.200', 'ipv4');
blocked.addSubnet('fe80::', 10, 'ipv6');
blocked.addAddress('fd00:ec2::254', 'ipv6');
export async function checkAddress(
  value: string,
  field: string,
  resolve: typeof lookup = lookup,
) {
  const url = new URL(normalizeUrl(value, field));
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await resolve(hostname, { all: true });
  } catch {
    return;
  } // The connection check supplies the fixed unreachable message.
  if (
    addresses.some(({ address, family }) =>
      blocked.check(address, family === 6 ? 'ipv6' : 'ipv4'),
    )
  )
    throw invalidUrl(field);
}
export function resolveToken(
  input: string | null | undefined,
  adminUrl: string,
  previous: GatewayRow | undefined,
  config: Config,
) {
  if (input === null) return undefined;
  if (input) return input;
  if (!previous?.adminTokenCiphertext) return undefined;
  if (normalizeUrl(previous.adminUrl, 'adminUrl') !== adminUrl)
    throw new Problem(
      422,
      'gateway-token-required',
      "You changed the Admin API URL, so the portal won't send the stored token to it. Enter the token for this Kong, or choose This Kong needs no token.",
    );
  try {
    return decrypt(previous.adminTokenCiphertext, config.PORTAL_ENCRYPTION_KEY);
  } catch {
    throw storedTokenUnavailable();
  }
}
export interface ConnectionValues {
  adminUrl: string;
  proxyInternalUrl: string;
  proxyPublicUrl: string;
}
export const connectionDetails = {
  unreachable:
    "The portal couldn't reach that address. Check the Admin API URL and that Kong is running.",
  refused:
    'Kong refused the request because the Admin API token is wrong or missing. Check the token and try again.',
  'not-gateway':
    "Something answered at that address, but it isn't a Kong Admin API. Check the Admin API URL's host and port. Kong's proxy port doesn't serve the Admin API.",
  'read-only':
    "This Kong runs in DB-less mode or as a data plane node. The portal can't work with it, because it needs to write consumers and keys. Change the Admin API URL to a Kong with a database, or to its control plane.",
};
export function connectionFailure(
  outcome: keyof typeof connectionDetails,
  adminUrl: string,
) {
  const codes = {
    unreachable: 'gateway-unreachable',
    refused: 'gateway-token-refused',
    'not-gateway': 'gateway-not-kong',
    'read-only': 'gateway-read-only',
  };
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(
    new URL(adminUrl).hostname,
  );
  return new Problem(
    422,
    codes[outcome],
    outcome === 'unreachable' && local
      ? "The portal couldn't reach that address. It's resolved from the portal server, not your machine, so localhost means the server itself. If Kong runs in the same compose network, use its service name, like http://kong:8001."
      : connectionDetails[outcome],
  );
}
export async function checkConnection(
  values: ConnectionValues,
  adapter: GatewayAdapter,
) {
  await checkAddress(values.adminUrl, 'adminUrl');
  await checkAddress(values.proxyInternalUrl, 'proxyInternalUrl');
  const check = await adapter.checkConnection();
  if (check.outcome !== 'ok')
    throw connectionFailure(check.outcome, values.adminUrl);
  if (!(await adapter.checkProxy(values.proxyInternalUrl)))
    throw new Problem(
      422,
      'gateway-proxy-unreachable',
      "The Admin API passed, but the portal can't reach the proxy. Check the internal proxy URL.",
    );
  return check.version;
}
