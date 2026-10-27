import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LESSON_FILES, type LessonKind, MAX_HINTS, Slug } from "@fixedstep/content-schema";
import { isScalar, isSeq, parseDocument } from "yaml";
import { ContentError } from "./load";

export const PLATFORM_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TEMPLATE_DIR = fileURLToPath(new URL("../template", import.meta.url));
const HARNESS_TYPES = join(PLATFORM_ROOT, "packages/test-harness/authoring/harness.d.ts");

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

const titleFrom = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Appends `slug` to the YAML sequence at `key`, keeping the file's comments and layout. */
async function appendToList(file: string, key: string, slug: string) {
  const doc = parseDocument(await readFile(file, "utf8"));
  const list = doc.get(key);
  if (!isSeq(list)) throw new ContentError(`${file}: "${key}" is not a list`);
  if (list.items.some((i) => isScalar(i) && i.value === slug)) return;
  list.add(slug);
  await writeFile(file, doc.toString());
}

/**
 * Creates courses/<course>/<chapter>/<lesson>/ with the files its kind needs, and adds the
 * lesson (and, if new, the chapter and course) to the manifests. Returns the files written.
 */
export async function newLesson(root: string, path: string, kind: LessonKind) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 3)
    throw new ContentError(`expected <course>/<chapter>/<lesson>, got "${path}"`);
  for (const p of parts) {
    if (!Slug.safeParse(p).success)
      throw new ContentError(`"${p}": slugs are lowercase-kebab-case`);
  }
  const [course, chapter, lesson] = parts as [string, string, string];
  const courseDir = join(root, "courses", course);
  const chapterDir = join(courseDir, chapter);
  const lessonDir = join(chapterDir, lesson);
  if (await exists(lessonDir)) throw new ContentError(`${lessonDir} already exists`);

  const written: string[] = [];
  const write = async (file: string, text: string) => {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    written.push(file);
  };

  const courseYaml = join(courseDir, "course.yaml");
  if (await exists(courseYaml)) {
    await appendToList(courseYaml, "chapters", chapter);
  } else {
    const position = (await readdir(join(root, "courses")).catch(() => [])).length;
    await write(
      courseYaml,
      `slug: ${course}
title: ${titleFrom(course)}
description: TODO one or two sentences for the course catalog.
position: ${position}
published: false
chapters:
  - ${chapter}
`,
    );
  }

  const chapterYaml = join(chapterDir, "chapter.yaml");
  if (await exists(chapterYaml)) {
    await appendToList(chapterYaml, "lessons", lesson);
  } else {
    await write(
      chapterYaml,
      `slug: ${chapter}\ntitle: ${titleFrom(chapter)}\nlessons:\n  - ${lesson}\n`,
    );
  }

  for (const [name, text] of Object.entries(lessonFiles(lesson, kind))) {
    await write(join(lessonDir, name), text);
  }
  return written;
}

/** Comment-only, so it loads as "no hints" until the author writes some. */
const HINTS_SCAFFOLD = `<!--
Hints: optional, server-only. Write 1–${MAX_HINTS} hints, ordered from a nudge to nearly the
answer, with a line containing only --- between them. Hint n unlocks after n failed
submissions, and the learner clicks to reveal each one. Markdown and fenced code are allowed
(--- inside a fence doesn't split); use *** for a horizontal rule and "## Heading" for headings.
The last hint may come close to the answer but shouldn't be the solution code.
Delete this file if the lesson has no hints.
-->
`;

