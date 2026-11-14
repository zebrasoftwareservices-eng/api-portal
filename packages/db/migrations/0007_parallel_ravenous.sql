CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"team_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"from_plan_id" uuid,
	"app_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decision_note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "request_kind" CHECK ("access_requests"."kind" in ('subscribe','plan-change')),
	CONSTRAINT "request_status" CHECK ("access_requests"."status" in ('pending','approved','rejected')),
	CONSTRAINT "request_name" CHECK (length("access_requests"."name") between 1 and 80),
	CONSTRAINT "request_reason" CHECK (length("access_requests"."reason") between 1 and 1000),
	CONSTRAINT "request_note" CHECK (length("access_requests"."decision_note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "product_teams" (
	"product_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_teams_product_id_team_id_pk" PRIMARY KEY("product_id","team_id")
);
--> statement-breakpoint
DROP INDEX "app_team_name_unique";--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "origin" text DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "key_issued" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "revoke_reason" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "visibility" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_from_plan_id_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_teams" ADD CONSTRAINT "product_teams_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_teams" ADD CONSTRAINT "product_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "request_subscribe_pending_unique" ON "access_requests" USING btree ("team_id","plan_id") WHERE "access_requests"."status" = 'pending' and "access_requests"."kind" = 'subscribe';--> statement-breakpoint
CREATE UNIQUE INDEX "request_change_pending_unique" ON "access_requests" USING btree ("app_id") WHERE "access_requests"."status" = 'pending' and "access_requests"."kind" = 'plan-change';--> statement-breakpoint
CREATE INDEX "request_queue_idx" ON "access_requests" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "request_team_idx" ON "access_requests" USING btree ("team_id","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "app_revoke_pending_idx" ON "apps" USING btree ("status") WHERE "apps"."status" = 'revoke-pending';--> statement-breakpoint
CREATE UNIQUE INDEX "app_team_name_unique" ON "apps" USING btree ("team_id","name") WHERE "apps"."status" <> 'revoked';--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "app_status" CHECK ("apps"."status" in ('active','revoke-pending','revoked'));--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "app_origin" CHECK ("apps"."origin" in ('self','request','admin'));--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "app_revoke_reason" CHECK ("apps"."revoke_reason" in ('visibility','approval'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_visibility" CHECK ("products"."visibility" in ('open','hidden','internal','manual'));