#!/usr/bin/env -S npx tsx
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb } from "@fixedstep/db";
import { serializeBundle } from "./bundle";
import { ContentError, loadContent } from "./load";
import { syncContent } from "./sync";
import { validateContent } from "./validate";

const USAGE = `usage:
  fixedstep-content validate <content-dir>
  fixedstep-content sync <content-dir>             (needs DATABASE_URL)
  fixedstep-content bundle <content-dir> <out.json> (validated bundle for the sync Lambda)`;

async function main() {
  const [command, dir, out] = process.argv.slice(2);
  if (
    !dir ||
    !["validate", "sync", "bundle"].includes(command ?? "") ||
    (command === "bundle" && !out)
  ) {
    console.error(USAGE);
    process.exit(2);
  }

  const courses = await loadContent(resolve(dir));
  const lessonCount = courses.flatMap((c) =>
    c.chaptersLoaded.flatMap((ch) => ch.lessonsLoaded),
  ).length;
  console.log(`loaded ${courses.length} course(s), ${lessonCount} lesson(s)`);

  const findings = await validateContent(courses);
  for (const f of findings) console.log(`${f.level.toUpperCase()} ${f.where}: ${f.message}`);
  if (findings.some((f) => f.level === "error")) process.exit(1);

  if (command === "bundle") {
    await writeFile(resolve(out as string), serializeBundle(courses));
    console.log(`wrote ${out}`);
  }

  if (command === "sync") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required for sync");
    const db = createDb(url, { max: 1 });
    try {
      await syncContent(db, courses);
    } finally {
      await db.$client.end();
    }
    console.log("synced");
  }
}

main().catch((e) => {
  console.error(e instanceof ContentError ? `content error: ${e.message}` : e);
  process.exit(1);
});
