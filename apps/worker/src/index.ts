/**
 * Gigit worker (engineering-spec §5 worker):
 *  1. Outbox dispatcher — polls `events` rows with dispatched_at IS NULL,
 *     interprets effects (notify, schedule, request_payment).
 *  2. pg-boss — booking timers (offer expiry, gig end, auto-confirm).
 *  3. Reconciler — re-derives missing timers from booking state every 10 min,
 *     so a killed worker loses nothing (M0 exit criterion 4).
 * No inbound surface; webhooks land at the web service.
 */
import {
  env,
  closeDb,
  getPool,
  runBookingTransition,
  paymentGateway,
  IllegalTransitionError,
  BookingNotFoundError,
} from "@gigit/db";
import type { BookingEvent, Effect } from "@gigit/domain";
import PgBoss from "pg-boss";
import { notifyBookingParties } from "./notify.js";

const TIMER_QUEUE = "booking-timers";
type TimerJob = {
  bookingId: string;
  fire: "OFFER_EXPIRED" | "GIG_ENDED" | "AUTO_CONFIRM_ELAPSED";
};

const jobToEvent: Record<
  "offer_expiry" | "gig_ended" | "auto_confirm",
  TimerJob["fire"]
> = {
  offer_expiry: "OFFER_EXPIRED",
  gig_ended: "GIG_ENDED",
  auto_confirm: "AUTO_CONFIRM_ELAPSED",
};

let stopping = false;

async function main() {
  const boss = new PgBoss(env().DATABASE_URL);
  boss.on("error", (err) => log("pgboss.error", { err: String(err) }));
  await boss.start();
  await boss.createQueue(TIMER_QUEUE);

  await boss.work<TimerJob>(TIMER_QUEUE, async ([job]) => {
    if (!job) return;
    await fireTimer(job.data);
  });

  void outboxLoop(boss);
  void reconcileLoop(boss);

  const shutdown = async () => {
    stopping = true;
    await boss.stop({ graceful: true });
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  log("worker.started", {});
}

/** Apply a timer event; stale timers (state moved on) are expected no-ops. */
async function fireTimer(data: TimerJob) {
  try {
    const r = await runBookingTransition(
      data.bookingId,
      { kind: data.fire } as BookingEvent,
      "worker",
    );
    log("timer.fired", { bookingId: data.bookingId, fire: data.fire, to: r.to });
  } catch (err) {
    if (err instanceof IllegalTransitionError || err instanceof BookingNotFoundError) {
      log("timer.stale", { bookingId: data.bookingId, fire: data.fire });
      return; // idempotent no-op
    }
    throw err;
  }
}

/** Outbox: claim a batch, interpret, mark dispatched — at-least-once. */
async function outboxLoop(boss: PgBoss) {
  const pool = getPool();
  while (!stopping) {
    try {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const { rows } = await client.query(
          `select id, actor, kind, subject_type, subject_id, payload
             from events
            where dispatched_at is null
            order by id
            limit 50
            for update skip locked`,
        );
        for (const row of rows) {
          await dispatchEvent(boss, row);
        }
        if (rows.length > 0) {
          await client.query(
            `update events set dispatched_at = now() where id = any($1::bigint[])`,
            [rows.map((r) => r.id)],
          );
        }
        await client.query("commit");
        if (rows.length === 0) await sleep(1000);
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      log("outbox.error", { err: String(err) });
      await sleep(5000);
    }
  }
}

async function dispatchEvent(
  boss: PgBoss,
  row: {
    id: string;
    actor: string;
    kind: string;
    subject_type: string;
    subject_id: string;
    payload: { effects?: Effect[] };
  },
) {
  const effects = row.payload?.effects ?? [];
  for (const fx of effects) {
    switch (fx.kind) {
      case "schedule": {
        await boss.send(
          TIMER_QUEUE,
          { bookingId: row.subject_id, fire: jobToEvent[fx.job] },
          {
            startAfter: new Date(fx.runAt),
            singletonKey: `${row.subject_id}:${fx.job}`,
            retryLimit: 5,
            retryBackoff: true,
          },
        );
        break;
      }
      case "cancel_schedule":
        // Timers are idempotent no-ops when stale; explicit cancellation unnecessary.
        break;
      case "request_payment": {
        const result = await paymentGateway().charge(row.subject_id);
        log("payment.charge", { booking: row.subject_id, ...result });
        if (result.status === "succeeded")
          await fireBookingEvent(row.subject_id, { kind: "PAYMENT_SUCCEEDED" });
        else if (result.status === "failed")
          await fireBookingEvent(row.subject_id, {
            kind: "PAYMENT_FAILED",
            reason: result.paymentRef,
          });
        // pending → the Stripe webhook (web service) delivers the outcome
        break;
      }
      case "notify":
        if (row.subject_type === "booking")
          await notifyBookingParties(row.subject_id, fx.template, fx.to);
        else if (row.actor.startsWith("usr_"))
          // non-booking notifications (messages, applications) reach the
          // counterparty via thread participants in M2; log for now
          log("notify", { to: fx.to, template: fx.template, subject: row.subject_id });
        break;
      case "release_funds":
        await paymentGateway().transfer(row.subject_id, fx.amountCents);
        log("payment.release", { booking: row.subject_id, amount: fx.amountCents });
        break;
      case "refund_funds":
        await paymentGateway().refund(row.subject_id, fx.amountCents);
        log("payment.refund", { booking: row.subject_id, amount: fx.amountCents });
        break;
      case "cancellation_fee":
        if (fx.feeCents > 0) await paymentGateway().transfer(row.subject_id, fx.feeCents);
        if (fx.refundCents > 0)
          await paymentGateway().refund(row.subject_id, fx.refundCents);
        log("payment.cancellation_fee", { booking: row.subject_id, ...fx });
        break;
      case "reopen_slot":
      case "reliability_strike":
        break; // already applied in-transaction by the transition runner
    }
  }
}

async function fireBookingEvent(bookingId: string, event: BookingEvent) {
  try {
    await runBookingTransition(bookingId, event, "worker");
  } catch (err) {
    if (err instanceof IllegalTransitionError) return;
    throw err;
  }
}

/** Re-arm timers derivable from state; safety net for lost jobs. */
async function reconcileLoop(boss: PgBoss) {
  const pool = getPool();
  while (!stopping) {
    try {
      const { rows } = await pool.query(
        `select id, state, offer_expires_at, terms from bookings
          where state in ('offered','confirmed','awaiting_confirmation')`,
      );
      const now = Date.now();
      for (const b of rows) {
        const endsAt = new Date(b.terms.endsAt).getTime();
        let due: TimerJob | undefined;
        if (b.state === "offered" && new Date(b.offer_expires_at).getTime() <= now)
          due = { bookingId: b.id, fire: "OFFER_EXPIRED" };
        else if (b.state === "confirmed" && endsAt <= now)
          due = { bookingId: b.id, fire: "GIG_ENDED" };
        else if (b.state === "awaiting_confirmation" && endsAt + 24 * 3_600_000 <= now)
          due = { bookingId: b.id, fire: "AUTO_CONFIRM_ELAPSED" };
        if (due) await fireTimer(due);
      }
    } catch (err) {
      log("reconcile.error", { err: String(err) });
    }
    await sleep(10 * 60 * 1000);
  }
  void boss; // boss reserved for future reconcile-time re-arming of far-future timers
}

function log(kind: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), kind, ...data }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
