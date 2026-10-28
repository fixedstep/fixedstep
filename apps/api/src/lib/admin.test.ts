import { user } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "../auth";
import { isAdmin } from "./admin";

let db: Awaited<ReturnType<typeof createTestDb>>;

const session = (id: string, over: Partial<SessionUser> = {}) =>
  ({ id, emailVerified: true, isAnonymous: false, ...over }) as SessionUser;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values([
    { id: "admin", name: "A", email: "a@t.dev", emailVerified: true, role: "admin" },
    { id: "unverified", name: "U", email: "u@t.dev", emailVerified: false, role: "admin" },
    {
      id: "guest",
      name: "G",
      email: "g@t.dev",
      emailVerified: true,
      isAnonymous: true,
      role: "admin",
    },
    { id: "plain", name: "P", email: "p@t.dev", emailVerified: true },
  ]);
});

describe("isAdmin", () => {
  it("is true only for a verified account with the admin role", async () => {
    expect(await isAdmin(db as never, session("admin"))).toBe(true);
  });

  it("is false for no user, a guest, an unverified admin and a normal user", async () => {
    expect(await isAdmin(db as never, null)).toBe(false);
    expect(await isAdmin(db as never, session("guest", { isAnonymous: true }))).toBe(false);
    expect(await isAdmin(db as never, session("unverified", { emailVerified: false }))).toBe(false);
    expect(await isAdmin(db as never, session("plain"))).toBe(false);
  });

  it("is false for an unknown id", async () => {
    expect(await isAdmin(db as never, session("nobody"))).toBe(false);
  });

  it("reads the DB role, not the session object", async () => {
    const fake = { ...session("plain"), role: "admin" } as SessionUser;
    expect(await isAdmin(db as never, fake)).toBe(false);
  });
});

describe("isAdmin role changes", () => {
  it("applies a revoke and a grant on the very next call", async () => {
    const { eq } = await import("drizzle-orm");
    const s = session("plain");
    expect(await isAdmin(db as never, s)).toBe(false);
    await db.update(user).set({ role: "admin" }).where(eq(user.id, "plain"));
    expect(await isAdmin(db as never, s)).toBe(true);
    await db.update(user).set({ role: "user" }).where(eq(user.id, "plain"));
    expect(await isAdmin(db as never, s)).toBe(false);
  });
});
