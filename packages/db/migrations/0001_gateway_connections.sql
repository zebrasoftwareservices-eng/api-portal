ALTER TABLE "credentials" DROP CONSTRAINT "credentials_gateway_id_gateways_id_fk";
--> statement-breakpoint
ALTER TABLE "gateway_consumers" DROP CONSTRAINT "gateway_consumers_gateway_id_gateways_id_fk";
--> statement-breakpoint
ALTER TABLE "credentials" ALTER COLUMN "gateway_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gateways" ADD COLUMN "managed_by" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "gateways" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_consumers" ADD CONSTRAINT "gateway_consumers_gateway_id_gateways_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateways"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_singleton" ON "gateways" USING btree ((1));--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credential_active_has_gateway" CHECK ("credentials"."status" <> 'active' or "credentials"."gateway_id" is not null);--> statement-breakpoint
ALTER TABLE "gateways" ADD CONSTRAINT "gateway_managed_by_check" CHECK ("gateways"."managed_by" in ('admin','env'));