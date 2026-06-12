/**
 * Double-blind review visibility (PRD F7.1): a review becomes visible once
 * BOTH sides of its booking have reviewed, or VISIBILITY_DAYS after it was
 * written — whichever comes first. Pure; pages apply it read-side.
 */
export const REVIEW_VISIBILITY_DAYS = 7;

export interface ReviewLike {
  bookingId: string;
  authorRole: string; // venue | performer
  createdAt: Date;
}

export function visibleReviews<R extends ReviewLike>(
  all: R[],
  forAuthorRole: string,
  now: Date = new Date(),
): R[] {
  const cutoff = now.getTime() - REVIEW_VISIBILITY_DAYS * 86_400_000;
  return all.filter(
    (r) =>
      r.authorRole === forAuthorRole &&
      (r.createdAt.getTime() < cutoff ||
        all.some(
          (o) => o.bookingId === r.bookingId && o.authorRole !== r.authorRole,
        )),
  );
}
