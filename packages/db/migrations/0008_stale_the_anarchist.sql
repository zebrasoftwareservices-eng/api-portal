CREATE TABLE "developer_first_calls" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_call_at" timestamp with time zone NOT NULL,
	"app_id" uuid,
	"credential_id" uuid
);
--> statement-breakpoint
CREATE TABLE "usage_collection" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"token_ciphertext" text NOT NULL,
	"configured_at" timestamp with time zone,
	"last_received_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	CONSTRAINT "usage_collection_singleton" CHECK ("usage_collection"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"app_id" uuid NOT NULL,
	"day" date NOT NULL,
	"service_id" text DEFAULT '' NOT NULL,
	"count_2xx" bigint DEFAULT 0 NOT NULL,
	"count_4xx" bigint DEFAULT 0 NOT NULL,
	"count_5xx" bigint DEFAULT 0 NOT NULL,
	"count_other" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_app_id_day_service_id_pk" PRIMARY KEY("app_id","day","service_id")
);
--> statement-breakpoint
CREATE TABLE "usage_ingest_batches" (
	"digest" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "developer_first_calls" ADD CONSTRAINT "developer_first_calls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_first_calls" ADD CONSTRAINT "developer_first_calls_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_daily_day_idx" ON "usage_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "usage_ingest_received_idx" ON "usage_ingest_batches" USING btree ("received_at");--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE credentials SET created_by = apps.created_by FROM apps WHERE credentials.app_id = apps.id;
