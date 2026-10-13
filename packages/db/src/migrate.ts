import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));
const LOCK_ID = 727_001; // arbitrary, app-wide constant

/**
 * Applies pending migrations under a Postgres advisory lock, so several API tasks starting
 * at once (rolling deploy) don't race each other.
 */
export async function runMigrations(url: string, migrationsFolder = MIGRATIONS_FOLDER) {
  const db = createDb(url, { max: 1 });
  try {
    await db.$client`select pg_advisory_lock(${LOCK_ID})`;
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client`select pg_advisory_unlock(${LOCK_ID})`.catch(() => {});
    await db.$client.end();
  }
}

