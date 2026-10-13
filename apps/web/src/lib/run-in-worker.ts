import type { GradeResult } from "@fixedstep/content-schema";
import type { GradeRequest } from "@fixedstep/test-harness";

/**
 * Runs the visible tests in a throwaway Web Worker. The worker has no DOM access, and we
 * terminate it on timeout, so an infinite loop can't freeze the page. This is for fast
 * feedback only; the server re-grades (with hidden tests) on submit.
 */
export function runTestsInWorker(req: GradeRequest, timeoutMs = 3_000): Promise<GradeResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("../workers/tests.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ status: "error", results: [], error: `Timed out after ${timeoutMs}ms`, durationMs: timeoutMs });
    }, timeoutMs);
    worker.onmessage = (e: MessageEvent<GradeResult>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.postMessage(req);
  });
}
