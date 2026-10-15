#!/usr/bin/env -S npx tsx
import { watch } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LessonKind } from "@fixedstep/content-schema";
import { createDb } from "@fixedstep/db";
import { serializeBundle } from "./bundle";
import { ContentError, loadContent } from "./load";
import { initContentRepo, newLesson, PLATFORM_ROOT } from "./scaffold";
import { syncContent } from "./sync";
import { validateContent } from "./validate";

const USAGE = `usage:
  fixedstep-content validate [content-dir]
  fixedstep-content sync [content-dir]               (needs DATABASE_URL)
  fixedstep-content dev [content-dir]                (needs DATABASE_URL; re-syncs on every save)
  fixedstep-content bundle <content-dir> <out.json>  (validated bundle for the sync Lambda)
  fixedstep-content new <course>/<chapter>/<lesson> [${LessonKind.options.join("|")}]
  fixedstep-content init <dir>                       (new content repo skeleton)

content-dir defaults to $CONTENT_DIR, then content-sample. A relative CONTENT_DIR is resolved
from the platform repo root; a relative argument from the directory pnpm was run in.`;

function contentDir(arg: string | undefined): string {
  if (arg) return resolve(process.env.INIT_CWD ?? process.cwd(), arg);
  return resolve(PLATFORM_ROOT, process.env.CONTENT_DIR || "content-sample");
}

function usage(): never {
  console.error(USAGE);
  process.exit(2);
}

async function load(dir: string) {
  const courses = await loadContent(dir);
  const lessonCount = courses.flatMap((c) =>
    c.chaptersLoaded.flatMap((ch) => ch.lessonsLoaded),
  ).length;
  console.log(`loaded ${courses.length} course(s), ${lessonCount} lesson(s) from ${dir}`);
  return courses;
}

/** Loads and validates; returns the courses, or null (after printing why) on errors. */
async function check(dir: string) {
  const courses = await load(dir);
  const findings = await validateContent(courses);
  for (const f of findings) console.log(`${f.level.toUpperCase()} ${f.where}: ${f.message}`);
  return findings.some((f) => f.level === "error") ? null : courses;
}

function openDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return createDb(url, { max: 1 });
}

async function dev(dir: string) {
  const db = openDb();
  let running = false;
  let again = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      // Schema errors stop the sync; failing solutions don't, so a half-written lesson can be
      // previewed. Production publishes still refuse them.
      const courses = await load(dir);
      await syncContent(db, courses);
      const findings = await validateContent(courses);
      for (const f of findings) console.log(`${f.level.toUpperCase()} ${f.where}: ${f.message}`);
      console.log(`synced at ${new Date().toLocaleTimeString()}; watching for changes…`);
    } catch (e) {
      console.error(e instanceof ContentError ? `content error: ${e.message}` : e);
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  };

  let timer: NodeJS.Timeout | undefined;
  watch(dir, { recursive: true }, (_event, file) => {
    if (file && /(^|[/\\])(\.git|node_modules)([/\\]|$)/.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  });
  await run();
  await new Promise(() => {}); // until Ctrl-C
}

async function main() {
  const [command, arg, arg2] = process.argv.slice(2);
  switch (command) {
    case "validate": {
      if (!(await check(contentDir(arg)))) process.exit(1);
      return;
    }
    case "sync": {
      const courses = await check(contentDir(arg));
      if (!courses) process.exit(1);
      const db = openDb();
      try {
        await syncContent(db, courses);
      } finally {
        await db.$client.end();
      }
      console.log("synced");
      return;
    }
    case "dev":
      return dev(contentDir(arg));
    case "bundle": {
      if (!arg || !arg2) usage();
      const courses = await check(contentDir(arg));
      if (!courses) process.exit(1);
      await writeFile(
        resolve(process.env.INIT_CWD ?? process.cwd(), arg2),
        serializeBundle(courses),
      );
      console.log(`wrote ${arg2}`);
      return;
    }
    case "new": {
      if (!arg) usage();
      const kind = LessonKind.safeParse(arg2 ?? "reading");
      if (!kind.success) usage();
      const dir = contentDir(undefined);
      for (const f of await newLesson(dir, arg, kind.data)) console.log(`wrote ${f}`);
      return;
    }
    case "init": {
      if (!arg) usage();
      const dir = resolve(process.env.INIT_CWD ?? process.cwd(), arg);
      const { written, platformRef } = await initContentRepo(dir);
      for (const f of written) console.log(`wrote ${f}`);
      console.log(`\npublish workflow pinned to platform commit ${platformRef}`);
      console.log("(push that commit to GitHub before the content repo's CI runs)");
      return;
    }
    default:
      usage();
  }
}

main().catch((e) => {
  console.error(e instanceof ContentError ? `content error: ${e.message}` : e);
  process.exit(1);
});
