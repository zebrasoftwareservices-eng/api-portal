CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"personal_owner_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_personal_owner_id_unique" UNIQUE("personal_owner_id"),
	CONSTRAINT "team_name" CHECK (length(btrim("teams"."name")) between 1 and 80)
);
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id"),
	CONSTRAINT "team_member_role" CHECK ("team_members"."role" in ('admin','member','read-only'))
);
CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "team_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "team_invitation_role" CHECK ("team_invitations"."role" in ('admin','member','read-only'))
);
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_personal_owner_id_user_id_fk" FOREIGN KEY ("personal_owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitation_pending_unique" ON "team_invitations" USING btree ("team_id","email") WHERE "team_invitations"."accepted_at" is null and "team_invitations"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "team_member_current_idx" ON "team_members" USING btree ("user_id","selected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION pg_temp.uuidv7(ts timestamptz) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE b bytea;
BEGIN
 b := substring(int8send(floor(extract(epoch FROM ts)*1000)::bigint) FROM 3) || substring(uuid_send(gen_random_uuid()) FROM 7);
 b := set_byte(b,6,(get_byte(b,6) & 15) | 112);
 b := set_byte(b,8,(get_byte(b,8) & 63) | 128);
 RETURN encode(b,'hex')::uuid;
END $$;
INSERT INTO teams(id,name,personal_owner_id,created_by,created_at,updated_at)
 SELECT pg_temp.uuidv7(created_at),'Personal',id,id,created_at,created_at FROM "user";
INSERT INTO team_members(team_id,user_id,role,selected_at,created_at)
 SELECT id,personal_owner_id,'admin',created_at,created_at FROM teams;
ALTER TABLE apps ADD COLUMN team_id uuid CONSTRAINT apps_team_id_teams_id_fk REFERENCES teams(id) ON DELETE RESTRICT;
ALTER TABLE apps ADD COLUMN created_by uuid CONSTRAINT apps_created_by_user_id_fk REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE apps a SET team_id=t.id, created_by=a.owner_id FROM teams t WHERE t.personal_owner_id=a.owner_id;
ALTER TABLE apps ALTER COLUMN team_id SET NOT NULL;
DROP INDEX app_owner_name_unique;
ALTER TABLE apps DROP COLUMN owner_id;
CREATE UNIQUE INDEX app_team_name_unique ON apps(team_id,name);
ALTER TABLE rate_limit_hits DROP CONSTRAINT rate_bucket;
ALTER TABLE rate_limit_hits ADD CONSTRAINT rate_bucket CHECK (bucket IN ('sign-in-failure','password-reset','verification-email','team-invitation'));
