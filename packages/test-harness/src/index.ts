import type { GradeResult, TestResult } from "@fixedstep/content-schema";
import { transform } from "sucrase";
import { harnessRuntime, type RawRun } from "./runtime";

export { harnessRuntime, type RawRun } from "./runtime";

export type GradeRequest = {
  code: string;
  visibleTests: string;
  hiddenTests?: string | null;
  /** Seed for Math.random/harness.random so randomized tests are reproducible. */
  seed?: number;
};

/** Test hints longer than this are cut by grade(). */
export const HINT_MAX_LENGTH = 300;

/** Executes a program string in some sandbox and returns its final expression value. */
export type Executor = (program: string) => Promise<string>;

export class CompileError extends Error {}

export function transpile(ts: string, filePath: string): string {
  try {
    return transform(ts, { transforms: ["typescript", "imports"], filePath }).code;
  } catch (e) {
    throw new CompileError(e instanceof Error ? e.message : String(e));
  }
}

/** Builds a self-contained JS program whose completion value is the RawRun JSON string. */
export function buildProgram(req: GradeRequest): string {
  const studentJs = transpile(req.code, "main.ts");
  const tests = [{ js: transpile(req.visibleTests, "tests.ts"), hidden: false }];
  if (req.hiddenTests)
    tests.push({ js: transpile(req.hiddenTests, "tests.hidden.ts"), hidden: true });
  const seed = req.seed ?? 1;
  // Bundlers with keepNames (tsx, esbuild) wrap inner functions as `__name(fn, "name")`, a helper
  // that doesn't exist once the runtime is serialized. Provide it in a closure, not as a global:
  // the runtime calls it lazily (inside expect()), and student code must not be able to replace it.
  return `(function () {
  const __name = (target) => target;
  return (${harnessRuntime.toString()})(${JSON.stringify(studentJs)}, ${JSON.stringify(tests)}, ${seed});
})();`;
}

/** Transpile, run in the given sandbox, and normalize into a GradeResult. */
export async function grade(req: GradeRequest, execute: Executor): Promise<GradeResult> {
  const started = Date.now();
  const done = (r: Omit<GradeResult, "durationMs">): GradeResult => ({
    ...r,
    durationMs: Date.now() - started,
  });

  let program: string;
  try {
    program = buildProgram(req);
  } catch (e) {
    return done({ status: "error", results: [], error: (e as Error).message });
  }

  let raw: RawRun;
  try {
    raw = JSON.parse(await execute(program)) as RawRun;
  } catch (e) {
    return done({ status: "error", results: [], error: (e as Error).message });
  }
  if (!raw.ok) return done({ status: "error", results: [], error: raw.error });
  if (raw.results.length === 0) {
    return done({ status: "error", results: [], error: "lesson has no tests" });
  }

  let hiddenIndex = 0;
  const results: TestResult[] = raw.results.map((r) => {
    // Hints are author text, so hidden tests get them too; their error stays omitted.
    const hint = !r.passed && r.hint ? r.hint.slice(0, HINT_MAX_LENGTH) : undefined;
    return r.hidden
      ? {
          name: `hidden test ${++hiddenIndex}`,
          passed: r.passed,
          hidden: true,
          ...(hint ? { hint } : {}),
        }
      : {
          name: r.name,
          passed: r.passed,
          hidden: false,
          error: r.error,
          ...(hint ? { hint } : {}),
        };
  });
  return done({ status: results.every((r) => r.passed) ? "passed" : "failed", results });
}

/** Executor for trusted or already-isolated contexts (a Web Worker, content CI). */
export const functionExecutor: Executor = async (program) =>
  String(new Function(`return ${program}`)());
