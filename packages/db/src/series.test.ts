import { newId } from "@gigit/domain";
import { and, eq, gt } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "./client.js";
import { createSeries, materializeSeries, cancelSeries, SERIES_HORIZON } from "./series.js";
import { slots, slotSeries, users, venues } from "./schema.js";

describe("slot series (integration)", () => {
  const userId = newId("user");
  const venueId = newId("venue");
  let seriesId: string;

  beforeAll(async () => {
    const d = db();
    await d.insert(users).values({ id: userId, email: `${userId}@t.test` });
    await d.insert(venues).values({
      id: venueId,
      ownerUserId: userId,
      kind: "brewery",
      name: "Series Test Taproom",
      metro: "testville",
      lat: 43,
      lng: -87.9,
      paInventory: { hasPA: true },
    });
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates a series and materializes the full horizon", async () => {
    seriesId = await createSeries({
      venueId,
      metro: "testville",
      actor: userId,
      pattern: { freq: "weekly", dayOfWeek: 5, startTimeUtc: "20:00", durationMinutes: 120 },
      defaults: { format: "music", genrePrefs: [], budgetCents: 40000, provides: { pa: true } },
    });
    const rows = await db()
      .select()
      .from(slots)
      .where(eq(slots.seriesId, seriesId));
    expect(rows).toHaveLength(SERIES_HORIZON);
    expect(rows.every((s) => s.status === "open")).toBe(true);
    expect(rows.every((s) => s.source === "series")).toBe(true);
    expect(rows.every((s) => s.budgetCents === 40000)).toBe(true);
    expect(rows.every((s) => s.startsAt.getUTCDay() === 5)).toBe(true);
  });

  it("re-materializing is idempotent", async () => {
    const created = await materializeSeries(seriesId, "worker");
    expect(created).toBe(0);
    const rows = await db().select().from(slots).where(eq(slots.seriesId, seriesId));
    expect(rows).toHaveLength(SERIES_HORIZON);
  });

  it("cancelling closes future open occurrences and stops materialization", async () => {
    const cancelled = await cancelSeries(seriesId, userId);
    expect(cancelled).toBe(SERIES_HORIZON);
    const stillOpen = await db()
      .select()
      .from(slots)
      .where(
        and(eq(slots.seriesId, seriesId), eq(slots.status, "open"), gt(slots.startsAt, new Date())),
      );
    expect(stillOpen).toHaveLength(0);
    const [s] = await db().select().from(slotSeries).where(eq(slotSeries.id, seriesId));
    expect(s.status).toBe("cancelled");
    expect(await materializeSeries(seriesId, "worker")).toBe(0);
  });
});
