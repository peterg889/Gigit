CREATE TABLE "sms_sessions" (
	"phone" text PRIMARY KEY NOT NULL,
	"active_context" jsonb DEFAULT 'null'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sms_opted_out_at" timestamp with time zone;