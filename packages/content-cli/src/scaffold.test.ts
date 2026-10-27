import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContentError, loadContent } from "./load";
import { initContentRepo, newLesson } from "./scaffold";
import { validateContent } from "./validate";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "fixedstep-content-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("newLesson", () => {
  it("scaffolds every kind into content that loads and validates", async () => {
    await newLesson(root, "game/basics/read-me", "reading");
    await newLesson(root, "game/basics/quiz-me", "quiz");
    await newLesson(root, "game/basics/code-me", "code");
    await newLesson(root, "game/physics/sim-me", "sim");

    const courses = await loadContent(root);
    const course = courses[0];
    expect(course?.chapters).toEqual(["basics", "physics"]);
    expect(course?.published).toBe(false);
    expect(course?.chaptersLoaded[0]?.lessons).toEqual(["read-me", "quiz-me", "code-me"]);
    expect(course?.chaptersLoaded[1]?.lessonsLoaded[0]?.kind).toBe("sim");
    // code/sim get a comment-only hints.md, which loads as "no hints".
    expect(course?.chaptersLoaded[0]?.lessonsLoaded[2]?.hints).toEqual([]);
    expect(course?.chaptersLoaded[1]?.lessonsLoaded[0]?.hints).toEqual([]);
    await expect(
      readFile(join(root, "courses/game/basics/code-me/hints.md"), "utf8"),
    ).resolves.toMatch(/^<!--/);
    // Solutions pass; starters fail at least one visible test (no "already passes" warning).
    expect(await validateContent(courses)).toEqual([]);
  }, 30_000);

  it("keeps manifest comments and rejects duplicates and bad slugs", async () => {
    await newLesson(root, "game/basics/one", "reading");
    const chapterYaml = join(root, "courses/game/basics/chapter.yaml");
    const original = await readFile(chapterYaml, "utf8");
    await writeFile(chapterYaml, original.replace("lessons:", "# keep me\nlessons:"));
    await newLesson(root, "game/basics/two", "reading");
    const updated = await readFile(chapterYaml, "utf8");
    expect(updated).toContain("# keep me");
    expect(updated).toMatch(/- one\n\s+- two\n/);

    await expect(newLesson(root, "game/basics/two", "reading")).rejects.toThrow(ContentError);
    await expect(newLesson(root, "game/Basics/x", "reading")).rejects.toThrow(/kebab/);
    await expect(newLesson(root, "game/x", "reading")).rejects.toThrow(/<course>/);
  });
});

describe("initContentRepo", () => {
  it("writes the skeleton with placeholders filled in", async () => {
    const dir = join(root, "repo");
    const { written, platformRef } = await initContentRepo(dir);
    const names = written.map((f) => f.slice(dir.length + 1)).sort();
    expect(names).toEqual([
      ".github/workflows/publish.yml",
      ".gitignore",
      "README.md",
      "tsconfig.json",
      "types/harness.d.ts",
    ]);

    const workflow = await readFile(join(dir, ".github/workflows/publish.yml"), "utf8");
    expect(workflow).toContain(`PLATFORM_REF: ${platformRef}`);
    expect(await readFile(join(dir, "types/harness.d.ts"), "utf8")).toContain(
      'declare module "@fixedstep/harness"',
    );

    await expect(initContentRepo(dir)).rejects.toThrow(/not empty/);
  });
});
