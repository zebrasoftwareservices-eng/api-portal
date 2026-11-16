CREATE TABLE "theme_assets" (
	"kind" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_asset_kind" CHECK ("theme_assets"."kind" in ('logo','favicon')),
	CONSTRAINT "theme_asset_content_type" CHECK ("theme_assets"."content_type" in ('image/png','image/svg+xml','image/webp','image/x-icon')),
	CONSTRAINT "theme_asset_byte_size" CHECK ("theme_assets"."byte_size" between 1 and 524288)
);
--> statement-breakpoint
CREATE TABLE "theme_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"values" jsonb NOT NULL,
	"custom_css" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_settings_singleton" CHECK ("theme_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "theme_settings" ADD CONSTRAINT "theme_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;