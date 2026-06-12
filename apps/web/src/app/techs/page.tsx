import { db, schema } from "@gigit/db";
import { asc } from "drizzle-orm";
import { performerOwnedBy, venueOwnedBy } from "@/lib/auth";
import { sessionUserId } from "@/lib/session";
import { ApiForm } from "@/components/ApiForm";

export const dynamic = "force-dynamic";

const GEAR_LABEL: Record<string, string> = {
  none: "labor only",
  partial: "partial rig",
  full_rig: "full PA rig",
};

/** Sound tech directory — venues and performers can hire sound (PRD F6). */
export default async function TechsPage() {
  const techs = await db()
    .select()
    .from(schema.techs)
    .orderBy(asc(schema.techs.createdAt))
    .limit(100);

  const userId = await sessionUserId();
  const canInvite = userId
    ? !!(await venueOwnedBy(userId)) || !!(await performerOwnedBy(userId))
    : false;

  return (
    <div>
      <h1>Sound techs</h1>
      <p className="muted">
        Live engineers — with or without their own rig. Venues and performers
        can message them directly to cover a gig.
      </p>
      {techs.length === 0 && <div className="card">No techs yet.</div>}
      {techs.map((t) => (
        <div className="card" key={t.id}>
          <strong>{t.name}</strong> <span className="badge">{GEAR_LABEL[t.gear]}</span>
          <p className="muted">{t.bio}</p>
          <p className="muted">
            {t.rateLaborCents != null && (
              <>labor ${(t.rateLaborCents / 100).toFixed(0)}</>
            )}
            {t.rateWithRigCents != null && (
              <> · with rig ${(t.rateWithRigCents / 100).toFixed(0)}</>
            )}{" "}
            · travels {t.travelRadiusKm} km
          </p>
          {canInvite && (
            <ApiForm
              endpoint="/api/threads"
              submitLabel="Message"
              redirectTo="/inbox"
              fields={[
                { name: "body", label: `Message ${t.name}`, type: "textarea", required: true },
              ]}
              extra={{ techId: t.id }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
