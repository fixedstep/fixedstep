import * as pulumi from "@pulumi/pulumi";
import type { DeployOutputs } from "./app-spec";
import { deployAws } from "./aws";
import { type Cloud, parseStack, STAGE_CONFIG, type StageConfig } from "./config";
import { deployGcp } from "./gcp";

// One Pulumi stack per cloud and stage (`gcp-staging`, `aws-prod`, ...), each in its own cloud
// project/account.
const { cloud, stage } = parseStack(pulumi.getStack());

// Each cloud target maps the cloud-neutral app spec (./app-spec.ts) onto its own services.
const TARGETS: Record<Cloud, (config: StageConfig) => DeployOutputs> = {
  gcp: deployGcp,
  aws: deployAws,
};

const out = TARGETS[cloud](STAGE_CONFIG[stage]);

export const siteUrl = out.siteUrl;
export const apiUrl = out.apiUrl;
export const dnsRecords = out.dnsRecords;
/** For the content repo's CONTENT_SYNC_TOKEN secret: `pulumi stack output contentSyncToken --show-secrets`. */
export const contentSyncToken = out.contentSyncToken;
/** GitHub environment variables for .github/workflows/deploy.yml. */
export const github = out.github;
/** Cloud-specific operational handles (e.g. the AWS one-off Postgres task used for migrations). */
export const ops = out.ops;
