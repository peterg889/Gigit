import { expect, test, type Page } from "@playwright/test";

/**
 * The critical journey (engineering-spec §13 E2E #2): post slot → apply →
 * offer → accept → CONFIRMED. Exercises web UI, API, state machine, and the
 * worker's payment round-trip (Null gateway) in one pass.
 *
 * Requires the dev stack: `pnpm dev` + seeded users (dev OTP 000000).
 */

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel(/Enter the code/).fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL("**/me");
}

test("venue posts a slot; performer applies; offer; accept; booking confirms", async ({
  browser,
}) => {
  const marker = `e2e night ${Date.now()}`;
  const venue = await browser.newContext();
  const performer = await browser.newContext();
  const vp = await venue.newPage();
  const pp = await performer.newPage();

  // ── venue posts a slot ──
  await signIn(vp, "venue@example.com");
  await vp.goto("/slots/new");
  const startsAt = new Date(Date.now() + 14 * 86_400_000);
  const dtLocal = new Date(startsAt.getTime() - startsAt.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await vp.getByLabel("Date & start time").fill(dtLocal);
  await vp.getByLabel("Duration (minutes)").fill("120");
  await vp.getByLabel("Format", { exact: true }).selectOption("music");
  await vp.getByLabel("Budget (USD)").fill("350");
  await vp.getByLabel(/About the night/).fill(marker);
  await vp.getByRole("button", { name: "Post slot" }).click();
  await vp.waitForURL("**/");

  // ── performer finds it on the feed and applies ──
  await signIn(pp, "band@example.com");
  await pp.goto("/");
  const card = pp.locator(".card", { hasText: marker });
  await expect(card).toBeVisible();
  await expect(card.locator(".money")).toHaveText("$350"); // the pay is on the poster
  await card.getByRole("link").first().click();
  await pp.getByRole("button", { name: /Apply/ }).click();

  // ── venue sees the applicant and sends the offer ──
  await vp.reload();
  await vp.locator(".card", { hasText: marker }).getByRole("link").first().click();
  await expect(vp.getByText(/Applicants \(/)).toBeVisible();
  await vp.getByLabel("Offer ($)").fill("350");
  await vp.getByRole("button", { name: "Send offer" }).click();
  await expect(vp.getByText(/offered/).first()).toBeVisible();

  // ── performer accepts; worker (Null gateway) confirms it ──
  await pp.goto("/bookings");
  await pp.getByRole("button", { name: "Accept offer" }).first().click();

  await expect
    .poll(
      async () => {
        await pp.goto("/bookings");
        return pp
          .locator(".card", { hasText: "$350" })
          .first()
          .locator(".badge", { hasText: "confirmed" })
          .count();
      },
      { timeout: 20_000, message: "booking should reach confirmed via the worker" },
    )
    .toBeGreaterThan(0);

  await venue.close();
  await performer.close();
});
