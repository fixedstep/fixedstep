import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ChapterManifest,
  CourseManifest,
  LESSON_FILES,
  LessonFrontmatter,
  MAX_HINTS,
} from "@fixedstep/content-schema";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import { parseHints } from "./hints";

export type LoadedLesson = LessonFrontmatter & {
  path: string;
  bodyMd: string;
  starterCode: string | null;
  visibleTests: string | null;
  hiddenTests: string | null;
  solution: string | null;
  /** Server-only. Empty when the lesson has no hints.md. */
  hints: string[];
  contentHash: string;
};
export type LoadedChapter = ChapterManifest & { lessonsLoaded: LoadedLesson[] };
export type LoadedCourse = CourseManifest & { chaptersLoaded: LoadedChapter[] };

export class ContentError extends Error {}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function parseWith<T extends z.ZodType>(schema: T, yaml: string, where: string): z.infer<T> {
  let data: unknown;
  try {
    data = parseYaml(yaml);
  } catch (e) {
    throw new ContentError(`${where}: invalid YAML: ${(e as Error).message.split("\n")[0]}`);
  }
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ContentError(`${where}\n${issues.join("\n")}`);
  }
  return r.data;
}

async function loadLesson(dir: string, dirName: string): Promise<LoadedLesson> {
  const raw = await readOptional(join(dir, LESSON_FILES.body));
  if (raw === null) throw new ContentError(`${dir}: missing ${LESSON_FILES.body}`);
  const m = FRONTMATTER.exec(raw);
  if (!m) throw new ContentError(`${dir}/${LESSON_FILES.body}: missing YAML frontmatter`);
  const fm = parseWith(LessonFrontmatter, m[1] ?? "", `${dir}/${LESSON_FILES.body}`);
  if (fm.slug !== dirName) throw new ContentError(`${dir}: slug "${fm.slug}" != directory name`);

  const [starterCode, visibleTests, hiddenTests, solution, hintsRaw] = await Promise.all([
    readOptional(join(dir, LESSON_FILES.starter)),
    readOptional(join(dir, LESSON_FILES.visibleTests)),
    readOptional(join(dir, LESSON_FILES.hiddenTests)),
    readOptional(join(dir, LESSON_FILES.solution)),
    readOptional(join(dir, LESSON_FILES.hints)),
  ]);
  const needsCode = fm.kind === "code" || fm.kind === "sim";
  if (needsCode && (!starterCode || !visibleTests || !solution)) {
    throw new ContentError(
      `${dir}: ${fm.kind} lessons need ${LESSON_FILES.starter}, ${LESSON_FILES.visibleTests} and ${LESSON_FILES.solution}`,
    );
  }

  const where = `${dir}/${LESSON_FILES.hints}`;
  if (hintsRaw !== null && !needsCode) {
    throw new ContentError(`${where}: hints are only for code/sim lessons`);
  }
  const { hints, empty } = parseHints(hintsRaw ?? "");
  if (empty.length > 0) throw new ContentError(`${where}: hint ${empty[0]} is empty`);
  if (hints.length > MAX_HINTS) {
    throw new ContentError(`${where}: at most ${MAX_HINTS} hints (found ${hints.length})`);
  }

  const hash = createHash("sha256");
  for (const part of [raw, starterCode, visibleTests, hiddenTests, solution]) {
    hash.update(part ?? "\0");
    hash.update("\x1f");
  }
  // Only when present, so lessons without hints keep their existing hashes.
  if (hintsRaw !== null) hash.update(hintsRaw);
  return {
    ...fm,
    path: dir,
    bodyMd: raw.slice(m[0].length).trim(),
    starterCode,
    visibleTests,
    hiddenTests,
    solution,
    hints,
    contentHash: hash.digest("hex").slice(0, 16),
  };
}

/** Loads <root>/courses/<course>/{course.yaml, <chapter>/{chapter.yaml, <lesson>/...}} */
export async function loadContent(root: string): Promise<LoadedCourse[]> {
  const coursesDir = join(root, "courses");
  const entries = await readdir(coursesDir, { withFileTypes: true });
  const courses: LoadedCourse[] = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const courseDir = join(coursesDir, entry.name);
    const yaml = await readOptional(join(courseDir, "course.yaml"));
    if (yaml === null) throw new ContentError(`${courseDir}: missing course.yaml`);
    const course = parseWith(CourseManifest, yaml, `${courseDir}/course.yaml`);

    const chaptersLoaded: LoadedChapter[] = [];
    for (const chapterSlug of course.chapters) {
      const chapterDir = join(courseDir, chapterSlug);
      const cy = await readOptional(join(chapterDir, "chapter.yaml"));
      if (cy === null) throw new ContentError(`${chapterDir}: missing chapter.yaml`);
      const chapter = parseWith(ChapterManifest, cy, `${chapterDir}/chapter.yaml`);
      const lessonsLoaded = [];
      for (const lessonSlug of chapter.lessons) {
        lessonsLoaded.push(await loadLesson(join(chapterDir, lessonSlug), lessonSlug));
      }
      chaptersLoaded.push({ ...chapter, lessonsLoaded });
    }
    courses.push({ ...course, chaptersLoaded });
  }
  return courses;
}
