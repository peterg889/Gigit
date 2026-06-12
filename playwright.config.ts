import { defineConfig } from "@playwright/test";

/**
 * E2E (engineering-spec §13): runs against a LIVE stack (web + worker + db) —
 * `pnpm dev` locally, the deployed stack in CI-against-staging. Not part of
 * `pnpm test` because it needs the running system: `pnpm e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3002",
    trace: "retain-on-failure",
  },
});
