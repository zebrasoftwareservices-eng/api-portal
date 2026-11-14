CREATE TABLE "setup_tokens" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"token_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_token_singleton" CHECK ("setup_tokens"."id" = 1)
);
