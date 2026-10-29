import { user } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { createAuth } from "./auth";
import { createLogProvider } from "./email/log";
import { loadEnv } from "./env";

const ORIGIN = "http://localhost:5173";
let db: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;

const post = (path: string, body: unknown, cookie?: string) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

const roleOf = async (email: string) => {
  const [row] = await db.select({ role: user.role }).from(user).where(eq(user.email, email));
  return row?.role;
};

beforeAll(async () => {
  db = await createTestDb();
  const env = loadEnv({
    DATABASE_URL: "postgres://x",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: ORIGIN,
    WEB_ORIGIN: ORIGIN,
  });
  auth = createAuth(env, db as never, createLogProvider());
});

it("ignores a role sent at sign-up and on update-user", async () => {
  const signUp = await post("/sign-up/email", {
    name: "Mallory",
    email: "mallory@test.dev",
    password: "correct-horse-battery",
    role: "admin",
  });
  expect(await roleOf("mallory@test.dev")).toBe("user");

  const cookie = signUp.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect(cookie).not.toBe("");

  await post("/update-user", { role: "admin", name: "Mallory 2" }, cookie);
  expect(await roleOf("mallory@test.dev")).toBe("user");

  const session = await auth.handler(
    new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }),
  );
  const body = (await session.json()) as { user: Record<string, unknown> };
  expect(body.user.email).toBe("mallory@test.dev");
  expect(body.user).not.toHaveProperty("role");
});
