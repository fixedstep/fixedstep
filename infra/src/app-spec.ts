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

export type DnsRecord = { name: string; type: string; rrdata: string };

/** What every cloud target returns; `index.ts` exports these as stack outputs. */
export type DeployOutputs = {
  siteUrl: pulumi.Output<string>;
  apiUrl: pulumi.Output<string>;
  /** Records to create at the DNS provider when a domain is configured. */
  dnsRecords?: pulumi.Output<DnsRecord[]>;
  contentSyncToken: pulumi.Output<string>;
  /** Variables for the stage's GitHub environment (see .github/workflows/deploy.yml). */
  github: Record<string, pulumi.Input<string>>;
  ops?: Record<string, pulumi.Input<unknown>>;
};

const PROVIDER_SECRETS = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_PRO_MONTHLY_PRODUCT_ID",
  "POLAR_PRO_YEARLY_PRODUCT_ID",
  "SMTP_URL",
];

/**
 * Generated secrets (created once, kept encrypted in Pulumi state) plus provider credentials
 * from stack config (`pulumi config set --secret <NAME> <value>`). Unset provider secrets are
 * skipped, so the API runs without GitHub login, billing or email until they're filled in.
 * DATABASE_URL is added by the cloud target once the database exists.
 *
 * A generated secret can be pinned the same way (`config set --secret BETTER_AUTH_SECRET …`).
 * Moving to another cloud does that so sessions and the content repo's token keep working.
 */
type GeneratedSecrets = Record<
  "BETTER_AUTH_SECRET" | "GRADER_TOKEN" | "CONTENT_SYNC_TOKEN",
  pulumi.Output<string>
>;

export function appSecrets(): {
  secrets: AppSecrets & GeneratedSecrets;
  dbPassword: pulumi.Output<string>;
} {
  const cfg = new pulumi.Config();
  const generated = (key: string, length = 48) =>
    cfg.getSecret(key) ??
    new random.RandomPassword(key.toLowerCase().replaceAll("_", "-"), { length, special: false })
      .result;
  const secrets: AppSecrets & GeneratedSecrets = {
    BETTER_AUTH_SECRET: generated("BETTER_AUTH_SECRET"),
    GRADER_TOKEN: generated("GRADER_TOKEN"),
    CONTENT_SYNC_TOKEN: generated("CONTENT_SYNC_TOKEN"),
  };
  for (const key of PROVIDER_SECRETS) {
    const value = cfg.getSecret(key);
    if (value) secrets[key] = value;
  }
  return { secrets, dbPassword: generated("DB_PASSWORD", 32) };
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
