import * as pulumi from "@pulumi/pulumi";
import { STAGE_CONFIG, STAGES, type Stage } from "./config";
import { deployGcp } from "./gcp";

// One Pulumi stack per stage (`staging`, `prod`), each in its own cloud project/account.
const stage = pulumi.getStack() as Stage;
if (!STAGES.includes(stage)) {
  throw new Error(`unknown stack "${stage}" (expected ${STAGES.join("|")})`);
}

// Each cloud target maps the cloud-neutral app spec (./app-spec.ts) onto its own services.
const TARGETS = { gcp: deployGcp } as const;
const cloud = new pulumi.Config().get("cloud") ?? "gcp";
const deploy = TARGETS[cloud as keyof typeof TARGETS];
if (!deploy) throw new Error(`unknown cloud "${cloud}" (expected ${Object.keys(TARGETS).join("|")})`);

const out = deploy(STAGE_CONFIG[stage]);

export const siteUrl = out.siteUrl;
export const apiUrl = out.apiUrl;
export const dnsRecords = out.dnsRecords;
/** For the content repo's CONTENT_SYNC_TOKEN secret: `pulumi stack output contentSyncToken --show-secrets`. */
export const contentSyncToken = out.contentSyncToken;
/** GitHub environment variables for .github/workflows/deploy.yml. */
export const github = out.github;
