CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"booking_id" text,
	"entry_type" text NOT NULL,
	"debit_party" text NOT NULL,
	"credit_party" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_ref" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "agreement_template_ver" SET DEFAULT 'v1';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "performers" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_idem_uq" ON "ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_booking_idx" ON "ledger_entries" USING btree ("booking_id");