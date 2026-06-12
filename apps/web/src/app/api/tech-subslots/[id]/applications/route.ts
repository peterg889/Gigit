import { newId } from "@gigit/domain";
import { appendEvent, db, schema } from "@gigit/db";
import { eq } from "drizzle-orm";
import { AuthError, requireUser, techOwnedBy } from "@/lib/auth";
import { fail, ok } from "@/lib/respond";

type Params = { params: Promise<{ id: string }> };

/** Tech one-tap apply — applying to a posted budget is agreeing to it. */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id: subslotId } = await params;
    const userId = await requireUser();
    const tech = await techOwnedBy(userId);
    if (!tech) return fail("forbidden", "tech profile required", 403);

    const [subslot] = await db()
      .select()
      .from(schema.techSubslots)
      .where(eq(schema.techSubslots.id, subslotId));
    if (!subslot) return fail("not_found", "sub-slot not found", 404);
    if (subslot.state !== "open") return fail("conflict", "sub-slot is not open", 409);

    const note = (await req.json().catch(() => ({})))?.note;
    const id = newId("application");
    const d = db();
    await d
      .insert(schema.techSubslotApplications)
      .values({ id, subslotId, techId: tech.id, note: typeof note === "string" ? note.slice(0, 1000) : null })
      .onConflictDoNothing();
    await appendEvent(d, {
      actor: userId,
      kind: "subslot.application",
      subjectType: "tech_subslot",
      subjectId: subslotId,
      payload: { techId: tech.id, effects: [{ kind: "notify", template: "new_application", to: "payer" }] },
    });
    return ok({ id }, 201);
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}
