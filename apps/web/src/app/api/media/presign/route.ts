import { newId } from "@gigit/domain";
import { appendEvent, db, schema } from "@gigit/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AuthError, performerOwnedBy, requireUser, techOwnedBy, venueOwnedBy } from "@/lib/auth";
import { fail, ok, parseBody } from "@/lib/respond";
import {
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  PER_PROFILE_IMAGE_QUOTA,
  uploadTargetFor,
} from "@/lib/storage";

const presignSchema = z.object({
  subjectType: z.enum(["performer", "venue", "tech"]),
  contentType: z.string(),
  bytes: z.number().int().min(1),
});

/** Image upload grant (m0-technical-spec §3): quota-checked, type/size constrained. */
export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const parsed = await parseBody(req, presignSchema);
    if ("response" in parsed) return parsed.response;
    const { subjectType, contentType, bytes } = parsed.data;

    if (!IMAGE_TYPES.includes(contentType))
      return fail("unsupported_type", `allowed: ${IMAGE_TYPES.join(", ")}`, 422);
    if (bytes > IMAGE_MAX_BYTES)
      return fail("too_large", `max ${IMAGE_MAX_BYTES} bytes`, 422);

    const owner =
      subjectType === "performer"
        ? await performerOwnedBy(userId)
        : subjectType === "venue"
          ? await venueOwnedBy(userId)
          : await techOwnedBy(userId);
    if (!owner) return fail("forbidden", `no ${subjectType} profile`, 403);

    const d = db();
    const existing = await d
      .select({ id: schema.mediaAssets.id })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.subjectType, subjectType),
          eq(schema.mediaAssets.subjectId, owner.id),
          eq(schema.mediaAssets.kind, "image"),
        ),
      );
    if (existing.length >= PER_PROFILE_IMAGE_QUOTA)
      return fail("quota", `max ${PER_PROFILE_IMAGE_QUOTA} photos per profile`, 422);

    const id = newId("media");
    const target = uploadTargetFor(id, contentType);
    await d.insert(schema.mediaAssets).values({
      id,
      ownerUserId: userId,
      subjectType,
      subjectId: owner.id,
      kind: "image",
      storageKey: target.storageKey,
      bytes,
      status: "uploaded",
      position: existing.length,
    });
    await appendEvent(d, {
      actor: userId,
      kind: "media.presigned",
      subjectType: "media",
      subjectId: id,
    });
    return ok({ id, ...target }, 201);
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}
