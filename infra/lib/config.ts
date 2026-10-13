import * as ec2 from "aws-cdk-lib/aws-ec2";

export const APP = "fixedstep";
export const REGION = "us-east-1";
/** GitHub repos allowed to deploy via OIDC. TODO: set to your real org/repo names. */
export const GITHUB = {
  platformRepo: "fixedstep/fixedstep",
  contentRepo: "fixedstep/content",
};

export type Stage = "staging" | "prod";

export interface StageConfig {
  stage: Stage;
  /**
   * Custom domain. Leave undefined until the Route 53 hosted zone exists; the site is then
   * served from the CloudFront default *.cloudfront.net domain.
   */
  domain?: { zoneName: string; name: string };
  vpc: { maxAzs: number; natInstanceType: ec2.InstanceType };
  db: {
    instanceType: ec2.InstanceType;
    multiAz: boolean;
    allocatedStorageGb: number;
    backupRetentionDays: number;
  };
  api: { cpu: number; memoryMiB: number; desiredCount: number };
  /** Keep data (DB snapshot on delete, retained buckets, deletion protection). */
  protectData: boolean;
}

export const STAGES: Record<Stage, StageConfig> = {
  staging: {
    stage: "staging",
    // domain: { zoneName: "fixedstep.dev", name: "staging.fixedstep.dev" },
    vpc: { maxAzs: 2, natInstanceType: new ec2.InstanceType("t4g.nano") },
    db: {
      instanceType: new ec2.InstanceType("t4g.micro"),
      multiAz: false,
      allocatedStorageGb: 20,
      backupRetentionDays: 1,
    },
    api: { cpu: 256, memoryMiB: 512, desiredCount: 1 },
    protectData: false,
  },
  prod: {
    stage: "prod",
    // domain: { zoneName: "fixedstep.dev", name: "fixedstep.dev" },
    vpc: { maxAzs: 2, natInstanceType: new ec2.InstanceType("t4g.micro") },
    db: {
      instanceType: new ec2.InstanceType("t4g.small"),
      multiAz: false, // flip to true once there's revenue (~2x DB cost)
      allocatedStorageGb: 20,
      backupRetentionDays: 7,
    },
    api: { cpu: 512, memoryMiB: 1024, desiredCount: 1 },
    protectData: true,
  },
};

/** `fixedstep-<stage>-<component>`: stage first, so it's visible even when names truncate. */
export const resourceName = (stage: Stage, component: string) => `${APP}-${stage}-${component}`;

/** `Fixedstep-Staging-Network` */
export const stackName = (stage: Stage, component: string) =>
  `Fixedstep-${stage === "prod" ? "Prod" : "Staging"}-${component}`;

/** Secrets Manager / SSM path prefix: `fixedstep/<stage>/...` */
export const secretName = (stage: Stage, name: string) => `${APP}/${stage}/${name}`;
