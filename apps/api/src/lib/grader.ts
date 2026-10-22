import type { GradeResult } from "@fixedstep/content-schema";
import type { GradeRequest } from "@fixedstep/test-harness";
import type { Env } from "../env";

export type Grader = (req: GradeRequest) => Promise<GradeResult>;

/** The grader stayed overloaded (429/503, timeouts, resets) until retries or the deadline ran out. */
export class GraderBusyError extends Error {
  override name = "GraderBusyError";
}

export type HttpGraderOptions = {
  url: URL;
  token: string;
  /** One budget shared by all attempts. */
  deadlineMs?: number;
  /** Shorter than the deadline so a hung attempt can be retried once. */
  attemptTimeoutMs?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const BACKOFF_MS = [250, 1000];

/**
 * Client for the isolated grader service (apps/grader). Its own limits cap a run at ~3s; the
 * deadline also covers a cold start and a queue wait. 429/503 are retried with jittered backoff,
 * and a connection reset or attempt timeout is retried once; other errors are not retried.
 */
export function createHttpGrader(opts: HttpGraderOptions): Grader {
  const {
    url,
    deadlineMs = 20_000,
    attemptTimeoutMs = 12_000,
    maxAttempts = 3,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = opts;
  const auth = `Bearer ${opts.token}`;

  return async (req) => {
    const start = Date.now();
    const deadline = AbortSignal.timeout(deadlineMs);
    const body = JSON.stringify(req);
    let transportRetried = false;
    let last = "";

    for (let attempt = 1; ; attempt++) {
      const attemptTimeout = AbortSignal.timeout(attemptTimeoutMs);
      let failed: Error | undefined;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: auth },
          body,
          signal: AbortSignal.any([deadline, attemptTimeout]),
        });
        if (res.ok) return (await res.json()) as GradeResult;
        if (res.status === 429 || res.status === 503) {
          // Release the socket before backing off.
          await res.body?.cancel();
          last = String(res.status);
        } else {
          failed = new Error(`grader failed: ${res.status} ${await res.text()}`);
        }
      } catch (e) {
        if (deadline.aborted) throw new GraderBusyError(`grader deadline exceeded (last: ${last})`);
        const transport = e instanceof TypeError || attemptTimeout.aborted;
        if (!transport) throw e;
        if (transportRetried) throw new GraderBusyError(`grader unreachable: ${e}`);
        transportRetried = true;
        last = String(e);
      }
      if (failed) throw failed;

      if (attempt >= maxAttempts) throw new GraderBusyError(`grader busy (last: ${last})`);
      const delay = (BACKOFF_MS[attempt - 1] ?? 1000) * (0.5 + random() / 2);
      if (Date.now() - start + delay >= deadlineMs) {
        throw new GraderBusyError(`grader busy, no time left to retry (last: ${last})`);
      }
      await sleep(delay);
    }
  };
}

export function createGrader(env: Env): Grader {
  if (env.GRADER_MODE === "local") {
    return async (req) => {
      const { grade } = await import("@fixedstep/test-harness");
      const { quickjsExecutor } = await import("@fixedstep/test-harness/quickjs");
      return grade(req, quickjsExecutor());
    };
  }
  // Env validation requires GRADER_URL and GRADER_TOKEN in http mode.
  return createHttpGrader({
    url: new URL("/grade", env.GRADER_URL),
    token: env.GRADER_TOKEN ?? "",
  });
}
