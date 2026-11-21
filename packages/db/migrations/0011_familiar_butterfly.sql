CREATE TABLE "trace_latest" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"api_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"root_span_id" text NOT NULL,
	"request" jsonb,
	"spans" jsonb NOT NULL,
	CONSTRAINT "trace_latest_id" CHECK ("trace_latest"."trace_id" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "tracing_selections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"api_id" uuid,
	"user_id" uuid,
	"team_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracing_selection_kind" CHECK ("tracing_selections"."kind" in ('api','developer','team')),
	CONSTRAINT "tracing_selection_target" CHECK (("tracing_selections"."kind" = 'api' and "tracing_selections"."api_id" is not null and "tracing_selections"."user_id" is null and "tracing_selections"."team_id" is null) or ("tracing_selections"."kind" = 'developer' and "tracing_selections"."api_id" is null and "tracing_selections"."user_id" is not null and "tracing_selections"."team_id" is null) or ("tracing_selections"."kind" = 'team' and "tracing_selections"."api_id" is null and "tracing_selections"."user_id" is null and "tracing_selections"."team_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "tracing_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"trace_endpoint" text NOT NULL,
	"instrumentations" text[] NOT NULL,
	"sampling_rate" real NOT NULL,
	"token_ciphertext" text NOT NULL,
	"configured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_test_passed" boolean,
	"last_test_cause" text,
	"last_test_at" timestamp with time zone,
	"probe_nonce" text,
	"probe_received_at" timestamp with time zone,
	"apply_status" text DEFAULT 'pending' NOT NULL,
	"apply_message" text,
	"applied_at" timestamp with time zone,
	CONSTRAINT "tracing_settings_singleton" CHECK ("tracing_settings"."id" = 1),
	CONSTRAINT "tracing_settings_sampling_rate" CHECK ("tracing_settings"."sampling_rate" >= 0 and "tracing_settings"."sampling_rate" <= 1),
	CONSTRAINT "tracing_settings_apply_status" CHECK ("tracing_settings"."apply_status" in ('pending','applied','failed'))
);
--> statement-breakpoint
ALTER TABLE "trace_latest" ADD CONSTRAINT "trace_latest_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracing_selections" ADD CONSTRAINT "tracing_selections_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracing_selections" ADD CONSTRAINT "tracing_selections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracing_selections" ADD CONSTRAINT "tracing_selections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracing_selections" ADD CONSTRAINT "tracing_selections_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracing_selection_api_unique" ON "tracing_selections" USING btree ("api_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracing_selection_user_unique" ON "tracing_selections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracing_selection_team_unique" ON "tracing_selections" USING btree ("team_id");