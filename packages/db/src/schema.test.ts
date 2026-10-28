import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { user } from "./schema";
import { createTestDb } from "./testing";

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("user.role", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("defaults to user", async () => {
    await db.insert(user).values({ id: "d", name: "D", email: "d@t.dev" });
    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, "d"));
    expect(row?.role).toBe("user");
  });

  it("can be set to admin", async () => {
    await db.insert(user).values({ id: "a", name: "A", email: "a@t.dev", role: "admin" });
    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, "a"));
    expect(row?.role).toBe("admin");
  });

  it("rejects null and values outside the enum", async () => {
    await expect(
      db.execute(
        sql`insert into "user" (id, name, email, role) values ('n', 'N', 'n@t.dev', null)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`insert into "user" (id, name, email, role) values ('o', 'O', 'o@t.dev', 'owner')`,
      ),
    ).rejects.toThrow();
  });
});

describe("migration 0005", () => {
  it("backfills existing users to the user role", async () => {
    // A migrations folder holding only 0000-0004, then the full one applied on top.
    const partial = mkdtempSync(join(tmpdir(), "migrations-"));
    cpSync(MIGRATIONS, partial, { recursive: true });
    const journalPath = join(partial, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
    journal.entries = journal.entries.slice(0, 5);
    writeFileSync(journalPath, JSON.stringify(journal));

    const db = drizzle({ client: new PGlite(), schema });
    await migrate(db, { migrationsFolder: partial });
    await db.execute(sql`insert into "user" (id, name, email) values ('old', 'Old', 'old@t.dev')`);
    await expect(db.execute(sql`select role from "user"`)).rejects.toThrow();

    await migrate(db, { migrationsFolder: MIGRATIONS });
    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, "old"));
    expect(row?.role).toBe("user");
  });
});
