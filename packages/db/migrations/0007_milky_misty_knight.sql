CREATE TABLE "slot_series" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"metro" text NOT NULL,
	"pattern" jsonb NOT NULL,
	"defaults" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "slot_series" ADD CONSTRAINT "slot_series_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_series_id_slot_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."slot_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slots_series_occurrence_uq" ON "slots" USING btree ("series_id","starts_at");