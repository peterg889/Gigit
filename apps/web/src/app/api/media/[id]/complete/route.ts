import { appendEvent, db, schema } from "@gigit/db";
import { eq } from "drizzle-orm";
import { AuthError, requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/respond";

type Params = { params: Promise<{ id: string }> };

/**
 * Upload complete → screening requested. The worker sniffs, strips EXIF,
 * runs the fraud screen (F7.5), and only IT flips the asset to ready.
 * Nothing is public before screening (technical-design A10).
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

    await appendEvent(d, {
      actor: userId,
      kind: "media.screen_requested",
      subjectType: "media",
      subjectId: id,
    });
    return ok({ id, status: "processing" });
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}
