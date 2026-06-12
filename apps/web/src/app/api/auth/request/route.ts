import { authRequestSchema, newId } from "@gigit/domain";
import { appendEvent, db, env, schema } from "@gigit/db";
import { fail, ok, parseBody } from "@/lib/respond";

export async function POST(req: Request) {
  const parsed = await parseBody(req, authRequestSchema);
  if ("response" in parsed) return parsed.response;
  const destination = parsed.data.phone ?? parsed.data.email!;

  const code =
    env().NODE_ENV === "production"
      ? String(Math.floor(100000 + Math.random() * 900000))
      : "000000"; // dev/test: fixed code, logged

  await db().insert(schema.authOtps).values({
    id: newId("user"), // otp rows reuse the ULID generator; prefix is irrelevant
    destination,
    code,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  await appendEvent(db(), {
    actor: "system",
    kind: "auth.otp_requested",
    subjectType: "auth",
    subjectId: destination,
    payload: { effects: [{ kind: "notify", template: "otp", to: "both" }] },
  });

  if (env().NODE_ENV !== "production") {
    console.log(JSON.stringify({ kind: "auth.dev_otp", destination, code }));
  }
  // In production the worker sends the code via Twilio/SES (M1).
  if (!destination) return fail("validation", "destination required", 422);
  return ok({ sent: true });
}
