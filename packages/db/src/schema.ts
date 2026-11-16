// SPDX-License-Identifier: Apache-2.0
import {
  pgTable,
  bigint,
  date,
  primaryKey,
  boolean,
  text,
  timestamp,
  uuid,
  smallint,
  jsonb,
  json,
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
export const setupTokens = pgTable(
  'setup_tokens',
  {
    id: smallint('id').primaryKey().default(1),
    tokenCiphertext: text('token_ciphertext').notNull(),
    createdAt: created(),
  },
  (t) => [check('setup_token_singleton', sql`${t.id} = 1`)],
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
export const gatewayOperations = pgTable(
  'gateway_operations',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind')
      .notNull()
      .$type<'create-app' | 'issue-credential' | 'revoke-credential'>(),
    appId: uuid('app_id').notNull(),
    credentialId: uuid('credential_id'),
    gatewayId: uuid('gateway_id')
      .notNull()
      .references(() => gateways.id, { onDelete: 'cascade' }),
    startedAt: time('started_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'gateway_operation_kind',
      sql`${t.kind} in ('create-app','issue-credential','revoke-credential')`,
    ),
    index('gateway_operation_started_idx').on(t.startedAt),
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
    seeded: boolean('seeded').notNull().default(false),
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
    document: json('document').$type<Record<string, unknown>>().notNull(),
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
export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    personalOwnerId: uuid('personal_owner_id')
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [check('team_name', sql`length(btrim(${t.name})) between 1 and 80`)],
);
export const teamMembers = pgTable(
  'team_members',
  {
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().$type<'admin' | 'member' | 'read-only'>(),
    selectedAt: time('selected_at').notNull().defaultNow(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    check('team_member_role', sql`${t.role} in ('admin','member','read-only')`),
    index('team_member_current_idx').on(t.userId, t.selectedAt.desc()),
  ],
);
export const teamInvitations = pgTable(
  'team_invitations',
  {
    id: uuid('id').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().$type<'admin' | 'member' | 'read-only'>(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: created(),
    expiresAt: time('expires_at').notNull(),
    acceptedAt: time('accepted_at'),
    acceptedBy: uuid('accepted_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    cancelledAt: time('cancelled_at'),
  },
  (t) => [
    check(
      'team_invitation_role',
      sql`${t.role} in ('admin','member','read-only')`,
    ),
    uniqueIndex('team_invitation_pending_unique')
      .on(t.teamId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.cancelledAt} is null`),
  ],
);
export const BUILTIN_PLAN_ID = '01937a00-0000-7000-8000-000000000009';
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    visibility: text('visibility')
      .notNull()
      .default('open')
      .$type<'open' | 'hidden' | 'internal' | 'manual'>(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      'product_visibility',
      sql`${t.visibility} in ('open','hidden','internal','manual')`,
    ),
    check('product_name', sql`length(btrim(${t.name})) between 1 and 80`),
  ],
);
export const productTeams = pgTable(
  'product_teams',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.teamId] })],
);
export const productApis = pgTable(
  'product_apis',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    apiId: uuid('api_id')
      .notNull()
      .references(() => apis.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.apiId] })],
);
export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey(),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    description: text('description'),
    rateLimit: integer('rate_limit'),
    rateLimitUnit: text('rate_limit_unit').$type<'second' | 'minute'>(),
    monthlyQuota: integer('monthly_quota'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    builtin: boolean('builtin').notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check('plan_builtin_product', sql`${t.builtin} = (${t.productId} is null)`),
    check(
      'plan_limits',
      sql`(${t.builtin} and ${t.rateLimit} is null and ${t.rateLimitUnit} is null and ${t.monthlyQuota} is null) or (not ${t.builtin} and ${t.rateLimit} is not null and ${t.rateLimitUnit} is not null and ${t.monthlyQuota} is not null and ${t.rateLimit} > 0 and ${t.rateLimitUnit} in ('second','minute') and ${t.monthlyQuota} >= ${t.rateLimit})`,
    ),
    uniqueIndex('plan_product_name_unique').on(t.productId, t.name),
    uniqueIndex('plan_id_product_unique').on(t.id, t.productId),
    uniqueIndex('plan_builtin_unique')
      .on(t.builtin)
      .where(sql`${t.builtin}`),
  ],
);
export const planApis = pgTable(
  'plan_apis',
  {
    planId: uuid('plan_id').notNull(),
    productId: uuid('product_id').notNull(),
    apiId: uuid('api_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.apiId] }),
    foreignKey({
      columns: [t.planId, t.productId],
      foreignColumns: [plans.id, plans.productId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.productId, t.apiId],
      foreignColumns: [productApis.productId, productApis.apiId],
    }).onDelete('restrict'),
  ],
);
export const apps = pgTable(
  'apps',
  {
    status: text('status')
      .notNull()
      .default('active')
      .$type<'active' | 'revoke-pending' | 'revoked'>(),
    origin: text('origin')
      .notNull()
      .default('self')
      .$type<'self' | 'request' | 'admin'>(),
    keyIssued: boolean('key_issued').notNull().default(true),
    revokedAt: time('revoked_at'),
    revokeReason: text('revoke_reason').$type<'visibility' | 'approval'>(),
    planId: uuid('plan_id')
      .notNull()
      .default(BUILTIN_PLAN_ID)
      .references(() => plans.id, { onDelete: 'restrict' }),
    id: uuid('id').primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      'app_status',
      sql`${t.status} in ('active','revoke-pending','revoked')`,
    ),
    check('app_origin', sql`${t.origin} in ('self','request','admin')`),
    check(
      'app_revoke_reason',
      sql`${t.revokeReason} in ('visibility','approval')`,
    ),
    index('app_revoke_pending_idx')
      .on(t.status)
      .where(sql`${t.status} = 'revoke-pending'`),
    uniqueIndex('app_team_name_unique')
      .on(t.teamId, t.name)
      .where(sql`${t.status} <> 'revoked'`),
    index('app_plan_idx').on(t.planId),
  ],
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
    createdBy: uuid('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
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
      sql`${t.bucket} in ('sign-in-failure','password-reset','verification-email','team-invitation')`,
    ),
    index('rate_limit_window_idx').on(t.bucket, t.subjectHash, t.createdAt),
  ],
);

export const accessRequests = pgTable(
  'access_requests',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull().$type<'subscribe' | 'plan-change'>(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    fromPlanId: uuid('from_plan_id').references(() => plans.id, {
      onDelete: 'restrict',
    }),
    appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    reason: text('reason').notNull(),
    status: text('status')
      .notNull()
      .default('pending')
      .$type<'pending' | 'approved' | 'rejected'>(),
    requestedBy: uuid('requested_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    decidedBy: uuid('decided_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
    submittedAt: time('submitted_at').notNull().defaultNow(),
    decidedAt: time('decided_at'),
  },
  (t) => [
    check('request_kind', sql`${t.kind} in ('subscribe','plan-change')`),
    check(
      'request_status',
      sql`${t.status} in ('pending','approved','rejected')`,
    ),
    check('request_name', sql`length(${t.name}) between 1 and 80`),
    check('request_reason', sql`length(${t.reason}) between 1 and 1000`),
    check('request_note', sql`length(${t.decisionNote}) <= 1000`),
    uniqueIndex('request_subscribe_pending_unique')
      .on(t.teamId, t.planId)
      .where(sql`${t.status} = 'pending' and ${t.kind} = 'subscribe'`),
    uniqueIndex('request_change_pending_unique')
      .on(t.appId)
      .where(sql`${t.status} = 'pending' and ${t.kind} = 'plan-change'`),
    index('request_queue_idx').on(t.status, t.submittedAt),
    index('request_team_idx').on(t.teamId, t.submittedAt.desc()),
  ],
);

export const usageDaily = pgTable(
  'usage_daily',
  {
    appId: uuid('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    serviceId: text('service_id').notNull().default(''),
    count2xx: bigint('count_2xx', { mode: 'number' }).notNull().default(0),
    count4xx: bigint('count_4xx', { mode: 'number' }).notNull().default(0),
    count5xx: bigint('count_5xx', { mode: 'number' }).notNull().default(0),
    countOther: bigint('count_other', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.appId, t.day, t.serviceId] }),
    index('usage_daily_day_idx').on(t.day),
  ],
);
export const developerFirstCalls = pgTable('developer_first_calls', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  firstCallAt: time('first_call_at').notNull(),
  appId: uuid('app_id').references(() => apps.id, { onDelete: 'set null' }),
  credentialId: uuid('credential_id'),
});
export const usageCollection = pgTable(
  'usage_collection',
  {
    id: smallint('id').primaryKey().default(1),
    tokenCiphertext: text('token_ciphertext').notNull(),
    configuredAt: time('configured_at'),
    lastReceivedAt: time('last_received_at'),
    lastHeartbeatAt: time('last_heartbeat_at'),
  },
  (t) => [check('usage_collection_singleton', sql`${t.id} = 1`)],
);
export const usageIngestBatches = pgTable(
  'usage_ingest_batches',
  {
    digest: text('digest').primaryKey(),
    receivedAt: time('received_at').notNull().defaultNow(),
  },
  (t) => [index('usage_ingest_received_idx').on(t.receivedAt)],
);
