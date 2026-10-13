import { grade } from "@fixedstep/test-harness";
import { quickjsExecutor } from "@fixedstep/test-harness/quickjs";
import type { LoadedCourse } from "./load";

export type Finding = { level: "error" | "warning"; where: string; message: string };

/**
 * Beyond schema checks (done while loading): every code/sim lesson's solution must pass all
 * tests in the same QuickJS sandbox production uses, and the starter should fail at least
 * one visible test (otherwise the lesson is already "done").
 */
export async function validateContent(courses: LoadedCourse[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const exec = quickjsExecutor({ timeoutMs: 5_000 });
  for (const course of courses) {
    for (const chapter of course.chaptersLoaded) {
      for (const lesson of chapter.lessonsLoaded) {
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
