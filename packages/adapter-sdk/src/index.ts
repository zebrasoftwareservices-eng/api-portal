// SPDX-License-Identifier: Apache-2.0
export interface AppRef {
  id: string;
}
export interface PlanLimits {
  rate: { unit: 'second' | 'minute'; limit: number };
  monthlyQuota: number;
}
export interface Capabilities {
  apiKeys: true;
  accessControl: true;
  oauthClients: false;
  plans: boolean;
  usage: boolean;
  tracing: boolean;
}
export type SpanClass =
  | { label: 'request' | 'router' | 'upstream' | 'other' }
  | { label: 'plugin'; plugin: string };
export interface TraceSpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startNs: string;
  durationNs: string;
  status: string;
  request?: { method: string; path: string; statusCode: number };
  routePath?: string;
}
export interface TraceBatch {
  resource: {
    instance: string;
    selections: string[];
    apiId?: string;
    probe?: string;
  };
  spans: TraceSpanRecord[];
}
export interface TracingTarget {
  scope: { service: string } | { app: string };
  selections: string[];
  apiId?: string;
}
export interface TracingPlan {
  endpoint: string;
  token: string;
  targets: TracingTarget[];
}
export interface TracingReport {
  created: number;
  updated: number;
  removed: number;
}
export interface HealthReport {
  reachable: boolean;
  version?: string;
  latencyMs: number;
}
export interface GatewayService {
  id: string;
  name: string;
  routes: { id: string; name: string | null; paths: string[] }[];
  keyAuth: boolean;
}
export interface ConsumerRef {
  id: string;
  username: string;
}
export interface CredentialSpec {
  id: string;
  key: string;
}
export interface IssuedCredential {
  id: string;
}
export interface OwnedConsumer extends ConsumerRef {
  appId: string;
  tags: string[];
  credentials: { id: string; tags: string[] }[];
}
export interface ServiceRef {
  id: string;
}
export interface AccessFinding {
  code: string;
  serviceId: string;
  serviceName: string;
  message: string;
}
export interface AccessRepair {
  action: 'added' | 'removed' | 'updated';
  object: 'membership' | 'plugin';
  appId?: string;
  serviceId?: string;
  detail: string;
}
export interface ServiceProtection {
  keyAuth: boolean;
  findings: AccessFinding[];
}
export interface AccessPolicy {
  services: ServiceRef[];
  apps: { app: AppRef; services: ServiceRef[]; limits: PlanLimits | null }[];
}
export interface AccessReport {
  repairs: AccessRepair[];
  findings: AccessFinding[];
}
export class GatewayServiceConflictError extends Error {
  constructor(readonly serviceName: string) {
    super('An operator ACL applies to the gateway service');
    this.name = 'GatewayServiceConflictError';
  }
}
export type ConnectionCheck =
  | { outcome: 'ok'; version: string }
  | { outcome: 'unreachable' | 'refused' | 'not-gateway' | 'read-only' };
export interface GatewayAdapter {
  readonly kind: 'kong';
  capabilities(): Capabilities;
  parseUsageEvents(body: unknown): UsageEvent[];
  ensureUsageCollection(): Promise<{ heartbeatPath: string }>;
  health(): Promise<HealthReport>;
  checkConnection(): Promise<ConnectionCheck>;
  checkProxy(url: string): Promise<boolean>;
  listServices(): Promise<GatewayService[]>;
  getService(idOrName: string): Promise<GatewayService | null>;
  ensureConsumer(app: AppRef): Promise<ConsumerRef>;
  deleteConsumer(app: AppRef): Promise<void>;
  issueCredential(
    app: AppRef,
    credential: CredentialSpec,
  ): Promise<IssuedCredential>;
  revokeCredential(app: AppRef, credentialId: string): Promise<void>;
  applyPlanLimits(app: AppRef, limits: PlanLimits | null): Promise<void>;
  grantAccess(app: AppRef, service: ServiceRef): Promise<void>;
  revokeAccess(app: AppRef, service: ServiceRef): Promise<void>;
  protectService(service: ServiceRef): Promise<ServiceProtection>;
  applyAccessPolicy(policy: AccessPolicy): Promise<AccessReport>;
  isAccessDenied(response: {
    status: number;
    headers: Headers;
    body: Uint8Array;
  }): boolean;
  listOwnedConsumers(): Promise<OwnedConsumer[]>;
  applyTracing(plan: TracingPlan): Promise<TracingReport>;
  inspectTracing(): Promise<{ instrumentations: string[]; samplingRate: number }>;
  ensureTraceProbe(input: {
    endpoint: string;
    token: string;
    nonce: string;
  }): Promise<{ probePath: string }>;
  parseTraceBatch(bytes: Uint8Array): TraceBatch;
  classifySpan(name: string): SpanClass;
}
export class GatewayUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The API gateway is unavailable', options);
    this.name = 'GatewayUnavailableError';
  }
}
export class GatewayRejectedError extends Error {
  constructor(readonly status: number) {
    super('The API gateway rejected the request');
    this.name = 'GatewayRejectedError';
  }
}
export class TracingUnavailableError extends GatewayRejectedError {
  readonly code = 'tracing-unavailable';
  constructor(status = 400) {
    super(status);
    this.message =
      'Kong refused the opentelemetry plugin; check KONG_PLUGINS.';
    this.name = 'TracingUnavailableError';
  }
}
export class InvalidTraceBatchError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The OTLP trace batch is invalid.', options);
    this.name = 'InvalidTraceBatchError';
  }
}
export const consumerUsername = (app: AppRef) => `portal-app-${app.id}`;
export function portalTags(
  instanceId: string,
  app?: AppRef,
  credentialId?: string,
) {
  return [
    'portal',
    `portal-instance-${instanceId}`,
    ...(app ? [`portal-app-${app.id}`] : []),
    ...(credentialId ? [`portal-cred-${credentialId}`] : []),
  ];
}

export type UsageEvent =
  | { heartbeat: true; startedAt: Date }
  | {
      heartbeat: false;
      appId: string;
      credentialId: string;
      serviceId: string;
      status: number;
      startedAt: Date;
    };
export class UsageUnavailableError extends GatewayRejectedError {
  readonly code = 'usage-unavailable';
  constructor() {
    super(400);
    this.message = 'The gateway refused redacted usage collection.';
    this.name = 'UsageUnavailableError';
  }
}
