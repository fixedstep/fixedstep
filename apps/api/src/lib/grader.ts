import type { GradeResult } from "@fixedstep/content-schema";
import type { GradeRequest } from "@fixedstep/test-harness";
import type { Env } from "../env";

export type Grader = (req: GradeRequest) => Promise<GradeResult>;

export function createGrader(env: Env): Grader {
  if (env.GRADER_MODE === "local") {
    return async (req) => {
      const { grade } = await import("@fixedstep/test-harness");
      const { quickjsExecutor } = await import("@fixedstep/test-harness/quickjs");
      return grade(req, quickjsExecutor());
    };
  }

  // The isolated grader service (apps/grader). Its own limits cap a run at ~3s; the timeout
  // here also covers a cold start.
  const url = new URL("/grade", env.GRADER_URL);
  const auth = `Bearer ${env.GRADER_TOKEN}`;
  return async (req) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`grader failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as GradeResult;
  };
}
