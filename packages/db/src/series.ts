/**
 * Recurring slot series (PRD F2.2): create → materialize next N occurrences
 * as ordinary slots; a daily worker sweep keeps the horizon topped up as
 * occurrences pass. Cancelling a series cancels its future unfilled slots;
 * filled bookings are untouched (they're contracts).
 */
import { and, eq, gt, inArray } from "drizzle-orm";
import { newId, nextOccurrences } from "@gigit/domain";
import type { SeriesPattern } from "@gigit/domain";
import type { Db } from "./client.js";
import { db } from "./client.js";
import { appendEvent } from "./events.js";
import { slotSeries, slots } from "./schema.js";

export const SERIES_HORIZON = 4; // occurrences kept open ahead (spec lean: next-N)

export interface CreateSeriesInput {
  venueId: string;
  metro: string;
  actor: string;
  pattern: SeriesPattern;
  defaults: {
    format: string;
    genrePrefs: string[];
    budgetCents: number;
    provides: { pa?: boolean; meal?: boolean; parking?: boolean };
    notes?: string;
  };
}

export async function createSeries(input: CreateSeriesInput): Promise<string> {
  const id = newId("series");
  const d = db();
  await d.transaction(async (tx) => {
    await tx.insert(slotSeries).values({
      id,
      venueId: input.venueId,
      metro: input.metro,
      pattern: input.pattern,
      defaults: input.defaults,
    });
    await appendEvent(tx, {
      actor: input.actor,
      kind: "series.created",
      subjectType: "series",
      subjectId: id,
      payload: { pattern: input.pattern },
    });
  });
  await materializeSeries(id, input.actor);
  return id;
}

/** Top a series up to SERIES_HORIZON future open occurrences. Idempotent. */
export async function materializeSeries(seriesId: string, actor: string): Promise<number> {
  const d = db();
  const [series] = await d.select().from(slotSeries).where(eq(slotSeries.id, seriesId));
  if (!series || series.status !== "active") return 0;

  const occurrences = nextOccurrences(
    series.pattern as SeriesPattern,
    new Date(),
    SERIES_HORIZON,
  );
  let created = 0;
  for (const startsAt of occurrences) {
    const slotId = newId("slot");
    await d.transaction(async (tx) => {
      const inserted = await tx
        .insert(slots)
        .values({
          id: slotId,
          venueId: series.venueId,
          seriesId: series.id,
          metro: series.metro,
          startsAt,
          durationMinutes: series.pattern.durationMinutes,
          format: series.defaults.format,
          genrePrefs: series.defaults.genrePrefs,
          budgetCents: series.defaults.budgetCents,
          provides: series.defaults.provides,
          notes: series.defaults.notes ?? null,
          source: "series",
        })
        .onConflictDoNothing({
          target: [slots.seriesId, slots.startsAt],
        })
        .returning({ id: slots.id });
      if (inserted.length > 0) {
        created += 1;
        await appendEvent(tx, {
          actor,
          kind: "slot.created",
          subjectType: "slot",
          subjectId: slotId,
          payload: { seriesId: series.id, source: "series" },
        });
      }
    });
  }
  return created;
}

/** Daily sweep: keep every active series at full horizon. */
export async function materializeAllActiveSeries(actor = "worker"): Promise<number> {
  const d = db();
  const active = await d
    .select({ id: slotSeries.id })
    .from(slotSeries)
    .where(eq(slotSeries.status, "active"));
  let total = 0;
  for (const s of active) total += await materializeSeries(s.id, actor);
  return total;
}

/** Cancel the series and its future, unfilled, unbooked occurrences. */
export async function cancelSeries(seriesId: string, actor: string): Promise<number> {
  const d = db();
  let cancelled = 0;
  await d.transaction(async (tx) => {
    await tx
      .update(slotSeries)
      .set({ status: "cancelled" })
      .where(eq(slotSeries.id, seriesId));
    const open = await tx
      .select({ id: slots.id })
      .from(slots)
      .where(
        and(
          eq(slots.seriesId, seriesId),
          eq(slots.status, "open"),
          gt(slots.startsAt, new Date()),
        ),
      );
    if (open.length > 0) {
      await tx
        .update(slots)
        .set({ status: "cancelled" })
        .where(inArray(slots.id, open.map((s) => s.id)));
      cancelled = open.length;
    }
    await appendEvent(tx, {
      actor,
      kind: "series.cancelled",
      subjectType: "series",
      subjectId: seriesId,
      payload: { slotsCancelled: cancelled },
    });
  });
  return cancelled;
}

/** A venue's series with their next open occurrence, for the profile page. */
export async function seriesForVenue(d: Db, venueId: string) {
  return d
    .select()
    .from(slotSeries)
    .where(and(eq(slotSeries.venueId, venueId), eq(slotSeries.status, "active")));
}
