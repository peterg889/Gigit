import { db, schema } from "@gigit/db";
import { desc, eq, or } from "drizzle-orm";
import Link from "next/link";
import { performerOwnedBy, venueOwnedBy } from "@/lib/auth";
import { sessionUserId } from "@/lib/session";
import { ActionButton } from "@/components/ApiForm";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const userId = await sessionUserId();
  if (!userId)
    return (
      <div className="card">
        <Link href="/login">Sign in</Link> to see your bookings.
      </div>
    );
  const [performer, venue] = await Promise.all([
    performerOwnedBy(userId),
    venueOwnedBy(userId),
  ]);
  if (!performer && !venue)
    return (
      <div className="card">
        Create a <Link href="/me">profile</Link> first.
      </div>
    );

  const conditions = [];
  if (performer) conditions.push(eq(schema.bookings.performerId, performer.id));
  if (venue) conditions.push(eq(schema.bookings.venueId, venue.id));
  const rows = await db()
    .select({
      booking: schema.bookings,
      performerName: schema.performers.name,
      venueName: schema.venues.name,
    })
    .from(schema.bookings)
    .innerJoin(schema.performers, eq(schema.bookings.performerId, schema.performers.id))
    .innerJoin(schema.venues, eq(schema.bookings.venueId, schema.venues.id))
    .where(or(...conditions))
    .orderBy(desc(schema.bookings.createdAt));

  return (
    <div>
      <h1>Bookings</h1>
      {rows.length === 0 && (
        <div className="card">
          Nothing on the calendar yet. The <Link href="/">open slots</Link> are
          the place to fix that.
        </div>
      )}
      {rows.map(({ booking, performerName, venueName }) => {
        const mineAsPerformer = performer?.id === booking.performerId;
        const cancellable = ["confirmed"].includes(booking.state);
        return (
          <div className="card" key={booking.id}>
            <div>
              <Link href={`/bookings/${booking.id}`}>
                <strong>{performerName}</strong> at <strong>{venueName}</strong>
              </Link>{" "}
              <span className="badge">{booking.state}</span>
            </div>
            <div className="muted">
              {new Date(booking.terms.startsAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              })}{" "}
              ·{" "}
              <span className="money">
                ${(booking.terms.amountCents / 100).toFixed(0)}
              </span>
            </div>
            {mineAsPerformer && booking.state === "offered" && (
              <ActionButton
                endpoint={`/api/bookings/${booking.id}/accept`}
                label="Accept offer"
              />
            )}{" "}
            {cancellable && (
              <ActionButton
                endpoint={`/api/bookings/${booking.id}/cancel`}
                label="Cancel booking"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
