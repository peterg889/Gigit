import { AiNotConfiguredError, gearExtract } from "@gigit/db";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth";
import { fail, ok, parseBody } from "@/lib/respond";

const bodySchema = z
  .object({
    description: z.string().max(2000).default(""),
    imageBase64: z.string().max(8_000_000).optional(), // ~6MB photo
    imageMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  })
  .refine((b) => b.description.length >= 5 || !!b.imageBase64, {
    message: "provide a description, a photo, or both",
  });

/**
 * Gear extraction (F6.6): messy description and/or a PHOTO of the rig/PA
 * closet → structured inventory draft. The photo path is the one that makes
 * the sound-plan engine feasible at scale.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const parsed = await parseBody(req, bodySchema);
    if ("response" in parsed) return parsed.response;
    const { description, imageBase64, imageMimeType } = parsed.data;
    const draft = await gearExtract(
      description || "(no text — extract from the photo)",
      userId,
      imageBase64 && imageMimeType
        ? { mimeType: imageMimeType, dataBase64: imageBase64 }
        : undefined,
    );
    return ok({ draft });
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    if (e instanceof AiNotConfiguredError)
      return fail("ai_not_configured", e.message, 503);
    return fail("extract_failed", String(e), 502);
  }
}
