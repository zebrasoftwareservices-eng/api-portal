CREATE TABLE "api_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"api_id" uuid NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"document" jsonb NOT NULL,
	"source_url" text,
	"source_content" text,
	"source_format" text,
	"release_note" text,
	"change_summary" jsonb,
	"lint_warnings" jsonb,
	"created_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_version_source_format" CHECK ("api_versions"."source_format" in ('json', 'yaml'))
);
--> statement-breakpoint
ALTER TABLE "apis" ADD COLUMN "latest_version_id" uuid;--> statement-breakpoint
ALTER TABLE "api_versions" ADD CONSTRAINT "api_versions_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_versions" ADD CONSTRAINT "api_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_version_unique" ON "api_versions" USING btree ("api_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "api_version_id_unique" ON "api_versions" USING btree ("api_id","id");--> statement-breakpoint
-- Backfill before dropping the original document columns. Drizzle runs this migration
-- in the same transaction as the DDL, preserving API and subscription identities.
INSERT INTO api_versions (id, api_id, version, title, description, document, source_url, created_by, published_at)
SELECT id, id, version, title, description, document, source_url, created_by, published_at FROM apis;
--> statement-breakpoint
UPDATE apis SET latest_version_id = id;
--> statement-breakpoint
ALTER TABLE "apis" ADD CONSTRAINT "api_latest_version_fk" FOREIGN KEY ("id","latest_version_id") REFERENCES "public"."api_versions"("api_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apis" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "apis" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "apis" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "apis" DROP COLUMN "document";--> statement-breakpoint
ALTER TABLE "apis" DROP COLUMN "source_url";
