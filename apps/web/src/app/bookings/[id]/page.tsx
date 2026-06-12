import { TERMINAL_STATES, renderAgreement } from "@gigit/domain";
import type { BookingState } from "@gigit/domain";
import { db, schema } from "@gigit/db";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { performerOwnedBy, venueOwnedBy } from "@/lib/auth";
import { sessionUserId } from "@/lib/session";
import { ActionButton, ApiForm } from "@/components/ApiForm";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (!userId)
    return (
      <div className="card">
        <Link href="/login">Sign in</Link> first.
      </div>
    );
  const d = db();
  const [row] = await d
    .select({
      booking: schema.bookings,
      venueName: schema.venues.name,
      performerName: schema.performers.name,
    })
    .from(schema.bookings)
    .innerJoin(schema.venues, eq(schema.bookings.venueId, schema.venues.id))
    .innerJoin(schema.performers, eq(schema.bookings.performerId, schema.performers.id))
    .where(eq(schema.bookings.id, id));
  if (!row) notFound();
  const b = row.booking;

  const [performer, venue] = await Promise.all([
    performerOwnedBy(userId),
    venueOwnedBy(userId),
  ]);
  const asPerformer = performer?.id === b.performerId;
  const asVenue = venue?.id === b.venueId;
  if (!asPerformer && !asVenue) notFound();

  const state = b.state as BookingState;
  const terminal = TERMINAL_STATES.has(state);
  const myRole = asVenue ? "venue" : "performer";
  const [myReview] = await d
    .select()
    .from(schema.reviews)
    .where(
      and(eq(schema.reviews.bookingId, id), eq(schema.reviews.authorRole, myRole)),
    );

  return (
    <div>
      <div className="card">
        <h1>
          {row.performerName} at {row.venueName} <span className="badge">{state}</span>
        </h1>
        <p>
          {new Date(b.terms.startsAt).toLocaleString("en-US", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: "UTC",
          })}{" "}
          · <strong>${(b.terms.amountCents / 100).toFixed(0)}</strong>
        </p>
        <p>
          {state === "offered" && asPerformer && (
            <ActionButton endpoint={`/api/bookings/${id}/accept`} label="Accept offer" />
          )}{" "}
          {state === "confirmed" && (
            <ActionButton endpoint={`/api/bookings/${id}/cancel`} label="Cancel booking" />
          )}{" "}
          {state === "awaiting_confirmation" && asPerformer && (
            <ActionButton
              endpoint={`/api/bookings/${id}/mark-played`}
              label="We played 🎉"
            />
          )}{" "}
          {state === "awaiting_confirmation" && asVenue && (
            <span className="muted">
              Payment auto-releases 24h after gig end unless you open a dispute.
            </span>
          )}
        </p>
        {state === "awaiting_confirmation" && (
          <ApiForm
            endpoint={`/api/bookings/${id}/dispute`}
            submitLabel="Open dispute"
            fields={[
              { name: "reason", label: "What went wrong?", type: "textarea", required: true },
            ]}
          />
        )}
      </div>

      {terminal && !myReview && (
        <div className="card">
          <h2>Leave a review</h2>
          <p className="muted">
            Double-blind: visible once both sides review, or after 7 days.
          </p>
          <ApiForm
            endpoint={`/api/bookings/${id}/review`}
            submitLabel="Submit review"
            transform="ratingsOverall"
            fields={[
              { name: "overall", label: "Overall (1–5)", type: "number", required: true },
              { name: "body", label: "Comments", type: "textarea" },
            ]}
          />
        </div>
      )}
      {myReview && (
        <div className="card muted">You reviewed this booking (★ {myReview.ratings.overall}).</div>
      )}

      <div className="card">
        <h2>Performance agreement</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
          {renderAgreement({
            venueName: row.venueName,
            performerName: row.performerName,
            terms: b.terms,
          })}
        </pre>
        <p className="muted">
          Venue accepted {b.venueAcceptedAt?.toISOString() ?? "—"} · performer accepted{" "}
          {b.performerAcceptedAt?.toISOString() ?? "—"} · template {b.agreementTemplateVer}
        </p>
      </div>
    </div>
  );
}
