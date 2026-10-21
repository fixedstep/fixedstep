import type { Db } from "@fixedstep/db";
import type { Auth, SessionUser } from "./auth";
import type { BillingProvider } from "./billing/provider";
import type { Env } from "./env";
import type { Grader } from "./lib/grader";

export type Deps = {
  env: Env;
  db: Db;
  auth: Auth;
  grader: Grader;
  billing: BillingProvider;
};

export type AppEnv = { Variables: { user: SessionUser | null } };

/** Best-effort client key for rate limiting (the platform's load balancer sets X-Forwarded-For). */
export function clientKey(user: SessionUser | null, headers: Headers): string {
  if (user) return `u:${user.id}`;
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${ip ?? "unknown"}`;
}
