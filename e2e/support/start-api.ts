// Playwright's API webServer, run by tsx (not by Playwright): resets the e2e database, loads
// content-sample, then runs the real API server with test-only env. Logs go to API_LOG too, so
// specs can read emails sent through the `log` provider.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadContent } from "@fixedstep/content-cli/load";
import { syncContent } from "@fixedstep/content-cli/sync";
import { createDb } from "@fixedstep/db";
import { runMigrations } from "@fixedstep/db/migrate";
import { API_LOG, API_PORT, DATABASE_URL, REPO_ROOT, WEB_URL } from "./env";

const url = new URL(DATABASE_URL);
const name = decodeURIComponent(url.pathname.slice(1));
if (!/^\w+_e2e$/.test(name)) {
  console.error(`refusing to reset "${name}": the e2e database name must end in _e2e`);
  process.exit(1);
}

// Every run starts from an empty database; the dev database is never touched.
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = createDb(adminUrl.toString(), { max: 1 }).$client;
try {
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}

await runMigrations(DATABASE_URL);
const db = createDb(DATABASE_URL, { max: 1 });
try {
  // Always content-sample, whatever CONTENT_DIR says: the specs depend on its slugs.
  await syncContent(db, await loadContent(join(REPO_ROOT, "content-sample")));
} finally {
  await db.$client.end();
}

mkdirSync(dirname(API_LOG), { recursive: true });
writeFileSync(API_LOG, "");
const log = createWriteStream(API_LOG, { flags: "a" });

const env: NodeJS.ProcessEnv = {
  ...process.env,
  PORT: String(API_PORT),
  DATABASE_URL,
  RUN_MIGRATIONS: "false",
  BETTER_AUTH_SECRET: "e2e-only-secret-not-for-any-real-deployment",
  BETTER_AUTH_URL: WEB_URL,
  WEB_ORIGIN: WEB_URL,
  EMAIL_PROVIDER: "log",
  GRADER_MODE: "local",
  // Blank (loadEnv drops empty values), so a developer's shell can't switch on real providers.
  SMTP_URL: "",
  EMAIL_SUBJECT_PREFIX: "",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  CONTENT_SYNC_TOKEN: "",
  WEB_DIR: "",
};
for (const key of Object.keys(env)) if (key.startsWith("POLAR_")) env[key] = "";
// Better Auth's rate limits only apply in production; keep them off.
delete env.NODE_ENV;

// No --env-file: .env isn't read.
const api = spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
  cwd: REPO_ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [api.stdout, api.stderr]) {
  stream.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => api.kill(signal));
}
api.on("exit", (code) => {
  log.end(() => process.exit(code ?? 1));
});
