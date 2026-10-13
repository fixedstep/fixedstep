import { createDb } from "@fixedstep/db";
import { runMigrations } from "@fixedstep/db/migrate";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createPolarProvider } from "./billing/polar";
import { loadEnv } from "./env";
import { createGrader } from "./lib/grader";

const env = loadEnv();

if (env.RUN_MIGRATIONS) {
  await runMigrations(env.DATABASE_URL, env.MIGRATIONS_DIR);
}

const db = createDb(env.DATABASE_URL);
const app = createApp({
  env,
  db,
  auth: createAuth(env, db),
  grader: createGrader(env),
  billing: createPolarProvider({
    server: env.POLAR_SERVER,
    accessToken: env.POLAR_ACCESS_TOKEN,
    webhookSecret: env.POLAR_WEBHOOK_SECRET,
    proProductId: env.POLAR_PRO_PRODUCT_ID,
  }),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${info.port}`);
});

process.on("SIGTERM", () => {
  server.close(() => void db.$client.end());
});
