CREATE TABLE "navigation_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"header" jsonb NOT NULL,
	"footer" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "navigation_settings_singleton" CHECK ("navigation_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"description" text,
	"seo_title" text,
	"og_image_url" text,
	"visibility" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "page_slug" CHECK (length("pages"."slug") between 2 and 64 and "pages"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "page_title" CHECK (length(btrim("pages"."title")) between 1 and 120),
	CONSTRAINT "page_body" CHECK (length("pages"."body") <= 100000),
	CONSTRAINT "page_visibility" CHECK ("pages"."visibility" in ('public','signed-in')),
	CONSTRAINT "page_status" CHECK ("pages"."status" in ('draft','published'))
);
--> statement-breakpoint
ALTER TABLE "navigation_settings" ADD CONSTRAINT "navigation_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_updated_idx" ON "pages" USING btree ("updated_at" DESC NULLS LAST);