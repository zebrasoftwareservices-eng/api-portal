// SPDX-License-Identifier: Apache-2.0
export interface AppRef {
  id: string;
}
export interface Capabilities {
  apiKeys: true;
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
