CREATE TABLE "try_it_traces" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"api_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"root_span_id" text,
	"request" jsonb,
	"spans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "try_it_traces_trace_id" CHECK ("try_it_traces"."trace_id" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
ALTER TABLE "try_it_traces" ADD CONSTRAINT "try_it_traces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "try_it_traces" ADD CONSTRAINT "try_it_traces_api_id_apis_id_fk" FOREIGN KEY ("api_id") REFERENCES "public"."apis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "try_it_traces_trace_id_unique" ON "try_it_traces" USING btree ("trace_id");