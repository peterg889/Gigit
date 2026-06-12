import {
  decide,
  IllegalTransitionError,
  offerCreatedEffects,
  newId,
  type BookingEvent,
  type BookingSnapshot,
  type BookingTerms,
  type Effect,
} from "@gigit/domain";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./client.js";
import { appendEvent } from "./events.js";
import { recordLedgerEntry } from "./ledger.js";
import { applications, bookings, performers, slots } from "./schema.js";

export class BookingNotFoundError extends Error {
  readonly code = "booking_not_found";
}
export class ConcurrentUpdateError extends Error {
  readonly code = "concurrent_update";
}
export { IllegalTransitionError };

export interface TransitionResult {
  bookingId: string;
  from: string;
  to: string;
  effects: Effect[];
}

/**
 * The ONLY way booking state changes (engineering-spec §5).
 * One transaction: row lock → pure domain decision → versioned update →
 * in-tx side effects (slot status, reliability strikes) → outbox event.
 * External effects (notify/schedule/payment) ride in the event payload
 * for the worker to interpret.
 */
export async function runBookingTransition(
  bookingId: string,
  event: BookingEvent,
  actor: string,
  now: Date = new Date(),
): Promise<TransitionResult> {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .for("update");
    if (!row) throw new BookingNotFoundError(bookingId);

    const snapshot: BookingSnapshot = {
      id: row.id,
      slotId: row.slotId,
      performerId: row.performerId,
      state: row.state as BookingSnapshot["state"],
      version: row.version,
      terms: row.terms as BookingTerms,
      offerExpiresAt: row.offerExpiresAt.toISOString(),
    };

    const decision = decide(snapshot, event, now); // throws IllegalTransitionError

    const updated = await tx
      .update(bookings)
      .set({
        state: decision.next,
        version: row.version + 1,
        ...(event.kind === "PERFORMER_ACCEPTED" ? { performerAcceptedAt: now } : {}),
      })
      .where(and(eq(bookings.id, bookingId), eq(bookings.version, row.version)))
      .returning({ id: bookings.id });
    if (updated.length === 0) throw new ConcurrentUpdateError(bookingId);

    // Money intents are ledgered atomically with the transition (K3/K5).
    const venueParty = `venue:${row.venueId}`;
    const performerParty = `performer:${row.performerId}`;
    if (event.kind === "PAYMENT_SUCCEEDED") {
      await recordLedgerEntry(tx, {
        bookingId,
        entryType: "charge",
        debitParty: venueParty,
        creditParty: "platform",
        amountCents: snapshot.terms.amountCents,
        ...(row.paymentRef ? { paymentRef: row.paymentRef } : {}),
      });
    }

    // In-transaction side effects the db layer owns:
    for (const fx of decision.effects) {
      if (fx.kind === "release_funds") {
        await recordLedgerEntry(tx, {
          bookingId,
          entryType: "release",
          debitParty: "platform",
          creditParty: performerParty,
          amountCents: fx.amountCents,
        });
      }
      if (fx.kind === "refund_funds") {
        await recordLedgerEntry(tx, {
          bookingId,
          entryType: "refund",
          debitParty: "platform",
          creditParty: venueParty,
          amountCents: fx.amountCents,
        });
      }
      if (fx.kind === "cancellation_fee") {
        await recordLedgerEntry(tx, {
          bookingId,
          entryType: "fee",
          debitParty: "platform",
          creditParty: performerParty,
          amountCents: fx.feeCents,
        });
        await recordLedgerEntry(tx, {
          bookingId,
          entryType: "refund",
          debitParty: "platform",
          creditParty: venueParty,
          amountCents: fx.refundCents,
        });
      }
      if (fx.kind === "reopen_slot") {
        await tx
          .update(slots)
          .set({ status: "open" })
          .where(eq(slots.id, row.slotId));
      }
      if (fx.kind === "reliability_strike") {
        await tx
          .update(performers)
          .set({
            reliabilityStrikes: sql`${performers.reliabilityStrikes} + 1`,
          })
          .where(eq(performers.id, row.performerId));
      }
    }
    // Entering `confirmed` fills the slot and declines the other applicants.
    if (decision.next === "confirmed") {
      await tx
        .update(slots)
        .set({ status: "filled" })
        .where(eq(slots.id, row.slotId));
      await tx
        .update(applications)
        .set({ status: "declined" })
        .where(
          and(
            eq(applications.slotId, row.slotId),
            ne(applications.performerId, row.performerId),
            eq(applications.status, "submitted"),
          ),
        );
    }

    await appendEvent(tx, {
      actor,
      kind: "booking.transition",
      subjectType: "booking",
      subjectId: bookingId,
      payload: {
        event: event.kind,
        from: snapshot.state,
        to: decision.next,
        effects: decision.effects,
      },
    });

    return {
      bookingId,
      from: snapshot.state,
      to: decision.next,
      effects: decision.effects,
    };
  });
}

export interface CreateOfferInput {
  applicationId: string;
  slotId: string;
  performerId: string;
  venueId: string;
  terms: BookingTerms;
  actor: string;
  offerTtlHours?: number;
}

/** Creates the booking row in `offered` + marks the application, atomically. */
export async function createOffer(input: CreateOfferInput): Promise<string> {
  const bookingId = newId("booking");
  const offerExpiresAt = new Date(
    Date.now() + (input.offerTtlHours ?? 72) * 3_600_000,
  );
  await db().transaction(async (tx) => {
    await tx.insert(bookings).values({
      id: bookingId,
      slotId: input.slotId,
      performerId: input.performerId,
      venueId: input.venueId,
      state: "offered",
      terms: input.terms,
      offerExpiresAt,
      venueAcceptedAt: new Date(),
    });
    await tx
      .update(applications)
      .set({ status: "offered" })
      .where(eq(applications.id, input.applicationId));
    await appendEvent(tx, {
      actor: input.actor,
      kind: "booking.offered",
      subjectType: "booking",
      subjectId: bookingId,
      payload: {
        slotId: input.slotId,
        performerId: input.performerId,
        terms: { ...input.terms },
        effects: offerCreatedEffects(offerExpiresAt.toISOString()),
      },
    });
  });
  return bookingId;
}
