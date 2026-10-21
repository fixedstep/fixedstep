import { z } from "zod";

const Env = z
  .object({
    PORT: z.coerce.number().default(3000),
    /** Either DATABASE_URL, or the DB_* parts (handy when a platform injects them separately). */
    DATABASE_URL: z.string().optional(),
    DB_HOST: z.string().optional(),
    DB_PORT: z.coerce.number().default(5432),
    DB_NAME: z.string().default("fixedstep"),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    MIGRATIONS_DIR: z.string().optional(),
    RUN_MIGRATIONS: z.stringbool().default(true),

    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    WEB_ORIGIN: z.url(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    /** "local" grades in-process (dev); "http" calls the isolated grader service. */
    GRADER_MODE: z.enum(["local", "http"]).default("local"),
    GRADER_URL: z.url().optional(),
    GRADER_TOKEN: z.string().min(32).optional(),

    /** Enables POST /internal/content (the content repo's CI publishes bundles there). */
    CONTENT_SYNC_TOKEN: z.string().min(32).optional(),
    /** Built SPA (apps/web/dist) to serve from this process. Unset in dev (Vite serves it). */
    WEB_DIR: z.string().optional(),

    POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
    POLAR_ACCESS_TOKEN: z.string().optional(),
    POLAR_WEBHOOK_SECRET: z.string().optional(),
    POLAR_PRO_MONTHLY_PRODUCT_ID: z.string().optional(),
    POLAR_PRO_YEARLY_PRODUCT_ID: z.string().optional(),

    /** "log" prints emails (dev, or a stage without a mail provider yet). */
    EMAIL_PROVIDER: z.enum(["log", "smtp"]).default("log"),
    /** `smtps://user:pass@host:465` from any provider (SES, Postmark, Resend, Mailgun...). */
    SMTP_URL: z.string().optional(),
    /** Sender, e.g. `Fixedstep <noreply@fixedstep.com>`; must be on a domain the provider verified. */
    EMAIL_FROM: z.string().optional(),
  })
  .transform((e, ctx) => {
    const databaseUrl =
      e.DATABASE_URL ||
      (e.DB_HOST && e.DB_USER && e.DB_PASSWORD
        ? `postgres://${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD)}@${e.DB_HOST}:${e.DB_PORT}/${e.DB_NAME}?sslmode=require`
        : undefined);
    if (!databaseUrl) {
      ctx.addIssue({ code: "custom", message: "set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD" });
      return z.NEVER;
    }
    if (e.GRADER_MODE === "http" && !(e.GRADER_URL && e.GRADER_TOKEN)) {
      ctx.addIssue({
        code: "custom",
        message: "GRADER_URL and GRADER_TOKEN are required in http mode",
      });
      return z.NEVER;
    }
    if (e.EMAIL_PROVIDER === "smtp" && !(e.SMTP_URL && e.EMAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        message: "SMTP_URL and EMAIL_FROM are required when EMAIL_PROVIDER=smtp",
      });
      return z.NEVER;
    }
    return { ...e, DATABASE_URL: databaseUrl };
  });

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings (common in .env files) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  return Env.parse(cleaned);
}
