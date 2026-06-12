/** Applies migrations to the test database before the suite runs. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export default async function setup() {
  const url =
    process.env.DATABASE_URL ?? "postgres://gigit:gigit@localhost:5433/gigit";
  const pool = new pg.Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: "./migrations" });
  await pool.end();
}
