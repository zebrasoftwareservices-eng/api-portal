CREATE TABLE "gateway_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"app_id" uuid NOT NULL,
	"credential_id" uuid,
	"gateway_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_operation_kind" CHECK ("gateway_operations"."kind" in ('create-app','issue-credential','revoke-credential'))
);
--> statement-breakpoint
ALTER TABLE "api_versions" ALTER COLUMN "document" SET DATA TYPE json USING "document"::json;--> statement-breakpoint
ALTER TABLE "apis" ADD COLUMN "seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "apis" SET "seeded" = true WHERE "slug" = 'sample' AND "gateway_service_name" = 'portal-sample' AND "created_by" IS NULL;--> statement-breakpoint
ALTER TABLE "gateway_operations" ADD CONSTRAINT "gateway_operations_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gateway_operation_started_idx" ON "gateway_operations" USING btree ("started_at");