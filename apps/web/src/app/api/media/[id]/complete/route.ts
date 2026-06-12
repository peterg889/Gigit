import { appendEvent, db, schema } from "@gigit/db";
import { eq } from "drizzle-orm";
import { AuthError, requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/respond";

type Params = { params: Promise<{ id: string }> };

/**
 * Flips processing → ready. The fraud-screen hook (F7.5) lands here in M3 —
 * the event below is the seam the screening task will consume.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const userId = await requireUser();
    const d = db();
    const [asset] = await d
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, id));
    if (!asset || asset.ownerUserId !== userId)
      return fail("not_found", "media not found", 404);
    if (asset.status !== "processing")
      return fail("conflict", `asset is ${asset.status}`, 409);

    await d
      .update(schema.mediaAssets)
      .set({ status: "ready" })
      .where(eq(schema.mediaAssets.id, id));
    await appendEvent(d, {
      actor: userId,
      kind: "media.ready",
      subjectType: "media",
      subjectId: id,
    });
    return ok({ id, status: "ready" });
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}
