CREATE TABLE "plan_apis" (
	"plan_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"api_id" uuid NOT NULL,
	CONSTRAINT "plan_apis_plan_id_api_id_pk" PRIMARY KEY("plan_id","api_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"rate_limit" integer,
	"rate_limit_unit" text,
	"monthly_quota" integer,
	"builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_builtin_product" CHECK ("plans"."builtin" = ("plans"."product_id" is null)),
	CONSTRAINT "plan_limits" CHECK (("plans"."builtin" and "plans"."rate_limit" is null and "plans"."rate_limit_unit" is null and "plans"."monthly_quota" is null) or (not "plans"."builtin" and "plans"."rate_limit" is not null and "plans"."rate_limit_unit" is not null and "plans"."monthly_quota" is not null and "plans"."rate_limit" > 0 and "plans"."rate_limit_unit" in ('second','minute') and "plans"."monthly_quota" >= "plans"."rate_limit"))
);
--> statement-breakpoint
CREATE TABLE "product_apis" (
	"product_id" uuid NOT NULL,
	"api_id" uuid NOT NULL,
	CONSTRAINT "product_apis_product_id_api_id_pk" PRIMARY KEY("product_id","api_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_name" CHECK (length(btrim("products"."name")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "plan_id" uuid;
--> statement-breakpoint
INSERT INTO "plans" (id,name,builtin) VALUES ('01937a00-0000-7000-8000-000000000009','Unlimited',true);
--> statement-breakpoint
UPDATE "apps" SET "plan_id" = '01937a00-0000-7000-8000-000000000009';
--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "plan_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "plan_id" SET DEFAULT '01937a00-0000-7000-8000-000000000009';--> statement-breakpoint
CREATE UNIQUE INDEX "plan_id_product_unique" ON "plans" USING btree ("id","product_id");--> statement-breakpoint
ALTER TABLE "plan_apis" ADD CONSTRAINT "plan_apis_plan_id_product_id_plans_id_product_id_fk" FOREIGN KEY ("plan_id","product_id") REFERENCES "public"."plans"("id","product_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_apis" ADD CONSTRAINT "plan_apis_product_id_api_id_product_apis_product_id_api_id_fk" FOREIGN KEY ("product_id","api_id") REFERENCES "public"."product_apis"("product_id","api_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_apis" ADD CONSTRAINT "product_apis_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_apis" ADD CONSTRAINT "product_apis_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_product_name_unique" ON "plans" USING btree ("product_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_builtin_unique" ON "plans" USING btree ("builtin") WHERE "plans"."builtin";--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_plan_idx" ON "apps" USING btree ("plan_id");