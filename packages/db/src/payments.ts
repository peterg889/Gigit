/**
 * Payment gateway (engineering-spec K3): Stripe Connect Express, destination
 * charges held in platform balance, transfers on release. The Null gateway
 * (no STRIPE_SECRET_KEY configured) auto-succeeds so the full state machine
 * runs in dev and M0-style environments.
 *
 * The gateway is called by the WORKER (charge/transfer/refund execution) and
 * by the WEB webhook route (signature verification). State transitions remain
 * the transition runner's job — the gateway never mutates bookings directly.
 */
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { env } from "./env.js";
import { bookings, performers, venues } from "./schema.js";

export interface ChargeResult {
  status: "succeeded" | "pending" | "failed";
  paymentRef: string;
}

export interface PaymentGateway {
  readonly name: "null" | "stripe";
  /** Charge the venue for a booking. Pending = webhook will deliver the outcome. */
  charge(bookingId: string): Promise<ChargeResult>;
  /** Transfer released funds to the performer's connected account. */
  transfer(bookingId: string, amountCents: number): Promise<void>;
  /** Refund (part of) the original charge to the venue. */
  refund(bookingId: string, amountCents: number): Promise<void>;
  /** Create/refresh a Connect Express onboarding link for a performer. */
  connectOnboardingLink(performerId: string, returnUrl: string): Promise<string | null>;
}

class NullGateway implements PaymentGateway {
  readonly name = "null" as const;
  async charge(bookingId: string): Promise<ChargeResult> {
    const ref = `null_pi_${bookingId}`;
    await db()
      .update(bookings)
      .set({ paymentRef: ref })
      .where(eq(bookings.id, bookingId));
    return { status: "succeeded", paymentRef: ref };
  }
  async transfer(): Promise<void> {}
  async refund(): Promise<void> {}
  async connectOnboardingLink(): Promise<string | null> {
    return null;
  }
}

class StripeGateway implements PaymentGateway {
  readonly name = "stripe" as const;
  private stripe: Stripe;
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async charge(bookingId: string): Promise<ChargeResult> {
    const d = db();
    const [row] = await d
      .select({ booking: bookings, venue: venues })
      .from(bookings)
      .innerJoin(venues, eq(bookings.venueId, venues.id))
      .where(eq(bookings.id, bookingId));
    if (!row) throw new Error(`booking ${bookingId} not found`);
    if (!row.venue.stripeCustomerId)
      return { status: "failed", paymentRef: "no_payment_method" };

    const pi = await this.stripe.paymentIntents.create(
      {
        amount: row.booking.terms.amountCents,
        currency: "usd",
        customer: row.venue.stripeCustomerId,
        off_session: true,
        confirm: true,
        transfer_group: bookingId,
        metadata: { bookingId },
      },
      { idempotencyKey: `charge:${bookingId}` },
    );
    await d
      .update(bookings)
      .set({ paymentRef: pi.id })
      .where(eq(bookings.id, bookingId));
    // Outcome arrives via webhook (payment_intent.succeeded / .payment_failed);
    // synchronous success is reported as pending and confirmed by the webhook
    // so there is exactly one path into the state machine.
    return { status: "pending", paymentRef: pi.id };
  }

  async transfer(bookingId: string, amountCents: number): Promise<void> {
    const d = db();
    const [row] = await d
      .select({ booking: bookings, performer: performers })
      .from(bookings)
      .innerJoin(performers, eq(bookings.performerId, performers.id))
      .where(eq(bookings.id, bookingId));
    if (!row?.performer.stripeAccountId)
      throw new Error(`performer for ${bookingId} has no connected account`);
    await this.stripe.transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination: row.performer.stripeAccountId,
        transfer_group: bookingId,
        metadata: { bookingId },
      },
      { idempotencyKey: `transfer:${bookingId}:${amountCents}` },
    );
  }

  async refund(bookingId: string, amountCents: number): Promise<void> {
    const [row] = await db()
      .select({ paymentRef: bookings.paymentRef })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    if (!row?.paymentRef) throw new Error(`booking ${bookingId} has no charge`);
    await this.stripe.refunds.create(
      { payment_intent: row.paymentRef, amount: amountCents },
      { idempotencyKey: `refund:${bookingId}:${amountCents}` },
    );
  }

  async connectOnboardingLink(
    performerId: string,
    returnUrl: string,
  ): Promise<string | null> {
    const d = db();
    const [p] = await d
      .select()
      .from(performers)
      .where(eq(performers.id, performerId));
    if (!p) return null;
    let accountId = p.stripeAccountId;
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: "express",
        metadata: { performerId },
      });
      accountId = account.id;
      await d
        .update(performers)
        .set({ stripeAccountId: accountId })
        .where(eq(performers.id, performerId));
    }
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: returnUrl,
      return_url: returnUrl,
    });
    return link.url;
  }
}

let gateway: PaymentGateway | undefined;

export function paymentGateway(): PaymentGateway {
  if (!gateway) {
    const key = env().STRIPE_SECRET_KEY;
    gateway = key ? new StripeGateway(key) : new NullGateway();
  }
  return gateway;
}

/** Webhook signature verification (web route uses this). */
export function constructStripeEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const key = env().STRIPE_SECRET_KEY;
  const whSecret = env().STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) throw new Error("stripe is not configured");
  return new Stripe(key).webhooks.constructEvent(payload, signature, whSecret);
}
