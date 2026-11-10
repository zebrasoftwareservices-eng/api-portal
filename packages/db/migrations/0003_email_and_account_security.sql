CREATE TABLE "account_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"require_verified_email" boolean DEFAULT false NOT NULL,
	"sign_in_failure_max" integer DEFAULT 10 NOT NULL,
	"sign_in_failure_window_minutes" integer DEFAULT 15 NOT NULL,
	"reset_email_max" integer DEFAULT 3 NOT NULL,
	"reset_email_window_minutes" integer DEFAULT 60 NOT NULL,
	"verification_email_max" integer DEFAULT 3 NOT NULL,
	"verification_email_window_minutes" integer DEFAULT 60 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_singleton" CHECK ("account_settings"."id" = 1),
	CONSTRAINT "account_max_0" CHECK ("account_settings"."sign_in_failure_max" between 1 and 1000),
	CONSTRAINT "account_max_1" CHECK ("account_settings"."reset_email_max" between 1 and 1000),
	CONSTRAINT "account_max_2" CHECK ("account_settings"."verification_email_max" between 1 and 1000),
	CONSTRAINT "account_window_0" CHECK ("account_settings"."sign_in_failure_window_minutes" between 1 and 1440),
	CONSTRAINT "account_window_1" CHECK ("account_settings"."reset_email_window_minutes" between 1 and 1440),
	CONSTRAINT "account_window_2" CHECK ("account_settings"."verification_email_window_minutes" between 1 and 1440)
);
--> statement-breakpoint
CREATE TABLE "email_change_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"new_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_change_requests_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "email_change_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mail_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"security" text NOT NULL,
	"username" text,
	"password_ciphertext" text,
	"sender_name" text NOT NULL,
	"sender_address" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_singleton" CHECK ("mail_settings"."id" = 1),
	CONSTRAINT "mail_port" CHECK ("mail_settings"."port" between 1 and 65535),
	CONSTRAINT "mail_security" CHECK ("mail_settings"."security" in ('none','starttls','tls'))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"subject_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_bucket" CHECK ("rate_limit_hits"."bucket" in ('sign-in-failure','password-reset','verification-email'))
);
--> statement-breakpoint
ALTER TABLE "api_versions" DROP CONSTRAINT "api_versions_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "apis" DROP CONSTRAINT "apis_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "email_change_requests" ADD CONSTRAINT "email_change_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_settings" ADD CONSTRAINT "mail_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limit_window_idx" ON "rate_limit_hits" USING btree ("bucket","subject_hash","created_at");--> statement-breakpoint
ALTER TABLE "api_versions" ADD CONSTRAINT "api_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apis" ADD CONSTRAINT "apis_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "account_settings" ("id") VALUES (1);
--> statement-breakpoint
UPDATE "user" SET "email_verified" = true;
