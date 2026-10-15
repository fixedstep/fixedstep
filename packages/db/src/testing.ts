import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** In-process Postgres (PGlite) with every migration applied. For tests only. */
export async function createTestDb() {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
