CREATE TABLE "fraud_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"kind" text NOT NULL,
	"confidence" integer NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fraud_flags_state_idx" ON "fraud_flags" USING btree ("state");--> statement-breakpoint
CREATE INDEX "fraud_flags_subject_idx" ON "fraud_flags" USING btree ("subject_type","subject_id");