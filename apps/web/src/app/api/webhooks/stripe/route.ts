import {
  IllegalTransitionError,
  constructStripeEvent,
  db,
  runBookingTransition,
  schema,
} from "@gigit/db";
import { fail, ok } from "@/lib/respond";

/**
 * Stripe webhook (engineering-spec K11: webhooks terminate at the web service).
 * Signature-verified, event-id idempotent; the only path from Stripe into the
 * state machine. Stale/duplicate deliveries are no-ops.
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail("bad_signature", "missing stripe-signature", 400);

  let event;
  try {
    event = constructStripeEvent(await req.text(), signature);
  } catch (err) {
    return fail("bad_signature", String(err), 400);
  }

  // idempotency: first INSERT wins, replays exit early
  const inserted = await db()
    .insert(schema.webhookEvents)
    .values({ id: event.id, provider: "stripe" })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (inserted.length === 0) return ok({ duplicate: true });

  if (
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const pi = event.data.object;
    const bookingId = pi.metadata?.bookingId;
    if (bookingId) {
      try {
        await runBookingTransition(
          bookingId,
          event.type === "payment_intent.succeeded"
            ? { kind: "PAYMENT_SUCCEEDED" }
            : { kind: "PAYMENT_FAILED", reason: pi.last_payment_error?.code },
          "stripe",
        );
      } catch (err) {
        if (!(err instanceof IllegalTransitionError)) throw err; // stale = fine
      }
    }
  }
  // unknown event types are logged via the webhook_events row, never dropped silently
  return ok({ received: true });
}
