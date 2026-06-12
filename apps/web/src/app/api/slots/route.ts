import { newId, slotCreateSchema } from "@gigit/domain";
import { appendEvent, db, schema } from "@gigit/db";
import { and, asc, eq, gte } from "drizzle-orm";
import { AuthError, requireUser, venueOwnedBy } from "@/lib/auth";
import { fail, ok, parseBody } from "@/lib/respond";

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const venue = await venueOwnedBy(userId);
    if (!venue) return fail("forbidden", "create a venue profile first", 403);
    const parsed = await parseBody(req, slotCreateSchema);
    if ("response" in parsed) return parsed.response;
    const id = newId("slot");
    const d = db();
    await d.insert(schema.slots).values({
      id,
      venueId: venue.id,
      metro: venue.metro,
      startsAt: new Date(parsed.data.startsAt),
      durationMinutes: parsed.data.durationMinutes,
      format: parsed.data.format,
      genrePrefs: parsed.data.genrePrefs,
      budgetCents: parsed.data.budgetCents,
      provides: parsed.data.provides,
      notes: parsed.data.notes ?? null,
      status: "open",
      source: "web",
    });
    await appendEvent(d, {
      actor: userId,
      kind: "slot.created",
      subjectType: "slot",
      subjectId: id,
      payload: { venueId: venue.id, budgetCents: parsed.data.budgetCents },
    });
    return ok({ id }, 201);
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}

/** Open-slot feed. M0 filters: format, metro, date floor. Geo radius arrives with PostGIS (M1). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const metro = url.searchParams.get("metro");
  const conditions = [
    eq(schema.slots.status, "open"),
    gte(schema.slots.startsAt, new Date()),
  ];
  if (format) conditions.push(eq(schema.slots.format, format));
  if (metro) conditions.push(eq(schema.slots.metro, metro));

  const rows = await db()
    .select({
      slot: schema.slots,
      venueName: schema.venues.name,
      venueKind: schema.venues.kind,
    })
    .from(schema.slots)
    .innerJoin(schema.venues, eq(schema.slots.venueId, schema.venues.id))
    .where(and(...conditions))
    .orderBy(asc(schema.slots.startsAt))
    .limit(100);
  return ok({ slots: rows });
}