function lessonFiles(slug: string, kind: LessonKind): Record<string, string> {
  const front = (extra = "") =>
    `---\nslug: ${slug}\ntitle: ${titleFrom(slug)}\nkind: ${kind}\naccess: paid\nxp: ${kind === "sim" ? 25 : 10}\n${extra}---\n\n`;

  switch (kind) {
    case "reading":
      return { [LESSON_FILES.body]: `${front()}TODO lesson text.\n` };
    case "quiz":
      return {
        [LESSON_FILES.body]: `${front(`quiz:
  - id: first-question
    prompt: TODO question?
    options:
      - TODO wrong answer
      - TODO right answer
    answer: 1
    explanation: TODO why.
`)}TODO intro.\n`,
      };
    case "code":
      return {
        [LESSON_FILES.body]: `${front()}TODO explanation.\n\n## Assignment\n\nImplement \`add(a, b)\`.\n`,
        [LESSON_FILES.starter]: `export function add(a: number, b: number): number {
  // TODO
  return 0;
}
`,
        [LESSON_FILES.solution]: `export function add(a: number, b: number): number {
  return a + b;
}
`,
        [LESSON_FILES.visibleTests]: `import { expect, test } from "@fixedstep/harness";
import { add } from "./solution";

test("adds two numbers", () => {
  expect(add(2, 3)).toBe(5);
});
`,
        [LESSON_FILES.hints]: HINTS_SCAFFOLD,
      };
    case "sim": {
      const game = (update: string) => `export const WIDTH = 320;
export const HEIGHT = 240;

export type State = { x: number; vx: number };

export function init(): State {
  return { x: 0, vx: 60 };
}

export function update(s: State, dt: number): State {
${update}
}

export function render(ctx: CanvasRenderingContext2D, s: State) {
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(s.x, HEIGHT / 2 - 5, 10, 10);
}
`;
      return {
        [LESSON_FILES.body]: `${front()}TODO explanation. The preview canvas is **320 × 240**.\n\n## Assignment\n\nMove the square right at \`vx\` pixels per second.\n`,
        [LESSON_FILES.starter]: game("  // TODO: move by vx * dt\n  return s;"),
        [LESSON_FILES.solution]: game("  return { ...s, x: s.x + s.vx * dt };"),
        [LESSON_FILES.visibleTests]: `import { expect, simulate, test } from "@fixedstep/harness";
import * as game from "./solution";

test("moves right over one second", () => {
  const s = simulate(game, { steps: 60, dt: 1 / 60 });
  expect(s.x).toBeCloseTo(60);
});
`,
        [LESSON_FILES.hints]: HINTS_SCAFFOLD,
      };
    }
  }
}

/**
 * Writes a new content repo skeleton into `dir` (which must be empty or missing): README,
 * publish workflow pinned to the platform's current commit, and a tsconfig with a copy of the
 * test harness types.
 */
export async function initContentRepo(dir: string) {
  if ((await exists(dir)) && (await readdir(dir)).length > 0) {
    throw new ContentError(`${dir} is not empty`);
  }
  let platformRef = "main";
  try {
    platformRef = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: PLATFORM_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    // not a git checkout; fall back to main
  }
  const vars: Record<string, string> = { PLATFORM_REF: platformRef };

  const written: string[] = [];
  const copy = async (from: string, to: string) => {
    for (const entry of await readdir(from, { withFileTypes: true })) {
      // npm-style: dotfiles are stored without the dot so tooling in this repo ignores them.
      const name = entry.name.startsWith("_") ? `.${entry.name.slice(1)}` : entry.name;
      if (entry.isDirectory()) {
        await copy(join(from, entry.name), join(to, name));
        continue;
      }
      const text = (await readFile(join(from, entry.name), "utf8")).replace(
        /\{\{(\w+)\}\}/g,
        (m, k: string) => vars[k] ?? m,
      );
      await mkdir(to, { recursive: true });
      await writeFile(join(to, name), text);
      written.push(join(to, name));
    }
  };
  await copy(TEMPLATE_DIR, dir);
  // A copy rather than a path into a platform checkout, which may not exist (or sit elsewhere).
  const types = join(dir, "types/harness.d.ts");
  await mkdir(dirname(types), { recursive: true });
  await writeFile(types, await readFile(HARNESS_TYPES, "utf8"));
  written.push(types);
  await mkdir(join(dir, "courses"), { recursive: true });
  return { written, platformRef };
}
