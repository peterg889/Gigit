/**
 * Test env: fall back to the repo root .env (dev DB) when vars aren't
 * already set (CI sets them in the workflow). Node 22's loadEnvFile —
 * no dotenv dependency.
 */
import { existsSync } from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  const envFile = path.resolve(__dirname, "../../../../.env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
process.env.DATABASE_URL ??= "postgres://gigit:gigit@localhost:5433/gigit";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123456789";
