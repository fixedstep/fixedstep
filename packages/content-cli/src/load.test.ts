import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LESSON_FILES } from "@fixedstep/content-schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContentError, loadContent } from "./load";
import { newLesson } from "./scaffold";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "fixedstep-content-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const lessonDir = (slug: string) => join(root, "courses/game/basics", slug);
const firstLesson = async () => (await loadContent(root))[0]?.chaptersLoaded[0]?.lessonsLoaded[0];

describe("loadContent hints", () => {
  it("loads hints in order", async () => {
    await newLesson(root, "game/basics/code-me", "code");
    await writeFile(join(lessonDir("code-me"), LESSON_FILES.hints), "one\n---\ntwo\n---\nthree\n");
    expect((await firstLesson())?.hints).toEqual(["one", "two", "three"]);
  });

  it("gives [] without hints.md and keeps the contentHash", async () => {
    await newLesson(root, "game/basics/code-me", "code");
    const file = join(lessonDir("code-me"), LESSON_FILES.hints);
    await rm(file);
    const without = await firstLesson();
    expect(without?.hints).toEqual([]);

    // Hashing hints.md only when present means lessons without it hash as they did before.
    await writeFile(file, "a hint\n");
    const withHints = await firstLesson();
    expect(withHints?.contentHash).not.toBe(without?.contentHash);
    await rm(file);
    expect((await firstLesson())?.contentHash).toBe(without?.contentHash);
  });

  it("rejects more than 4 hints", async () => {
    await newLesson(root, "game/basics/code-me", "code");
    await writeFile(
      join(lessonDir("code-me"), LESSON_FILES.hints),
      "1\n---\n2\n---\n3\n---\n4\n---\n5",
    );
    await expect(loadContent(root)).rejects.toThrow(ContentError);
    await expect(loadContent(root)).rejects.toThrow(/at most 4 hints \(found 5\)/);
  });

  it("rejects an empty hint", async () => {
    await newLesson(root, "game/basics/code-me", "code");
    await writeFile(join(lessonDir("code-me"), LESSON_FILES.hints), "1\n---\n\n---\n3");
    await expect(loadContent(root)).rejects.toThrow(/hint 2 is empty/);
  });

  it("rejects an unterminated comment instead of dropping the hints after it", async () => {
    await newLesson(root, "game/basics/code-me", "code");
    await writeFile(join(lessonDir("code-me"), LESSON_FILES.hints), "<!-- TODO\none\n---\ntwo");
    await expect(loadContent(root)).rejects.toThrow(ContentError);
    await expect(loadContent(root)).rejects.toThrow(
      /hints\.md: comment opened on line 1 is never closed/,
    );
  });

  it("rejects hints.md on a reading lesson", async () => {
    await newLesson(root, "game/basics/read-me", "reading");
    await writeFile(join(lessonDir("read-me"), LESSON_FILES.hints), "a hint");
    await expect(loadContent(root)).rejects.toThrow(ContentError);
    await expect(loadContent(root)).rejects.toThrow(/only for code\/sim lessons/);
  });
});
