import { timingSafeEqual } from "node:crypto";
import type { GradeResult } from "@fixedstep/content-schema";
import { grade } from "@fixedstep/test-harness";
import { quickjsExecutor } from "@fixedstep/test-harness/quickjs";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

/**
 * Called only by the API (never exposed publicly). Deploy it with no credentials and no
 * route to the database: even a sandbox escape should find nothing to reach.
 */
export const GradeRequest = z.object({
  code: z.string().max(100_000),
  visibleTests: z.string(),
  hiddenTests: z.string().nullish(),
  seed: z.number().int().optional(),
});

export type GraderOptions = {
  token: string;
  grade?: (req: z.infer<typeof GradeRequest>) => Promise<GradeResult>;
};

function sameToken(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function createGraderApp(opts: GraderOptions) {
  const execute = quickjsExecutor({ timeoutMs: 3_000, memoryBytes: 64 * 1024 * 1024 });
  const run = opts.grade ?? ((req) => grade(req, execute));
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/grade", bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    if (!sameToken(c.req.header("authorization"), opts.token)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const parsed = GradeRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);
    return c.json(await run(parsed.data));
  });

  return app;
}
