import { z } from "zod";

const Env = z
  .object({
    PORT: z.coerce.number().default(3000),
    /** Either DATABASE_URL, or the DB_* parts (how ECS injects the RDS secret). */
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

    GRADER_MODE: z.enum(["local", "lambda"]).default("local"),
    GRADER_FUNCTION_NAME: z.string().optional(),

    POLAR_SERVER: z.enum(["sandbox", "production"]).default("sandbox"),
    POLAR_ACCESS_TOKEN: z.string().optional(),
    POLAR_WEBHOOK_SECRET: z.string().optional(),
    POLAR_PRO_PRODUCT_ID: z.string().optional(),
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
    if (e.GRADER_MODE === "lambda" && !e.GRADER_FUNCTION_NAME) {
      ctx.addIssue({ code: "custom", message: "GRADER_FUNCTION_NAME is required in lambda mode" });
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
