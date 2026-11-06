// SPDX-License-Identifier: Apache-2.0
export interface AppRef {
  id: string;
}
export interface Capabilities {
  apiKeys: true;
  accessControl: true;
  oauthClients: false;
  plans: false;
  usage: false;
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
  apps: { app: AppRef; services: ServiceRef[] }[];
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
export interface GatewayAdapter {
  readonly kind: 'kong';
  capabilities(): Capabilities;
  health(): Promise<HealthReport>;
  listServices(): Promise<GatewayService[]>;
  getService(idOrName: string): Promise<GatewayService | null>;
  ensureConsumer(app: AppRef): Promise<ConsumerRef>;
  deleteConsumer(app: AppRef): Promise<void>;
  issueCredential(
    app: AppRef,
    credential: CredentialSpec,
  ): Promise<IssuedCredential>;
  revokeCredential(app: AppRef, credentialId: string): Promise<void>;
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
