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
}
export class GatewayUnavailableError extends Error {
  constructor() {
    super('The API gateway is unavailable');
    this.name = 'GatewayUnavailableError';
  }
}
export class GatewayRejectedError extends Error {
  constructor(readonly status: number) {
    super('The API gateway rejected the request');
    this.name = 'GatewayRejectedError';
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
