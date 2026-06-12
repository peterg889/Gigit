import { db, schema } from "@gigit/db";
import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sessionUserId } from "@/lib/session";
import { ApiForm } from "@/components/ApiForm";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
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
  const [participant] = await d
    .select()
    .from(schema.threadParticipants)
    .where(
      and(
        eq(schema.threadParticipants.threadId, id),
        eq(schema.threadParticipants.userId, userId),
      ),
    );
  if (!participant) notFound();

  const messages = await d
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, id))
    .orderBy(asc(schema.messages.createdAt))
    .limit(200);

  return (
    <div>
      <h1>Conversation</h1>
      {messages.map((m) => (
        <div className="card" key={m.id}>
          <span className="muted">
            {m.senderUserId === userId ? "You" : "Them"} ·{" "}
            {m.createdAt.toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
          <p>{m.body}</p>
        </div>
      ))}
      <div className="card">
        <ApiForm
          endpoint={`/api/threads/${id}/messages`}
          submitLabel="Send"
          fields={[{ name: "body", label: "Reply", type: "textarea", required: true }]}
        />
      </div>
    </div>
  );
}
