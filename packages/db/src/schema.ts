// SPDX-License-Identifier: Apache-2.0
import {
  pgTable,
  boolean,
  text,
  timestamp,
  uuid,
  smallint,
  jsonb,
  check,
  uniqueIndex,
  index,
  integer,
  foreignKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth-schema.js';
export * from './auth-schema.js';
const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time('created_at').notNull().defaultNow();
const updated = () => time('updated_at').notNull().defaultNow();
export const instanceSettings = pgTable(
  'instance_settings',
  {
    id: smallint('id').primaryKey().default(1),
    instanceId: uuid('instance_id').notNull(),
    createdAt: created(),
  },
  (t) => [check('instance_singleton', sql`${t.id} = 1`)],
);
export const gateways = pgTable(
  'gateways',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull().unique(),
    kind: text('kind').notNull(),
    managedBy: text('managed_by').notNull().default('admin'),
    enabled: boolean('enabled').notNull().default(true),
    adminUrl: text('admin_url').notNull(),
    adminTokenCiphertext: text('admin_token_ciphertext'),
    proxyPublicUrl: text('proxy_public_url').notNull(),
    proxyInternalUrl: text('proxy_internal_url').notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check('gateway_kind_check', sql`${t.kind} in ('kong')`),
    check('gateway_managed_by_check', sql`${t.managedBy} in ('admin','env')`),
    uniqueIndex('gateway_singleton').on(sql`(1)`),
  ],
);
export const apis = pgTable(
  'apis',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    latestVersionId: uuid('latest_version_id'),
    gatewayId: uuid('gateway_id')
      .notNull()
      .references(() => gateways.id),
    gatewayServiceId: text('gateway_service_id').notNull(),
    gatewayServiceName: text('gateway_service_name').notNull(),
    routePath: text('route_path').notNull(),
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    publishedAt: time('published_at').notNull().defaultNow(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('api_published_idx').on(t.publishedAt.desc()),
    foreignKey({
      columns: [t.id, t.latestVersionId],
      foreignColumns: [apiVersions.apiId, apiVersions.id],
      name: 'api_latest_version_fk',
    }),
  ],
);
export const apiVersions = pgTable(
  'api_versions',
  {
    id: uuid('id').primaryKey(),
    apiId: uuid('api_id')
      .notNull()
      .references((): AnyPgColumn => apis.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    document: jsonb('document').$type<Record<string, unknown>>().notNull(),
    sourceUrl: text('source_url'),
    sourceContent: text('source_content'),
    sourceFormat: text('source_format'),
    releaseNote: text('release_note'),
    changeSummary: jsonb('change_summary').$type<Record<string, unknown>>(),
    lintWarnings: jsonb('lint_warnings').$type<Record<string, unknown>[]>(),
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    publishedAt: time('published_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('api_version_unique').on(t.apiId, t.version),
    uniqueIndex('api_version_id_unique').on(t.apiId, t.id),
    check(
      'api_version_source_format',
      sql`${t.sourceFormat} in ('json', 'yaml')`,
    ),
  ],
);
export const apps = pgTable(
  'apps',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('app_owner_name_unique').on(t.ownerId, t.name)],
);
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    apiId: uuid('api_id')
      .notNull()
      .references(() => apis.id, { onDelete: 'restrict' }),
    createdAt: created(),
  },
  (t) => [uniqueIndex('subscription_app_api_unique').on(t.appId, t.apiId)],
);
export const gatewayConsumers = pgTable(
  'gateway_consumers',
  {
    id: uuid('id').primaryKey(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    gatewayId: uuid('gateway_id')
      .notNull()
      .references(() => gateways.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    username: text('username').notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex('consumer_app_gateway_unique').on(t.appId, t.gatewayId)],
);
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey(),
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    gatewayId: uuid('gateway_id').references(() => gateways.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull().default('api-key'),
    keyHint: text('key_hint').notNull(),
    status: text('status').notNull(),
    createdAt: created(),
    revokedAt: time('revoked_at'),
  },
  (t) => [
    check(
      'credential_active_has_gateway',
      sql`${t.status} <> 'active' or ${t.gatewayId} is not null`,
    ),
    check('credential_status_check', sql`${t.status} in ('active','revoked')`),
    index('credential_app_status_idx').on(t.appId, t.status),
  ],
);

export const mailSettings = pgTable(
  'mail_settings',
  {
    id: smallint('id').primaryKey().default(1),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    security: text('security').notNull(),
    username: text('username'),
    passwordCiphertext: text('password_ciphertext'),
    senderName: text('sender_name').notNull(),
    senderAddress: text('sender_address').notNull(),
    updatedBy: uuid('updated_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    updatedAt: updated(),
  },
  (t) => [
    check('mail_singleton', sql`${t.id} = 1`),
    check('mail_port', sql`${t.port} between 1 and 65535`),
    check('mail_security', sql`${t.security} in ('none','starttls','tls')`),
  ],
);
export const accountSettings = pgTable(
  'account_settings',
  {
    id: smallint('id').primaryKey().default(1),
    requireVerifiedEmail: boolean('require_verified_email')
      .notNull()
      .default(false),
    signInFailureMax: integer('sign_in_failure_max').notNull().default(10),
    signInFailureWindowMinutes: integer('sign_in_failure_window_minutes')
      .notNull()
      .default(15),
    resetEmailMax: integer('reset_email_max').notNull().default(3),
    resetEmailWindowMinutes: integer('reset_email_window_minutes')
      .notNull()
      .default(60),
    verificationEmailMax: integer('verification_email_max')
      .notNull()
      .default(3),
    verificationEmailWindowMinutes: integer('verification_email_window_minutes')
      .notNull()
      .default(60),
    updatedAt: updated(),
  },
  (t) => [
    check('accounts_singleton', sql`${t.id} = 1`),
    ...[t.signInFailureMax, t.resetEmailMax, t.verificationEmailMax].map(
      (c, i) => check(`account_max_${i}`, sql`${c} between 1 and 1000`),
    ),
    ...[
      t.signInFailureWindowMinutes,
      t.resetEmailWindowMinutes,
      t.verificationEmailWindowMinutes,
    ].map((c, i) => check(`account_window_${i}`, sql`${c} between 1 and 1440`)),
  ],
);
export const emailChangeRequests = pgTable('email_change_requests', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  newEmail: text('new_email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: time('expires_at').notNull(),
  createdAt: created(),
});
export const rateLimitHits = pgTable(
  'rate_limit_hits',
  {
    id: uuid('id').primaryKey(),
    bucket: text('bucket').notNull(),
    subjectHash: text('subject_hash').notNull(),
    createdAt: created(),
  },
  (t) => [
    check(
      'rate_bucket',
      sql`${t.bucket} in ('sign-in-failure','password-reset','verification-email')`,
    ),
    index('rate_limit_window_idx').on(t.bucket, t.subjectHash, t.createdAt),
  ],
);
