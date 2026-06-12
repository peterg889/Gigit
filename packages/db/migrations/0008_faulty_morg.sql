CREATE TABLE "saved_searches" (
	"id" text PRIMARY KEY NOT NULL,
	"performer_id" text NOT NULL,
	"format" text,
	"metro" text,
	"min_budget_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_searches_performer_idx" ON "saved_searches" USING btree ("performer_id");