// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GatewayUnavailableError, type GatewayAdapter } from './index.js';
interface AccessFixture {
  serviceId: string;
  memberships(
    appId: string,
  ): Promise<{ id: string; group: string; tags: string[] }[]>;
  ratePlugins(
    appId: string,
  ): Promise<{ id: string; config: Record<string, unknown>; tags: string[] }[]>;
  unavailable(): GatewayAdapter;
  refused?(): GatewayAdapter;
}

export function conformance(
  factory: () => GatewayAdapter,
  instanceId: string,
  access?: () => AccessFixture,
) {
  describe('GatewayAdapter conformance', () => {
    it('checks healthy and refused gateway connections', async () => {
      expect((await factory().checkConnection()).outcome).toBe('ok');
      const refused = access?.().refused?.();
      if (!refused) throw new Error('A refused gateway fixture is required');
      expect(await refused.checkConnection()).toEqual({ outcome: 'refused' });
    });
    it('supports idempotent tagged access grants and unavailable gateway errors', async () => {
      if (!access)
        throw new Error('An access fixture is required for conformance');
      const fixture = access();
      const adapter = factory();
      const app = { id: randomUUID() };
      const service = { id: fixture.serviceId };
      expect(adapter.capabilities().accessControl).toBe(true);
      try {
        await adapter.ensureConsumer(app);
        await adapter.grantAccess(app, service);
        const before = await fixture.memberships(app.id);
        await adapter.grantAccess(app, service);
        expect(await fixture.memberships(app.id)).toEqual(before);
        expect(
          before.filter((m) => m.group === `portal-svc-${service.id}`),
        ).toHaveLength(1);
        for (const membership of before)
          expect(membership.tags).toEqual(
            expect.arrayContaining([
              'portal',
              `portal-instance-${instanceId}`,
              `portal-app-${app.id}`,
            ]),
          );
        await adapter.revokeAccess(app, service);
        await adapter.revokeAccess(app, service);
        expect(
          (await fixture.memberships(app.id)).some(
            (m) => m.group === `portal-svc-${service.id}`,
          ),
        ).toBe(false);
        await expect(
          fixture.unavailable().grantAccess(app, service),
        ).rejects.toBeInstanceOf(GatewayUnavailableError);
        await expect(
          fixture.unavailable().revokeAccess(app, service),
        ).rejects.toBeInstanceOf(GatewayUnavailableError);
      } finally {
        await adapter.deleteConsumer(app);
      }
    });
    it('applies, replaces and removes idempotent consumer plan limits', async () => {
      const adapter = factory(),
        fixture = access!(),
        app = { id: randomUUID() };
      expect(adapter.capabilities().plans).toBe(true);
      try {
        await adapter.ensureConsumer(app);
        const limits = {
          rate: { unit: 'second' as const, limit: 5 },
          monthlyQuota: 10,
        };
        await adapter.applyPlanLimits(app, limits);
        const first = await fixture.ratePlugins(app.id);
        expect(first).toHaveLength(1);
        expect(first[0]!.config).toMatchObject({
          second: 5,
          month: 10,
          limit_by: 'consumer',
          policy: 'cluster',
        });
        expect(first[0]!.tags).toContain(`portal-app-${app.id}`);
        await adapter.applyPlanLimits(app, limits);
        expect((await fixture.ratePlugins(app.id)).map((p) => p.id)).toEqual(
          first.map((p) => p.id),
        );
        await adapter.applyPlanLimits(app, {
          rate: { unit: 'minute', limit: 20 },
          monthlyQuota: 30,
        });
        const replaced = await fixture.ratePlugins(app.id);
        expect(replaced[0]!.id).toBe(first[0]!.id);
        expect(replaced[0]!.config).toMatchObject({ minute: 20, month: 30 });
        expect(replaced[0]!.config.second).toBeNull();
        await adapter.applyPlanLimits(app, null);
        await adapter.applyPlanLimits(app, null);
        expect(await fixture.ratePlugins(app.id)).toEqual([]);
      } finally {
        await adapter.deleteConsumer(app);
      }
    });
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
