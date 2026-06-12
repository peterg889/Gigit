import { db, schema } from "@gigit/db";
import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { sessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const userId = await sessionUserId();
  if (!userId)
    return (
      <div className="card">
        <Link href="/login">Sign in</Link> to see your messages.
      </div>
    );
  const d = db();
  const mine = d
    .select({ threadId: schema.threadParticipants.threadId })
    .from(schema.threadParticipants)
    .where(eq(schema.threadParticipants.userId, userId));
  const threads = await d
    .select()
    .from(schema.threads)
    .where(inArray(schema.threads.id, mine))
    .orderBy(desc(schema.threads.createdAt))
    .limit(50);

  return (
    <div>
      <h1>Inbox</h1>
      {threads.length === 0 && <div className="card">No conversations yet.</div>}
      {threads.map((t) => (
        <div className="card" key={t.id}>
          <Link href={`/inbox/${t.id}`}>
            <span className="badge">{t.scope}</span> conversation
          </Link>{" "}
          <span className="muted">
            {t.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
          </span>
        </div>
      ))}
    </div>
  );
}
