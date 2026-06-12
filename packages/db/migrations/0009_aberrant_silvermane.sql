CREATE TABLE "tech_subslot_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"subslot_id" text NOT NULL,
	"tech_id" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tech_subslots" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"payer" text NOT NULL,
	"budget_cents" integer NOT NULL,
	"needs" jsonb NOT NULL,
	"tech_id" text,
	"state" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tech_subslot_applications" ADD CONSTRAINT "tech_subslot_applications_subslot_id_tech_subslots_id_fk" FOREIGN KEY ("subslot_id") REFERENCES "public"."tech_subslots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_subslot_applications" ADD CONSTRAINT "tech_subslot_applications_tech_id_techs_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."techs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_subslots" ADD CONSTRAINT "tech_subslots_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_subslots" ADD CONSTRAINT "tech_subslots_tech_id_techs_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."techs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tech_subslot_app_uq" ON "tech_subslot_applications" USING btree ("subslot_id","tech_id");--> statement-breakpoint
CREATE INDEX "tech_subslots_booking_idx" ON "tech_subslots" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "tech_subslots_feed_idx" ON "tech_subslots" USING btree ("state");