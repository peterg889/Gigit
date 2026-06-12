import { events } from "./schema.js";
import type { Db, Tx } from "./client.js";

export interface DomainEventInput {
  actor: string;
  kind: string;
  subjectType: string;
  subjectId: string;
  payload?: Record<string, unknown>;
}

/**
 * Append a domain event. MUST be called inside the same transaction as the
 * state change it describes — the events table is the outbox (engineering-spec K5):
 * rows with dispatched_at IS NULL are picked up by the worker.
 */
export async function appendEvent(
  tx: Tx | Db,
  input: DomainEventInput,
): Promise<void> {
  await tx.insert(events).values({
    actor: input.actor,
    kind: input.kind,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    payload: input.payload ?? {},
  });
}
