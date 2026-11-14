// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('spec 016 production install artifacts', () => {
  it('AC 1: production Compose isolates data services and enables only the hardened edge', () => {
    const compose = parse(read('deploy/production/compose.yaml'));
    expect(Object.keys(compose.services)).toEqual([
      'postgres',
      'server',
      'portal',
      'caddy',
    ]);
    expect(compose.services.postgres.ports).toBeUndefined();
    expect(compose.services.server.ports).toBeUndefined();
    expect(compose.services.server.environment).toMatchObject({
      NODE_ENV: 'production',
      SEED_SAMPLE: 'false',
    });
    expect(compose.services.portal.ports).toEqual([
      '127.0.0.1:${PORTAL_HTTP_PORT:-3000}:3000',
    ]);
    expect(compose.services.caddy.profiles).toEqual(['caddy']);
    for (const service of ['server', 'portal', 'caddy']) {
      expect(compose.services[service]['<<']).toMatchObject({
        read_only: true,
        cap_drop: ['ALL'],
        security_opt: ['no-new-privileges:true'],
      });
    }
  });

  it('AC 2: Compose supplies every required production secret through a file', () => {
    const compose = parse(read('deploy/production/compose.yaml'));
    expect(compose.services.server.environment).toMatchObject({
      DATABASE_PASSWORD_FILE: '/run/secrets/db_password',
      BETTER_AUTH_SECRET_FILE: '/run/secrets/auth_secret',
      PORTAL_ENCRYPTION_KEY_FILE: '/run/secrets/encryption_key',
    });
    expect(compose.services.server.secrets).toEqual(
      expect.arrayContaining(['db_password', 'auth_secret', 'encryption_key']),
    );
  });

  it('AC 3: release workflow publishes only exact server and portal version tags', () => {
    const workflow = read('.github/workflows/release.yml');
    expect(workflow).toContain("tags: ['v*']");
    expect(workflow).toContain('packages: write');
    expect(workflow).toContain(
      'api-portal-server:${{ steps.version.outputs.version }}',
    );
    expect(workflow).toContain(
      'api-portal-portal:${{ steps.version.outputs.version }}',
    );
    expect(workflow).not.toMatch(/[:/]latest(?:\s|$)/);
    for (const action of workflow.matchAll(/uses:\s*([^\s]+)/g))
      expect(action[1]).toMatch(/@[0-9a-f]{40}$/);
  });

  it('AC 7: chart targets Kubernetes 1.37 and hardens every workload', () => {
    const chart = parse(read('deploy/helm/api-portal/Chart.yaml'));
    expect(chart.kubeVersion).toBe('>=1.37.0-0 <1.38.0-0');
    expect(chart.dependencies).toBeUndefined();
    for (const template of ['server.yaml', 'portal.yaml', 'postgres.yaml']) {
      const source = read(`deploy/helm/api-portal/templates/${template}`);
      expect(source).toContain('runAsNonRoot: true');
      expect(source).toContain('allowPrivilegeEscalation: false');
      expect(source).toContain('readOnlyRootFilesystem: true');
      expect(source).toContain('capabilities: { drop: [ALL] }');
    }
  });

  it('AC 8: external database disables bundled Postgres and ingress requires publicUrl', () => {
    const postgres = read('deploy/helm/api-portal/templates/postgres.yaml');
    const helpers = read('deploy/helm/api-portal/templates/_helpers.tpl');
    expect(postgres).toContain('(not .Values.externalDatabase.url)');
    expect(postgres).toContain(
      '(not .Values.externalDatabase.existingSecret)',
    );
    expect(helpers).toContain(
      'fail "publicUrl is required when ingress.enabled is true"',
    );
  });

  it('AC 9: server probes keep liveness independent from database readiness', () => {
    const server = read('deploy/helm/api-portal/templates/server.yaml');
    expect(server).toContain(
      'livenessProbe: { httpGet: { path: /api/v1/health/live',
    );
    expect(server).toContain(
      'readinessProbe: { httpGet: { path: /api/v1/health/ready',
    );
  });

  it('AC 10: setup tokens are absent from chart Secrets and two replicas are configurable', () => {
    const secret = read('deploy/helm/api-portal/templates/secret.yaml');
    const server = read('deploy/helm/api-portal/templates/server.yaml');
    expect(secret).not.toMatch(/setup.?token/i);
    expect(server).toContain('replicas: {{ .Values.server.replicas }}');
  });

  it('AC 11: the image contains an explicit schema-ahead guard and rollback diagnostic', () => {
    const database = read('packages/db/src/index.ts');
    const main = read('apps/server/src/main.ts');
    expect(database).toContain('throw new SchemaAheadError()');
    expect(main).toContain('restore the backup taken before the upgrade');
    expect(main).toContain('start the previous version');
  });

  it('AC 7-10 failure paths: Helm smoke cannot report success before every runtime assertion', () => {
    const smoke = read('deploy/helm/smoke.sh');
    const success = smoke.indexOf('PASS: AC 7-10 runtime assertions');
    expect(success).toBeGreaterThan(0);

    for (const assertion of [
      "fail 'portal did not answer through its Service'",
      'runs as root',
      'server replicas logged different setup tokens',
      'setup token row remains after claim',
      'NotReady servers remain in the Service Endpoints',
      'server restarted during the database outage',
      'externalDatabase release created a Postgres pod',
      'invalid ingress error does not name publicUrl',
    ]) {
      const position = smoke.indexOf(assertion);
      expect(position, assertion).toBeGreaterThan(0);
      expect(position, assertion).toBeLessThan(success);
    }
  });
});
