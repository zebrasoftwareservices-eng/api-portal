// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {
  GatewayServiceConflictError,
  type ServiceRef,
  type PlanLimits,
  type ConnectionCheck,
  type ServiceProtection,
  type AccessPolicy,
  type AccessReport,
  type AccessFinding,
  GatewayRejectedError,
  GatewayUnavailableError,
  consumerUsername,
  portalTags,
  type GatewayAdapter,
  type GatewayService,
  type AppRef,
  type CredentialSpec,
  type OwnedConsumer,
} from '@portal/adapter-sdk';
interface Entity {
  id: string;
  name?: string;
  username?: string;
  custom_id?: string;
  tags?: string[];
  paths?: string[];
  service?: { id: string } | null;
  route?: { id: string } | null;
  consumer?: { id: string };
  enabled?: boolean;
  group?: string;
  config?: Record<string, unknown>;
}
export interface KongConfig {
  adminUrl: string;
  instanceId: string;
  adminToken?: string;
  rateLimitPolicy?: 'cluster' | 'local';
  fetch?: typeof fetch;
}
export class KongAdapter implements GatewayAdapter {
  readonly kind = 'kong' as const;
  private fetcher: typeof fetch;
  constructor(private config: KongConfig) {
    this.fetcher = config.fetch ?? fetch;
  }
  capabilities() {
    return {
      apiKeys: true,
      accessControl: true,
      oauthClients: false,
      plans: true,
      usage: false,
    } as const;
  }
  async request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    allow404 = false,
  ): Promise<T | null> {
    const base = new URL(
      this.config.adminUrl.endsWith('/')
        ? this.config.adminUrl
        : this.config.adminUrl + '/',
    );
    const url = new URL(path.replace(/^\//, ''), base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
      throw new GatewayRejectedError(400);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.config.adminToken
            ? { 'Kong-Admin-Token': this.config.adminToken }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
    } catch {
      throw new GatewayUnavailableError();
    }
    if (response.status === 404 && allow404) return null;
    if (response.status >= 500) throw new GatewayUnavailableError();
    if (!response.ok) throw new GatewayRejectedError(response.status);
    if (response.status === 204) return null;
    try {
      return (await response.json()) as T;
    } catch {
      throw new GatewayUnavailableError();
    }
  }
  private async pages(path: string) {
    const result: Entity[] = [];
    const seen = new Set<string>();
    let next: string | null = path;
    while (next) {
      if (seen.has(next)) throw new GatewayUnavailableError();
      seen.add(next);
      const page: { data: Entity[]; next?: string | null } | null =
        await this.request<{ data: Entity[]; next?: string | null }>(next);
      if (!page || !Array.isArray(page.data))
        throw new GatewayUnavailableError();
      result.push(...page.data);
      next = page.next ?? null;
    }
    return result;
  }
  async health() {
    const start = Date.now();
    try {
      await this.request('/status');
      const root = await this.request<{ version?: string }>('/');
      return {
        reachable: true,
        version: root?.version,
        latencyMs: Date.now() - start,
      };
    } catch {
      return { reachable: false, latencyMs: Date.now() - start };
    }
  }
  async checkConnection(): Promise<ConnectionCheck> {
    let response: Response;
    try {
      response = await this.fetcher(
        this.config.adminUrl.replace(/\/$/, '') + '/',
        {
          headers: this.config.adminToken
            ? { 'Kong-Admin-Token': this.config.adminToken }
            : {},
          signal: AbortSignal.timeout(5000),
          redirect: 'manual',
        },
      );
    } catch {
      return { outcome: 'unreachable' };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return {
        outcome:
          response.status === 401 || response.status === 403
            ? 'refused'
            : response.status >= 500
              ? 'unreachable'
              : 'not-gateway',
      };
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (
        !reader ||
        Number(response.headers.get('content-length')) > 1024 * 1024
      )
        return { outcome: 'not-gateway' };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) return { outcome: 'not-gateway' };
        chunks.push(value);
      }
      const root = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        tagline?: unknown;
        version?: unknown;
        configuration?: { database?: string; role?: string };
      };
      if (
        root?.tagline !== 'Welcome to kong' ||
        typeof root.version !== 'string' ||
        !root.version
      )
        return { outcome: 'not-gateway' };
      if (
        root.configuration?.database === 'off' ||
        root.configuration?.role === 'data_plane'
      )
        return { outcome: 'read-only' };
      return { outcome: 'ok', version: root.version };
    } catch (error) {
      return {
        outcome: error instanceof SyntaxError ? 'not-gateway' : 'unreachable',
      };
    } finally {
      await reader?.cancel().catch(() => {});
    }
  }
  async checkProxy(url: string): Promise<boolean> {
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      await response.body?.cancel().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  async listServices(): Promise<GatewayService[]> {
    const [services, routes, plugins] = await Promise.all([
      this.pages('/services?size=1000'),
      this.pages('/routes?size=1000'),
      this.pages('/plugins?size=1000'),
    ]);
    return services
      .filter((s) => !s.tags?.includes('portal-internal'))
      .map((service) => {
        const linked = routes.filter((r) => r.service?.id === service.id);
        return {
          id: service.id,
          name: service.name ?? service.id,
          routes: linked.map((r) => ({
            id: r.id,
            name: r.name ?? null,
            paths: r.paths ?? [],
          })),
          keyAuth: plugins.some(
            (p) =>
              p.name === 'key-auth' &&
              p.enabled !== false &&
              (p.service?.id === service.id ||
                linked.some((r) => r.id === p.route?.id) ||
                (!p.service && !p.route && !p.consumer)),
          ),
        };
      });
  }
  async getService(idOrName: string) {
    const service = await this.request<Entity>(
      `/services/${encodeURIComponent(idOrName)}`,
      'GET',
      undefined,
      true,
    );
    if (!service) return null;
    return (await this.listServices()).find((s) => s.id === service.id) ?? null;
  }
  async ensureConsumer(app: AppRef) {
    const username = consumerUsername(app);
    const consumer = await this.request<Entity>(
      `/consumers/${username}`,
      'PUT',
      {
        username,
        custom_id: app.id,
        tags: portalTags(this.config.instanceId, app),
      },
    );
    if (!consumer) throw new GatewayUnavailableError();
    await this.putMembership(app, 'portal-consumer');
    return { id: consumer.id, username };
  }
  private async putMembership(app: AppRef, group: string) {
    await this.request(
      `/consumers/${consumerUsername(app)}/acls/${encodeURIComponent(group)}`,
      'PUT',
      {
        group,
        tags: portalTags(this.config.instanceId, app),
      },
    );
  }
  async grantAccess(app: AppRef, service: ServiceRef) {
    await this.putMembership(app, `portal-svc-${service.id}`);
  }
  async revokeAccess(app: AppRef, service: ServiceRef) {
    await this.request(
      `/consumers/${consumerUsername(app)}/acls/${encodeURIComponent(`portal-svc-${service.id}`)}`,
      'DELETE',
      undefined,
      true,
    );
  }
  private rateConfig(limits: PlanLimits) {
    return {
      [limits.rate.unit]: limits.rate.limit,
      month: limits.monthlyQuota,
      limit_by: 'consumer',
      policy: this.config.rateLimitPolicy ?? 'cluster',
    };
  }
  async applyPlanLimits(app: AppRef, limits: PlanLimits | null) {
    const path = `/plugins/${this.stableId('rate-limiting', app.id)}`;
    if (!limits) {
      await this.request(path, 'DELETE', undefined, true);
      return;
    }
    const consumer = await this.request<Entity>(
      `/consumers/${consumerUsername(app)}`,
    );
    if (!consumer) throw new GatewayUnavailableError();
    await this.request(path, 'PUT', {
      name: 'rate-limiting',
      consumer: { id: consumer.id },
      config: this.rateConfig(limits),
      tags: portalTags(this.config.instanceId, app),
    });
  }
  private owns(entity: Entity) {
    return (
      entity.tags?.includes(`portal-instance-${this.config.instanceId}`) ===
      true
    );
  }
  private stableId(kind: string, scopeId: string) {
    const bytes = createHash('sha1')
      .update(`${this.config.instanceId}:${kind}:${scopeId}`)
      .digest()
      .subarray(0, 16);
    bytes[6] = (bytes[6]! & 15) | 80;
    bytes[8] = (bytes[8]! & 63) | 128;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  private async topology() {
    const [services, routes, plugins] = await Promise.all([
      this.pages('/services?size=1000'),
      this.pages('/routes?size=1000'),
      this.pages('/plugins?size=1000'),
    ]);
    return { services, routes, plugins };
  }
  private applicable(plugin: Entity, service: Entity, routes: Entity[]) {
    return (
      !plugin.consumer &&
      (plugin.service?.id === service.id ||
        routes.some((r) => r.id === plugin.route?.id) ||
        (!plugin.service && !plugin.route))
    );
  }
  private planService(
    service: Entity,
    allRoutes: Entity[],
    plugins: Entity[],
    managed: boolean,
  ) {
    const routes = allRoutes.filter((r) => r.service?.id === service.id);
    const active = plugins.filter(
      (p) => p.enabled !== false && this.applicable(p, service, routes),
    );
    const auth = active.filter((p) => p.name === 'key-auth');
    // Disabled foreign ACLs also conflict with Kong's one-plugin-per-scope constraint.
    const foreign = plugins.filter(
      (p) =>
        p.name === 'acl' &&
        !this.owns(p) &&
        this.applicable(p, service, routes),
    );
    const globalAuth = auth.find((p) => !p.service && !p.route);
    const serviceAuth = auth.find(
      (p) => p.service?.id === service.id && !p.route,
    );
    const scopes =
      serviceAuth || globalAuth
        ? [{ service: { id: service.id } }]
        : routes
            .filter((r) => auth.some((p) => p.route?.id === r.id))
            .map((r) => ({ route: { id: r.id } }));
    const findings: AccessFinding[] = [];
    const writes: {
      path: string;
      method: string;
      body?: Record<string, unknown>;
    }[] = [];
    const finding = (code: string, message: string) =>
      findings.push({
        code,
        serviceId: service.id,
        serviceName: service.name ?? service.id,
        message,
      });
    if (foreign.length && (managed || foreign.some((p) => p.route)))
      finding(
        'foreign-acl',
        'An operator ACL prevents the portal from enforcing its access policy.',
      );
    const desiredIds = new Set<string>();
    for (const scope of scopes) {
      const scopeId = 'service' in scope ? scope.service.id : scope.route.id;
      const existing = plugins.find(
        (p) =>
          p.name === 'acl' &&
          (('service' in scope && p.service?.id === scopeId && !p.route) ||
            ('route' in scope && p.route?.id === scopeId)),
      );
      const conflict = managed
        ? foreign.length > 0
        : foreign.some(
            (p) =>
              (!p.service && !p.route) ||
              ('service' in scope && p.service?.id === scopeId && !p.route) ||
              ('route' in scope && p.route?.id === scopeId),
          );
      if (conflict) {
        if (
          !findings.some((f) => f.code === 'foreign-acl') &&
          (managed ||
            foreign.some(
              (p) =>
                p.route ||
                (Array.isArray(p.config?.deny) &&
                  !p.config.deny.includes('portal-consumer')),
            ))
        )
          finding(
            'foreign-acl',
            'An operator ACL prevents the portal from enforcing its access policy.',
          );
        continue;
      }
      const config = {
        [managed ? 'allow' : 'deny']: [
          managed ? `portal-svc-${service.id}` : 'portal-consumer',
        ],
        hide_groups_header: true,
      };
      const id =
        existing && this.owns(existing)
          ? existing.id
          : this.stableId('acl', scopeId);
      desiredIds.add(id);
      const opposite = managed ? 'deny' : 'allow';
      if (
        !existing ||
        existing.enabled === false ||
        JSON.stringify(existing.config?.[managed ? 'allow' : 'deny']) !==
          JSON.stringify(config[managed ? 'allow' : 'deny']) ||
        (Array.isArray(existing.config?.[opposite]) &&
          existing.config[opposite].length > 0) ||
        existing.config?.hide_groups_header !== true ||
        !portalTags(this.config.instanceId).every((t) =>
          existing.tags?.includes(t),
        )
      )
        writes.push({
          path: `/plugins/${id}`,
          method: 'PUT',
          body: {
            name: 'acl',
            ...scope,
            enabled: true,
            config,
            tags: portalTags(this.config.instanceId),
          },
        });
    }
    if (managed) {
      for (const p of auth.filter((p) => p.service || p.route)) {
        if (p.config?.hide_credentials !== true)
          writes.push({
            path: `/plugins/${p.id}`,
            method: 'PATCH',
            body: { config: { hide_credentials: true } },
          });
      }
      if (globalAuth && !serviceAuth) {
        const id = this.stableId('key-auth', service.id);
        writes.push({
          path: `/plugins/${id}`,
          method: 'PUT',
          body: {
            name: 'key-auth',
            service: { id: service.id },
            config: { ...globalAuth.config, hide_credentials: true },
            tags: portalTags(this.config.instanceId),
          },
        });
      } else if (
        globalAuth &&
        serviceAuth &&
        this.owns(serviceAuth) &&
        serviceAuth.id === this.stableId('key-auth', service.id)
      ) {
        const config = { ...globalAuth.config, hide_credentials: true };
        if (!isDeepStrictEqual(config, serviceAuth.config))
          writes.push({
            path: `/plugins/${serviceAuth.id}`,
            method: 'PUT',
            body: {
              name: 'key-auth',
              service: { id: service.id },
              config,
              tags: portalTags(this.config.instanceId),
            },
          });
      }
      if (
        !auth.length &&
        !plugins.some(
          (p) =>
            p.name === 'acl' &&
            this.owns(p) &&
            this.applicable(p, service, routes),
        )
      )
        finding(
          'api-public',
          "This API is public. Key-auth isn't enabled on this service, so anyone can call it without a key. To require keys, enable the key-auth plugin on the service in Kong.",
        );
      else if (
        auth.length > 0 &&
        !serviceAuth &&
        !globalAuth &&
        scopes.length < routes.length
      )
        finding(
          'partial-key-auth',
          "Key-auth is on only some of this service's routes. Keys are checked on those routes, and the other routes stay open to anyone. To protect them, enable key-auth on the service in Kong.",
        );
    }
    for (const p of plugins.filter(
      (p) =>
        p.name === 'acl' && this.owns(p) && this.applicable(p, service, routes),
    )) {
      if (desiredIds.has(p.id)) continue;
      if (managed && !auth.length) {
        finding(
          'key-auth-missing',
          'Key-auth was removed; the portal ACL is retained to fail closed.',
        );
      } else if (
        (managed && auth.length > 0 && foreign.length === 0) ||
        (!managed &&
          Array.isArray(p.config?.deny) &&
          p.config.deny.includes('portal-consumer'))
      ) {
        writes.push({ path: `/plugins/${p.id}`, method: 'DELETE' });
      }
    }
    return { auth, foreign, findings, writes };
  }
  async protectService(ref: ServiceRef): Promise<ServiceProtection> {
    const { services, routes, plugins } = await this.topology();
    const service = services.find((s) => s.id === ref.id);
    if (!service) throw new GatewayRejectedError(404);
    const plan = this.planService(service, routes, plugins, true);
    if (plan.foreign.length)
      throw new GatewayServiceConflictError(service.name ?? service.id);
    for (const write of plan.writes)
      await this.request(write.path, write.method, write.body);
    return { keyAuth: plan.auth.length > 0, findings: plan.findings };
  }
  async applyAccessPolicy(policy: AccessPolicy): Promise<AccessReport> {
    const report: AccessReport = { repairs: [], findings: [] };
    const { services, routes, plugins } = await this.topology();
    const consumers = await this.listOwnedConsumers();
    // Snapshot every membership before any write: a failed read cannot leave a partial upgrade.
    const memberships = new Map<string, Entity[]>();
    const ownedIds = new Set(consumers.map((c) => c.id));
    for (const membership of await this.pages('/acls?size=1000')) {
      const consumerId = membership.consumer?.id;
      if (!consumerId || !ownedIds.has(consumerId)) continue;
      const groups = memberships.get(consumerId) ?? [];
      groups.push(membership);
      memberships.set(consumerId, groups);
    }
    const plans = services.map((s) => ({
      service: s,
      plan: this.planService(
        s,
        routes,
        plugins,
        policy.services.some((ref) => ref.id === s.id),
      ),
    }));
    const attempt = async (
      operation: () => Promise<unknown>,
      serviceId: string,
      serviceName: string,
    ) => {
      try {
        await operation();
        return true;
      } catch (error) {
        if (!(error instanceof GatewayRejectedError)) throw error;
        report.findings.push({
          code: 'gateway-rejected',
          serviceId,
          serviceName,
          message: 'The gateway rejected an access policy repair.',
        });
        return false;
      }
    };
    let added = false;
    for (const consumer of consumers) {
      const desiredApp = policy.apps.find((a) => a.app.id === consumer.appId);
      if (!desiredApp) continue;
      const desired = new Set([
        'portal-consumer',
        ...desiredApp.services.map((s) => `portal-svc-${s.id}`),
      ]);
      const actual = memberships.get(consumer.id) ?? [];
      for (const group of desired)
        if (!actual.some((m) => m.group === group)) {
          if (
            await attempt(
              () => this.putMembership(desiredApp.app, group),
              '',
              '',
            )
          ) {
            added = true;
            report.repairs.push({
              action: 'added',
              object: 'membership',
              appId: consumer.appId,
              detail: group,
            });
          }
        }
      for (const m of actual)
        if (m.group && !desired.has(m.group)) {
          if (
            await attempt(
              () =>
                this.request(
                  `/consumers/${encodeURIComponent(consumer.id)}/acls/${encodeURIComponent(m.id)}`,
                  'DELETE',
                  undefined,
                  true,
                ),
              '',
              '',
            )
          )
            report.repairs.push({
              action: 'removed',
              object: 'membership',
              appId: consumer.appId,
              detail: m.group,
            });
        }
    }
    if (
      added &&
      plans.some(({ plan }) => plan.writes.some((w) => w.method === 'PUT'))
    )
      await delay(6000);
    for (const { service, plan } of plans) {
      report.findings.push(...plan.findings);
      for (const write of plan.writes)
        if (
          await attempt(
            () => this.request(write.path, write.method, write.body),
            service.id,
            service.name ?? service.id,
          )
        )
          report.repairs.push({
            action:
              write.method === 'DELETE'
                ? 'removed'
                : plugins.some((p) => write.path.endsWith(`/${p.id}`))
                  ? 'updated'
                  : 'added',
            object: 'plugin',
            serviceId: service.id,
            detail:
              write.body?.name === 'key-auth' || write.method === 'PATCH'
                ? 'key-auth credentials hidden'
                : 'ACL policy repaired',
          });
    }
    for (const ref of policy.services) {
      const count = policy.services.filter((s) => s.id === ref.id).length;
      const service = services.find((s) => s.id === ref.id);
      if (!service || count > 1) {
        if (
          report.findings.some(
            (f) =>
              f.serviceId === ref.id &&
              f.code === (!service ? 'service-missing' : 'service-shared'),
          )
        )
          continue;
        report.findings.push({
          code: !service ? 'service-missing' : 'service-shared',
          serviceId: ref.id,
          serviceName: service?.name ?? ref.id,
          message: !service
            ? 'A published service is missing from the gateway.'
            : 'Multiple published APIs share this service and its access group.',
        });
      }
    }
    const ratePlugins = (
      await this.pages(
        `/plugins?tags=portal-instance-${this.config.instanceId}&size=1000`,
      )
    ).filter((p) => p.name === 'rate-limiting' && this.owns(p));
    for (const desired of policy.apps) {
      if (!desired.limits) continue;
      const consumer = consumers.find((c) => c.appId === desired.app.id);
      if (!consumer) continue; // A lost consumer cannot recover its plaintext keys.
      const id = this.stableId('rate-limiting', desired.app.id);
      const plugin = ratePlugins.find((p) => p.id === id);
      const config = this.rateConfig(desired.limits);
      if (
        !plugin ||
        plugin.enabled === false ||
        plugin.consumer?.id !== consumer.id ||
        plugin.service ||
        plugin.route ||
        !Object.entries(config).every(([k, v]) => plugin.config?.[k] === v) ||
        (desired.limits.rate.unit === 'second'
          ? plugin.config?.minute != null
          : plugin.config?.second != null)
      ) {
        await this.applyPlanLimits(desired.app, desired.limits);
        report.repairs.push({
          action: plugin ? 'updated' : 'added',
          object: 'plugin',
          appId: desired.app.id,
          detail: 'Plan limits repaired',
        });
      }
    }
    for (const plugin of ratePlugins) {
      const desired = policy.apps.find(
        (a) =>
          plugin.id === this.stableId('rate-limiting', a.app.id) && a.limits,
      );
      if (!desired) {
        await this.request(`/plugins/${plugin.id}`, 'DELETE', undefined, true);
        report.repairs.push({
          action: 'removed',
          object: 'plugin',
          detail: 'Stale plan limits removed',
        });
      }
    }
    for (const service of services.filter((s) =>
      policy.services.some((r) => r.id === s.id),
    )) {
      const linked = routes.filter((r) => r.service?.id === service.id);
      if (
        plugins.some(
          (p) =>
            p.name === 'rate-limiting' &&
            !this.owns(p) &&
            ((p.route && p.service?.id === service.id) ||
              (p.consumer &&
                (p.service?.id === service.id ||
                  linked.some((r) => r.id === p.route?.id)))),
        )
      )
        report.findings.push({
          code: 'foreign-rate-limit',
          serviceId: service.id,
          serviceName: service.name ?? service.id,
          message:
            'An operator rate-limiting plugin has a more specific scope than the plan limits.',
        });
    }
    return report;
  }
  isAccessDenied(response: {
    status: number;
    headers: Headers;
    body: Uint8Array;
  }) {
    if (
      response.status !== 403 ||
      response.headers.has('x-kong-upstream-latency')
    )
      return false;
    // Kong negotiates JSON, plain text, XML or HTML from Accept. The fixed
    // ACL message appears in every format; upstream responses were excluded above.
    return new TextDecoder()
      .decode(response.body)
      .includes('You cannot consume this service');
  }
  async deleteConsumer(app: AppRef) {
    await this.request(
      `/consumers/${consumerUsername(app)}`,
      'DELETE',
      undefined,
      true,
    );
  }
  async issueCredential(app: AppRef, cred: CredentialSpec) {
    await this.request(
      `/consumers/${consumerUsername(app)}/key-auth/${encodeURIComponent(cred.id)}`,
      'PUT',
      { key: cred.key, tags: portalTags(this.config.instanceId, app, cred.id) },
    );
    return { id: cred.id };
  }
  async revokeCredential(app: AppRef, id: string) {
    await this.request(
      `/consumers/${consumerUsername(app)}/key-auth/${encodeURIComponent(id)}`,
      'DELETE',
      undefined,
      true,
    );
  }
  async listOwnedConsumers(): Promise<OwnedConsumer[]> {
    const filter = `tags=${encodeURIComponent(`portal-instance-${this.config.instanceId}`)}&size=1000`;
    const [consumers, credentials] = await Promise.all([
      this.pages(`/consumers?${filter}`),
      this.pages(`/key-auths?${filter}`),
    ]);
    return consumers
      .filter((c) => this.owns(c))
      .map((c) => ({
        id: c.id,
        username: c.username ?? '',
        appId: c.custom_id ?? '',
        tags: c.tags ?? [],
        credentials: credentials
          .filter((k) => k.consumer?.id === c.id)
          .map((k) => ({ id: k.id, tags: k.tags ?? [] })),
      }));
  }
}
