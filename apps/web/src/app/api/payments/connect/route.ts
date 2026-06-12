import { env, paymentGateway } from "@gigit/db";
import { AuthError, performerOwnedBy, requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/respond";

/**
 * Stripe Connect Express onboarding link for the performer (K3). Called
 * before first offer acceptance; null gateway (dev) returns notConfigured.
 */
export async function POST() {
  try {
    const userId = await requireUser();
    const performer = await performerOwnedBy(userId);
    if (!performer) return fail("forbidden", "performer profile required", 403);
    const url = await paymentGateway().connectOnboardingLink(
      performer.id,
      `${env().APP_URL}/me`,
    );
    if (!url) return ok({ notConfigured: true });
    return ok({ url });
  } catch (e) {
    if (e instanceof AuthError) return fail("auth", e.message, e.status);
    throw e;
  }
}
