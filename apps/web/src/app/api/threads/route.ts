import { inquiryCreateSchema, newId } from "@gigit/domain";
import { appendEvent, db, schema } from "@gigit/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { AuthError, requireUser, venueOwnedBy } from "@/lib/auth";
import { fail, ok, parseBody } from "@/lib/respond";

const DAILY_INQUIRY_CAP = 10; // engineering-spec §10: anti-spam cap per venue

/** Venue → performer direct inquiry ("message any band"); PRD F5.1. */
export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const venue = await venueOwnedBy(userId);
    if (!venue)
      return fail("forbidden", "only venues can open inquiries (performers apply to slots)", 403);

    const parsed = await parseBody(req, inquiryCreateSchema);
    if ("response" in parsed) return parsed.response;

    const d = db();
    const [performer] = await d
      .select()
      .from(schema.performers)
      .where(eq(schema.performers.id, parsed.data.performerId));
    if (!performer) return fail("not_found", "performer not found", 404);

    const since = new Date(Date.now() - 24 * 3_600_000);
    const [{ count }] = (await d
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.threads)
      .innerJoin(
        schema.threadParticipants,
        eq(schema.threads.id, schema.threadParticipants.threadId),
      )
      .where(
        and(
          eq(schema.threads.scope, "inquiry"),
          eq(schema.threadParticipants.userId, userId),
          gte(schema.threads.createdAt, since),
        ),
      )) as [{ count: number }];
    if (count >= DAILY_INQUIRY_CAP)
      return fail("rate_limited", "daily inquiry limit reached", 429);

    const threadId = newId("thread");
    const messageId = newId("message");
    await d.transaction(async (tx) => {
      await tx.insert(schema.threads).values({
        id: threadId,
        scope: "inquiry",
        subjectId: parsed.data.slotId ?? null,
      });
      await tx.insert(schema.threadParticipants).values([
        { threadId, userId },
        { threadId, userId: performer.ownerUserId },
      ]);
      await tx.insert(schema.messages).values({
        id: messageId,
        threadId,
        senderUserId: userId,
        body: parsed.data.body,
      });
      await appendEvent(tx, {
        actor: userId,
        kind: "thread.inquiry_opened",
        subjectType: "thread",
        subjectId: threadId,
        payload: {
          performerId: performer.id,
          effects: [{ kind: "notify", template: "new_inquiry", to: "performer" }],
        },
      });
    });
    return ok({ threadId }, 201);
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}

export async function GET() {
  try {
    const userId = await requireUser();
    const d = db();
    const mine = d
      .select({ threadId: schema.threadParticipants.threadId })
      .from(schema.threadParticipants)
      .where(eq(schema.threadParticipants.userId, userId));
    const rows = await d
      .select()
      .from(schema.threads)
      .where(inArray(schema.threads.id, mine));
    return ok({ threads: rows });
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}
