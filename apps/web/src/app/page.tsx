import { db, schema } from "@gigit/db";
import { and, asc, eq, gte } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const rows = await db()
    .select({
      slot: schema.slots,
      venueName: schema.venues.name,
      venueKind: schema.venues.kind,
    })
    .from(schema.slots)
    .innerJoin(schema.venues, eq(schema.slots.venueId, schema.venues.id))
    .where(and(eq(schema.slots.status, "open"), gte(schema.slots.startsAt, new Date())))
    .orderBy(asc(schema.slots.startsAt))
    .limit(50);

  return (
    <div>
      <h1>Open slots</h1>
      <p className="muted">
        Venues post slots with the budget up front. Performers apply with one tap.
      </p>
      {rows.length === 0 && (
        <div className="card">
          No open slots yet. Venues: <Link href="/slots/new">post one</Link>.
        </div>
      )}
      {rows.map(({ slot, venueName, venueKind }) => (
        <div className="card" key={slot.id}>
          <div>
            <span className="badge">{slot.format}</span>{" "}
            <strong>
              <Link href={`/slots/${slot.id}`}>{venueName}</Link>
            </strong>{" "}
            <span className="muted">({venueKind.replace("_", " ")})</span>
          </div>
          <div>
            {slot.startsAt.toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            })}{" "}
            · {slot.durationMinutes} min ·{" "}
            <strong>${(slot.budgetCents / 100).toFixed(0)}</strong>
          </div>
          {slot.notes && <div className="muted">{slot.notes}</div>}
        </div>
      ))}
    </div>
  );
}
