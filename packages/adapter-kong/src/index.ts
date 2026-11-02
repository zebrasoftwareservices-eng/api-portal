// SPDX-License-Identifier: Apache-2.0
import {
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
}
export interface KongConfig {
  adminUrl: string;
  instanceId: string;
  adminToken?: string;
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
      oauthClients: false,
      plans: false,
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
  async listServices(): Promise<GatewayService[]> {
    const [services, routes, plugins] = await Promise.all([
      this.pages('/services?size=1000'),
      this.pages('/routes?size=1000'),
      this.pages('/plugins?size=1000'),
    ]);
    return services.map((service) => {
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
    return { id: consumer.id, username };
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
    return consumers.map((c) => ({
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
