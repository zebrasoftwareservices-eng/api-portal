// SPDX-License-Identifier: Apache-2.0
import { lookup } from 'node:dns/promises';

// Resolve at request time: Compose starts the server before the portal exists.
// Cache briefly so a replaced portal container gets its new address trusted.
export function portalProxy(host: string) {
  let addresses = new Set<string>();
  let expires = 0;
  let pending: Promise<void> | undefined;
  return {
    trust: (address: string, hop: number) =>
      hop === 0 && addresses.has(address.replace(/^::ffff:/, '')),
    refresh: async () => {
      if (Date.now() < expires) return;
      pending ??= lookup(host, { all: true })
        .then((records) => {
          addresses = new Set(records.map(({ address }) => address));
        })
        .catch(() => {
          addresses.clear();
        })
        .finally(() => {
          expires = Date.now() + 5000;
          pending = undefined;
        });
      await pending;
    },
  };
}
