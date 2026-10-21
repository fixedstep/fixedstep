import { createDb } from "@fixedstep/db";
import { runMigrations } from "@fixedstep/db/migrate";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createPolarProvider } from "./billing/polar";
import { createLogProvider } from "./email/log";
import { createSmtpProvider } from "./email/smtp";
import { loadEnv } from "./env";
import { createGrader } from "./lib/grader";
import { deleteStaleGuests } from "./lib/guests";

const env = loadEnv();

if (env.RUN_MIGRATIONS) {
  await runMigrations(env.DATABASE_URL, env.MIGRATIONS_DIR);
}

const db = createDb(env.DATABASE_URL);
const email =
  env.EMAIL_PROVIDER === "smtp"
    ? createSmtpProvider({ url: env.SMTP_URL as string, from: env.EMAIL_FROM as string })
    : createLogProvider();
const app = createApp({
  env,
  db,
  auth: createAuth(env, db, email),
  grader: createGrader(env),
  billing: createPolarProvider({
    server: env.POLAR_SERVER,
    accessToken: env.POLAR_ACCESS_TOKEN,
    webhookSecret: env.POLAR_WEBHOOK_SECRET,
    proProductIds: {
      month: env.POLAR_PRO_MONTHLY_PRODUCT_ID,
      year: env.POLAR_PRO_YEARLY_PRODUCT_ID,
    },
  }),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on :${info.port}`);
});

// Guest cleanup at boot and hourly. Idempotent, so running it on every instance is fine; the
// boot run matters on scale-to-zero platforms, where an instance may never live an hour.
const sweepGuests = () =>
  deleteStaleGuests(db)
    .then((n) => n > 0 && console.log(`[guests] deleted ${n} stale guest(s)`))
    .catch((e) => console.error("[guests] cleanup failed", e));
void sweepGuests();
const sweep = setInterval(sweepGuests, 60 * 60_000);
sweep.unref();

process.on("SIGTERM", () => {
  clearInterval(sweep);
  server.close(() => void db.$client.end());
});
