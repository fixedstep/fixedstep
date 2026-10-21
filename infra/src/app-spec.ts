import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import type { StageConfig } from "./config";

/**
 * What Fixedstep needs from any cloud. A cloud target (`src/<cloud>/`) maps this onto its own
 * primitives and must provide:
 * - Postgres reachable only from the API, handed to it as DATABASE_URL
 * - the API container, public over HTTPS at `siteUrl` (it serves the SPA too)
 * - the grader container, reachable only from the API, holding no credentials beyond its token
 * - secret storage for every `secrets` entry (never plain env vars in the service definition)
 */
export const DB_NAME = "fixedstep";
export const DB_USER = "fixedstep_app";

export type ServiceSpec = {
  /** Built with the repository root as context. */
  dockerfile: string;
  port: number;
  healthPath: string;
  env: Record<string, pulumi.Input<string>>;
  /** Keys of `AppSecrets` injected as env vars. */
  secrets: string[];
};

export type AppSecrets = Record<string, pulumi.Output<string>>;

const PROVIDER_SECRETS = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_PRO_MONTHLY_PRODUCT_ID",
  "POLAR_PRO_YEARLY_PRODUCT_ID",
  "SMTP_URL",
];

const generated = (name: string, length = 48) =>
  new random.RandomPassword(name, { length, special: false }).result;

/**
 * Generated secrets (created once, kept encrypted in Pulumi state) plus provider credentials
 * from stack config (`pulumi config set --secret <NAME> <value>`). Unset provider secrets are
 * skipped, so the API runs without GitHub login, billing or email until they're filled in.
 * DATABASE_URL is added by the cloud target once the database exists.
 */
export function appSecrets(): { secrets: AppSecrets; dbPassword: pulumi.Output<string> } {
  const cfg = new pulumi.Config();
  const secrets: AppSecrets = {
    BETTER_AUTH_SECRET: generated("better-auth-secret"),
    GRADER_TOKEN: generated("grader-token"),
    CONTENT_SYNC_TOKEN: generated("content-sync-token"),
  };
  for (const key of PROVIDER_SECRETS) {
    const value = cfg.getSecret(key);
    if (value) secrets[key] = value;
  }
  return { secrets, dbPassword: generated("db-password", 32) };
}

export const graderSpec: ServiceSpec = {
  dockerfile: "apps/grader/Dockerfile",
  port: 3001,
  healthPath: "/health",
  env: { NODE_ENV: "production" },
  secrets: ["GRADER_TOKEN"],
};

export function apiSpec(
  config: StageConfig,
  opts: { siteUrl: pulumi.Input<string>; graderUrl: pulumi.Input<string>; secrets: AppSecrets },
): ServiceSpec {
  const emailFrom = new pulumi.Config().get("emailFrom");
  const smtp = Boolean(opts.secrets.SMTP_URL && emailFrom);
  if (!smtp) pulumi.log.warn("SMTP_URL/emailFrom not set; the API will log emails, not send them");

  return {
    dockerfile: "apps/api/Dockerfile",
    port: 3000,
    healthPath: "/health",
    env: {
      NODE_ENV: "production",
      BETTER_AUTH_URL: opts.siteUrl,
      WEB_ORIGIN: opts.siteUrl,
      GRADER_MODE: "http",
      GRADER_URL: opts.graderUrl,
      POLAR_SERVER: config.stage === "prod" ? "production" : "sandbox",
      ...(smtp ? { EMAIL_PROVIDER: "smtp", EMAIL_FROM: emailFrom as string } : {}),
    },
    secrets: Object.keys(opts.secrets),
  };
}
