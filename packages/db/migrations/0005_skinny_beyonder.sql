CREATE TABLE "venue_night_facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"night_date" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"had_booking" boolean DEFAULT false NOT NULL,
	"booking_id" text,
	"format" text,
	"budget_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_night_facts" ADD CONSTRAINT "venue_night_facts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_night_facts" ADD CONSTRAINT "venue_night_facts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vnf_venue_night_uq" ON "venue_night_facts" USING btree ("venue_id","night_date");