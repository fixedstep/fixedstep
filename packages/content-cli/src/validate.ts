import { parseTweaks, splitLessonMarkdown } from "@fixedstep/content-schema/markdown";
import { type Executor, grade, transpile } from "@fixedstep/test-harness";
import { quickjsExecutor } from "@fixedstep/test-harness/quickjs";
import type { LoadedCourse } from "./load";

export type Finding = { level: "error" | "warning"; where: string; message: string };

/**
 * Beyond schema checks (done while loading): every code/sim lesson's solution must pass all
 * tests in the same QuickJS sandbox production uses, and the starter should fail at least
 * one visible test (otherwise the lesson is already "done"). Playground blocks in any lesson
 * body must compile, export init/update/render, and survive a simulated second.
 */
export async function validateContent(courses: LoadedCourse[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const exec = quickjsExecutor({ timeoutMs: 5_000 });
  for (const course of courses) {
    for (const chapter of course.chaptersLoaded) {
      for (const lesson of chapter.lessonsLoaded) {
        findings.push(...(await validatePlaygrounds(lesson.path, lesson.bodyMd, exec)));
        if (lesson.kind !== "code" && lesson.kind !== "sim") continue;
        const tests = { visibleTests: lesson.visibleTests ?? "", hiddenTests: lesson.hiddenTests };

        const sol = await grade({ code: lesson.solution ?? "", ...tests }, exec);
        if (sol.status !== "passed") {
          const failing = sol.results.filter((r) => !r.passed).map((r) => r.name);
          findings.push({
            level: "error",
            where: lesson.path,
            message: `solution does not pass: ${sol.error ?? failing.join(", ")}`,
          });
        }

        const starter = await grade({ code: lesson.starterCode ?? "", ...tests }, exec);
        if (starter.status === "passed") {
          findings.push({
            level: "warning",
            where: lesson.path,
            message: "starter code already passes every test",
          });
        }
      }
    }
  }
  return findings;
}

async function validatePlaygrounds(
  where: string,
  bodyMd: string,
  exec: Executor,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const playgrounds = splitLessonMarkdown(bodyMd).filter((s) => s.type === "playground");
  for (const [i, { code }] of playgrounds.entries()) {
    const at = `${where} (playground ${i + 1})`;
    for (const t of parseTweaks(code)) {
      if (t.value < t.min || t.value > t.max) {
        findings.push({ level: "error", where: at, message: `${t.name} is outside its @range` });
      }
    }
    try {
      const js = transpile(code, "playground.ts");
      // No canvas in the sandbox, so render() isn't exercised; init/update must run cleanly.
      const program = `(function () {
  const module = { exports: {} };
  new Function("module", "exports", "require", ${JSON.stringify(js)})(module, module.exports, () => {
    throw new Error("playgrounds can't import");
  });
  const g = module.exports;
  for (const k of ["init", "update", "render"]) {
    if (typeof g[k] !== "function") throw new Error("missing export " + k + "()");
  }
  let s = g.init();
  for (let i = 0; i < 60; i++) {
    const n = g.update(s, 1 / 60, { keys: {} });
    if (n !== undefined) s = n;
  }
  return "ok";
})()`;
      await exec(program);
    } catch (e) {
      findings.push({ level: "error", where: at, message: (e as Error).message });
    }
  }
  return findings;
}
