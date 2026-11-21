// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import protobuf from 'protobufjs';
import otlpDescriptor from './otlp-trace.json' with { type: 'json' };
import {
  InvalidTraceBatchError,
  TracingUnavailableError,
  type TracingPlan,
  type TracingReport,
  type TraceBatch,
  type SpanClass,
  UsageUnavailableError,
  type UsageEvent,
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
  usage?: { endpoint: string; token: string };
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
      usage: true,
      tracing: true,
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
    } catch (error) {
      throw new GatewayUnavailableError({ cause: error });
    }
    if (response.status === 404 && allow404) return null;
    if (response.status >= 500)
      throw new GatewayUnavailableError({
        cause: new Error(`Kong returned ${response.status}`),
      });
    if (!response.ok) throw new GatewayRejectedError(response.status);
    if (response.status === 204) return null;
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new GatewayUnavailableError({ cause: error });
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
    await this.putUsagePlugin(app, consumer.id);
    await this.putMembership(app, 'portal-consumer');
    return { id: consumer.id, username };
  }
  private usageMatches(actual: unknown, expected: unknown): boolean {
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (!actual || typeof actual !== 'object' || Array.isArray(actual))
        return false;
      return Object.entries(expected).every(([key, value]) =>
        this.usageMatches((actual as Record<string, unknown>)[key], value),
      );
    }
    return isDeepStrictEqual(actual, expected);
  }
  private usageConfig() {
    if (!this.config.usage) throw new UsageUnavailableError();
    return {
      http_endpoint: this.config.usage.endpoint,
      headers: { Authorization: `Bearer ${this.config.usage.token}` },
      content_type: 'application/json',
      timeout: 10000,
      keepalive: 60000,
      queue: {
        max_batch_size: 200,
        max_coalescing_delay: 1,
        max_retry_time: 300,
      },
      custom_fields_by_lua: {
        request: 'return {}',
        response: 'return { status = kong.response.get_status() }',
      },
    };
  }
  private async writeUsagePlugin(
    id: string,
    scope: Record<string, unknown>,
    tags: string[],
  ) {
    try {
      await this.request(`/plugins/${id}`, 'PUT', {
        name: 'http-log',
        ...scope,
        enabled: true,
        tags,
        config: this.usageConfig(),
      });
    } catch (error) {
      if (error instanceof GatewayRejectedError)
        throw new UsageUnavailableError();
      throw error;
    }
  }
  private async putUsagePlugin(app: AppRef, consumerId: string) {
    if (!this.config.usage) return;
    await this.writeUsagePlugin(
      this.stableId('http-log', app.id),
      { consumer: { id: consumerId } },
      portalTags(this.config.instanceId, app),
    );
  }
  async ensureUsageCollection() {
    const scope = this.config.instanceId;
    const serviceId = this.stableId('usage-service', scope);
    const routeId = this.stableId('usage-route', scope);
    const heartbeatPath = `/__portal/usage-heartbeat/${scope}`;
    const tags = [...portalTags(scope), 'portal-internal'];
    await this.request(`/services/${serviceId}`, 'PUT', {
      name: 'portal-usage-heartbeat',
      url: 'http://127.0.0.1:65535',
      tags,
    });
    await this.request(`/routes/${routeId}`, 'PUT', {
      service: { id: serviceId },
      paths: [heartbeatPath],
      tags,
    });
    await this.request(
      `/plugins/${this.stableId('usage-termination', scope)}`,
      'PUT',
      {
        name: 'request-termination',
        route: { id: routeId },
        config: { status_code: 204 },
        tags,
      },
    );
    await this.writeUsagePlugin(
      this.stableId('usage-log', scope),
      { route: { id: routeId } },
      tags,
    );
    return { heartbeatPath };
  }
  parseUsageEvents(body: unknown): UsageEvent[] {
    const record = (v: unknown): Record<string, unknown> =>
      v !== null && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : {};
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const events: UsageEvent[] = [];
    for (const entry of Array.isArray(body) ? body : [body]) {
      const row = record(entry),
        timestamp = row.started_at;
      if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp))
        continue;
      const startedAt = new Date(timestamp);
      if (!Number.isFinite(startedAt.getTime())) continue;
      if (
        record(row.route).id ===
        this.stableId('usage-route', this.config.instanceId)
      ) {
        events.push({ heartbeat: true, startedAt });
        continue;
      }
      const username = record(row.consumer).username;
      const appId =
        typeof username === 'string' && username.startsWith('portal-app-')
          ? username.slice(11)
          : '';
      const credentialId = record(row.authenticated_entity).id;
      const status = record(row.response).status;
      if (
        !uuid.test(appId) ||
        typeof credentialId !== 'string' ||
        !uuid.test(credentialId) ||
        typeof status !== 'number' ||
        !Number.isInteger(status) ||
        status < 100 ||
        status > 599
      )
        continue;
      const serviceId = record(row.service).id;
      events.push({
        heartbeat: false,
        appId,
        credentialId,
        serviceId: typeof serviceId === 'string' ? serviceId : '',
        status,
        startedAt,
      });
    }
    return events;
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
    // Admin API acknowledgement precedes cross-worker/cluster invalidation.
    // Even strict worker consistency can use a warm iterator until that event
    // arrives. Use the same propagation allowance as the access-policy upgrade
    // before publishing the protected service; a no-op needs no settle wait.
    if (plan.writes.length) await delay(6000);
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
    if (this.config.usage) {
      const usagePlugins = plugins.filter(
        (p) => p.name === 'http-log' && this.owns(p) && p.consumer,
      );
      for (const desired of policy.apps) {
        const consumer = consumers.find((c) => c.appId === desired.app.id);
        if (!consumer) continue;
        const plugin = usagePlugins.find(
          (p) => p.id === this.stableId('http-log', desired.app.id),
        );
        const config = this.usageConfig();
        if (
          !plugin ||
          plugin.enabled === false ||
          plugin.consumer?.id !== consumer.id ||
          plugin.route ||
          plugin.service ||
          !this.usageMatches(plugin.config, config)
        ) {
          try {
            await this.putUsagePlugin(desired.app, consumer.id);
            report.repairs.push({
              object: 'plugin',
              action: plugin ? 'updated' : 'added',
              appId: desired.app.id,
              detail: 'Usage collection repaired',
            });
          } catch (error) {
            if (!(error instanceof UsageUnavailableError)) throw error;
            report.findings.push({
              code: 'usage-unavailable',
              serviceId: '',
              serviceName: '',
              message: error.message,
            });
          }
        }
      }
      for (const plugin of usagePlugins) {
        if (
          policy.apps.some(
            (a) => plugin.id === this.stableId('http-log', a.app.id),
          )
        )
          continue;
        await this.request(`/plugins/${plugin.id}`, 'DELETE', undefined, true);
        report.repairs.push({
          object: 'plugin',
          action: 'removed',
          detail: 'Stale usage collection removed',
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

  private tracingConfig(
    plan: Pick<TracingPlan, 'endpoint' | 'token'>,
    selections: string[],
    apiId?: string,
  ) {
    return {
      traces_endpoint: plan.endpoint,
      headers: { Authorization: `Bearer ${plan.token}` },
      resource_attributes: {
        'portal.instance': this.config.instanceId,
        'portal.selections': [...new Set(selections)].sort().join(','),
        ...(apiId ? { 'portal.api_id': apiId } : {}),
      },
      propagation: {
        extract: [],
        inject: ['preserve'],
        default_format: 'w3c',
      },
    };
  }

  async applyTracing(plan: TracingPlan): Promise<TracingReport> {
    const plugins = (await this.pages('/plugins?size=1000')).filter(
      (plugin) =>
        plugin.name === 'opentelemetry' &&
        plugin.tags?.includes('portal-tracing') &&
        this.owns(plugin),
    );
    const desired = new Map<
      string,
      { scope: Record<string, unknown>; selections: string[]; apiId?: string }
    >();
    for (const target of plan.targets) {
      let key: string;
      let scope: Record<string, unknown>;
      if ('service' in target.scope) {
        key = `service:${target.scope.service}`;
        scope = { service: { id: target.scope.service } };
      } else {
        const consumer = await this.request<Entity>(
          `/consumers/${consumerUsername({ id: target.scope.app })}`,
          'GET',
          undefined,
          true,
        );
        if (!consumer) continue;
        key = `consumer:${consumer.id}`;
        scope = { consumer: { id: consumer.id } };
      }
      const current = desired.get(key);
      desired.set(key, {
        scope,
        selections: [...(current?.selections ?? []), ...target.selections],
        apiId: target.apiId ?? current?.apiId,
      });
    }
    const report: TracingReport = { created: 0, updated: 0, removed: 0 };
    const retained = new Set<string>();
    for (const [key, value] of desired) {
      const id = this.stableId('opentelemetry', key);
      retained.add(id);
      const body = {
        name: 'opentelemetry',
        ...value.scope,
        enabled: true,
        tags: [...portalTags(this.config.instanceId), 'portal-tracing'],
        config: this.tracingConfig(plan, value.selections, value.apiId),
      };
      const existing = plugins.find((plugin) => plugin.id === id);
      if (existing && isDeepStrictEqual(existing.config, body.config)) continue;
      try {
        await this.request(`/plugins/${id}`, 'PUT', body);
      } catch (error) {
        if (error instanceof GatewayRejectedError)
          throw new TracingUnavailableError(error.status);
        throw error;
      }
      if (existing) report.updated++;
      else report.created++;
    }
    for (const plugin of plugins) {
      if (retained.has(plugin.id)) continue;
      await this.request(`/plugins/${plugin.id}`, 'DELETE', undefined, true);
      report.removed++;
    }
    return report;
  }

  async inspectTracing() {
    const root = await this.request<{
      configuration?: {
        tracing_instrumentations?: string | string[];
        tracing_sampling_rate?: number | string;
      };
    }>('/');
    const raw = root?.configuration?.tracing_instrumentations;
    const instrumentations = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.split(',').map((value) => value.trim()).filter(Boolean)
        : [];
    const rate = Number(root?.configuration?.tracing_sampling_rate ?? 0);
    return {
      instrumentations,
      samplingRate: Number.isFinite(rate) ? rate : 0,
    };
  }

  async ensureTraceProbe(input: {
    endpoint: string;
    token: string;
    nonce: string;
  }) {
    const scope = this.config.instanceId;
    const serviceId = this.stableId('trace-probe-service', scope);
    const routeId = this.stableId('trace-probe-route', scope);
    const probePath = `/__portal/trace-probe/${scope}`;
    const tags = [...portalTags(scope), 'portal-internal'];
    await this.request(`/services/${serviceId}`, 'PUT', {
      name: 'portal-trace-probe',
      url: 'http://127.0.0.1:65535',
      tags,
    });
    await this.request(`/routes/${routeId}`, 'PUT', {
      service: { id: serviceId },
      paths: [probePath],
      tags,
    });
    await this.request(`/plugins/${this.stableId('trace-probe-stop', scope)}`, 'PUT', {
      name: 'request-termination',
      route: { id: routeId },
      config: { status_code: 204 },
      tags,
    });
    try {
      await this.request(`/plugins/${this.stableId('trace-probe-otel', scope)}`, 'PUT', {
        name: 'opentelemetry',
        route: { id: routeId },
        config: {
          ...this.tracingConfig(input, ['probe']),
          sampling_rate: 1,
          resource_attributes: {
            ...this.tracingConfig(input, ['probe']).resource_attributes,
            'portal.probe': input.nonce,
          },
        },
        tags: [...tags, 'portal-tracing'],
      });
    } catch (error) {
      if (error instanceof GatewayRejectedError)
        throw new TracingUnavailableError(error.status);
      throw error;
    }
    return { probePath };
  }

  classifySpan(name: string): SpanClass {
    if (name === 'kong') return { label: 'request' };
    if (name === 'kong.router' || name === 'router') return { label: 'router' };
    if (name === 'kong.balancer' || /^balancer try #\d+$/.test(name))
      return { label: 'upstream' };
    const modern = /^kong\.(?:rewrite|access|header_filter)\.plugin\.(.+)$/.exec(name);
    const legacy = /^(?:rewrite|access|header_filter) phase: (.+)$/.exec(name);
    const plugin = modern?.[1] ?? legacy?.[1];
    return plugin ? { label: 'plugin', plugin } : { label: 'other' };
  }

  parseTraceBatch(bytes: Uint8Array): TraceBatch {
    try {
      const type = protobuf.Root.fromJSON(otlpDescriptor as never).lookupType(
        'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest',
      );
      const decoded = type.toObject(type.decode(bytes), {
        longs: String,
        bytes: String,
        defaults: false,
      }) as Record<string, unknown>;
      const record = (value: unknown): Record<string, unknown> =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const attributeValue = (value: unknown): string | number | undefined => {
        const values = record(value);
        if (typeof values.stringValue === 'string') return values.stringValue;
        if (typeof values.intValue === 'number' || typeof values.intValue === 'string') {
          const integer = Number(values.intValue);
          return Number.isSafeInteger(integer) ? integer : undefined;
        }
        return undefined;
      };
      const attributes = (value: unknown) =>
        Object.fromEntries(
          (Array.isArray(value) ? value : []).flatMap((item) => {
            const attr = record(item);
            const key = typeof attr.key === 'string' ? attr.key : '';
            const result = attributeValue(attr.value);
            return key && result !== undefined ? [[key, result]] : [];
          }),
        );
      const textAttribute = (attrs: Record<string, string | number>, ...keys: string[]) => {
        const value = keys.map((key) => attrs[key]).find((item) => typeof item === 'string');
        return typeof value === 'string' ? value : undefined;
      };
      const integerAttribute = (attrs: Record<string, string | number>, ...keys: string[]) => {
        const value = keys.map((key) => attrs[key]).find((item) => {
          const numeric = typeof item === 'number' ? item : Number(item);
          return Number.isSafeInteger(numeric) && numeric >= 100 && numeric <= 599;
        });
        if (value === undefined) return undefined;
        return typeof value === 'number' ? value : Number(value);
      };
      const pathAttribute = (attrs: Record<string, string | number>) => {
        const direct = textAttribute(attrs, 'http.target', 'url.path');
        if (direct) return direct.split('?')[0];
        const full = textAttribute(attrs, 'http.url', 'url.full');
        if (!full) return undefined;
        try {
          return new URL(full, 'http://kong.invalid').pathname;
        } catch {
          return full.split('?')[0];
        }
      };
      const resourceSpans = Array.isArray(decoded.resourceSpans)
        ? decoded.resourceSpans
        : [];
      let resource: TraceBatch['resource'] | undefined;
      const spans: TraceBatch['spans'] = [];
      for (const resourceEntry of resourceSpans) {
        const entry = record(resourceEntry);
        const attrs = attributes(record(entry.resource).attributes);
        resource ??= {
          instance: textAttribute(attrs, 'portal.instance') ?? '',
          selections: (textAttribute(attrs, 'portal.selections') ?? '').split(',').filter(Boolean),
          ...(textAttribute(attrs, 'portal.api_id')
            ? { apiId: textAttribute(attrs, 'portal.api_id') }
            : {}),
          ...(textAttribute(attrs, 'portal.probe')
            ? { probe: textAttribute(attrs, 'portal.probe') }
            : {}),
        };
        for (const scopeEntry of Array.isArray(entry.scopeSpans) ? entry.scopeSpans : []) {
          for (const item of Array.isArray(record(scopeEntry).spans) ? record(scopeEntry).spans as unknown[] : []) {
            const span = record(item);
            const spanAttrs = attributes(span.attributes);
            const startNs = String(span.startTimeUnixNano ?? '0');
            const endNs = String(span.endTimeUnixNano ?? startNs);
            const method = textAttribute(spanAttrs, 'http.method', 'http.request.method');
            const path = pathAttribute(spanAttrs);
            const statusCode = integerAttribute(
              spanAttrs,
              'http.status_code',
              'http.response.status_code',
            );
            spans.push({
              traceId: Buffer.from(String(span.traceId ?? ''), 'base64').toString('hex'),
              spanId: Buffer.from(String(span.spanId ?? ''), 'base64').toString('hex'),
              parentSpanId: span.parentSpanId
                ? Buffer.from(String(span.parentSpanId), 'base64').toString('hex') || null
                : null,
              name: typeof span.name === 'string' ? span.name : '',
              startNs,
              durationNs: (BigInt(endNs) - BigInt(startNs)).toString(),
              status: String(record(span.status).code ?? '0'),
              ...(path && method && statusCode !== undefined
                ? {
                    request: {
                      method,
                      path,
                      statusCode,
                    },
                  }
                : {}),
              ...(textAttribute(spanAttrs, 'http.route')
                ? { routePath: textAttribute(spanAttrs, 'http.route') }
                : {}),
            });
          }
        }
      }
      if (!resource || !resource.instance || !spans.length)
        throw new Error('missing OTLP fields');
      return { resource, spans };
    } catch (error) {
      if (error instanceof InvalidTraceBatchError) throw error;
      throw new InvalidTraceBatchError({ cause: error });
    }
  }
}
