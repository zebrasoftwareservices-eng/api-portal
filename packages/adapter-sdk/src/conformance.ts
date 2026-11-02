// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { GatewayAdapter } from './index.js';
export function conformance(factory: () => GatewayAdapter, instanceId: string) {
  describe('GatewayAdapter conformance', () => {
    it('converges repeated writes, tags owned objects and tolerates repeated deletes', async () => {
      const adapter = factory();
      const app = { id: randomUUID() };
      const cred = { id: randomUUID(), key: `test_${randomUUID()}` };
      try {
        expect(adapter.capabilities().apiKeys).toBe(true);
        expect((await adapter.health()).reachable).toBe(true);
        const first = await adapter.ensureConsumer(app);
        expect(await adapter.ensureConsumer(app)).toEqual(first);
        expect(await adapter.issueCredential(app, cred)).toEqual(
          await adapter.issueCredential(app, cred),
        );
        const owned = (await adapter.listOwnedConsumers()).filter(
          (c) => c.appId === app.id,
        );
        expect(owned).toHaveLength(1);
        expect(owned[0]?.tags).toEqual(
          expect.arrayContaining([
            'portal',
            `portal-instance-${instanceId}`,
            `portal-app-${app.id}`,
          ]),
        );
        expect(owned[0]?.credentials).toHaveLength(1);
        expect(owned[0]?.credentials[0]?.tags).toContain(
          `portal-cred-${cred.id}`,
        );
        await adapter.revokeCredential(app, cred.id);
        await adapter.revokeCredential(app, cred.id);
        expect(
          (await adapter.listOwnedConsumers()).find((c) => c.appId === app.id)
            ?.credentials,
        ).toHaveLength(0);
      } finally {
        await adapter.deleteConsumer(app);
        await adapter.deleteConsumer(app);
      }
      expect(
        (await adapter.listOwnedConsumers()).filter((c) => c.appId === app.id),
      ).toHaveLength(0);
    });
  });
}
