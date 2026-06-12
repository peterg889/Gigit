/**
 * Cancellation fee schedule (PRD F3.3):
 *   venue cancels  >14 days out  → 0% to performer, full refund
 *   venue cancels  48h–14 days   → 50% to performer
 *   venue cancels  <48h          → 100% to performer
 *   performer cancels            → full refund to venue (plus reliability strike)
 */
export interface CancellationOutcome {
  feeCents: number; // paid to performer
  refundCents: number; // returned to venue
}

const HOUR_MS = 3_600_000;

export function venueCancellationFee(
  amountCents: number,
  gigStartsAt: Date,
  cancelledAt: Date,
): CancellationOutcome {
  const hoursOut = (gigStartsAt.getTime() - cancelledAt.getTime()) / HOUR_MS;
  let feeCents: number;
  if (hoursOut > 14 * 24) feeCents = 0;
  else if (hoursOut >= 48) feeCents = Math.round(amountCents / 2);
  else feeCents = amountCents;
  return { feeCents, refundCents: amountCents - feeCents };
}

export function performerCancellationFee(amountCents: number): CancellationOutcome {
  return { feeCents: 0, refundCents: amountCents };
}
