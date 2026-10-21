export const APP = "fixedstep";
/** GitHub repo allowed to deploy (via the cloud's GitHub OIDC trust). */
export const GITHUB = { platformRepo: "fixedstep/fixedstep" };

export type Stage = "staging" | "prod";
export const STAGES = ["staging", "prod"] as const satisfies Stage[];

export type Cloud = "gcp" | "aws";
export const CLOUDS = ["gcp", "aws"] as const satisfies Cloud[];

/**
 * Stacks are named `<cloud>-<stage>` (e.g. `aws-staging`), so each cloud's copy of a stage is
 * brought up and torn down on its own, and a migration can run both side by side.
 */
export function parseStack(name: string): { cloud: Cloud; stage: Stage } {
  const [cloud, stage, ...rest] = name.split("-");
  if (rest.length || !CLOUDS.includes(cloud as Cloud) || !STAGES.includes(stage as Stage)) {
    throw new Error(
      `unknown stack "${name}" (expected <cloud>-<stage>: (${CLOUDS.join("|")})-(${STAGES.join("|")}))`,
    );
  }
  return { cloud: cloud as Cloud, stage: stage as Stage };
}

/** Cloud-neutral stage settings. Instance types/tiers live with each cloud target. */
export interface StageConfig {
  stage: Stage;
  /**
   * Custom domain. Leave undefined until DNS is ready; the site is then served from the
   * platform's default URL.
   */
  domain?: string;
  api: { cpu: number; memoryMiB: number; minInstances: number; maxInstances: number };
  /** Grader instances run one submission at a time; maxInstances is the cost cap. */
  grader: { cpu: number; memoryMiB: number; maxInstances: number };
  db: { highAvailability: boolean; diskGb: number; backupRetentionDays: number };
  /** Keep data (DB deletion protection, point-in-time recovery, `protect` on stateful resources). */
  protectData: boolean;
}

export const STAGE_CONFIG: Record<Stage, StageConfig> = {
  staging: {
    stage: "staging",
    // domain: "staging.fixedstep.com",
    api: { cpu: 1, memoryMiB: 512, minInstances: 0, maxInstances: 2 },
    grader: { cpu: 1, memoryMiB: 512, maxInstances: 5 },
    db: { highAvailability: false, diskGb: 10, backupRetentionDays: 1 },
    protectData: false,
  },
  prod: {
    stage: "prod",
    // domain: "fixedstep.com",
    api: { cpu: 1, memoryMiB: 1024, minInstances: 1, maxInstances: 4 },
    grader: { cpu: 1, memoryMiB: 512, maxInstances: 20 },
    db: {
      highAvailability: false, // flip to true once there's revenue (~2x DB cost)
      diskGb: 20,
      backupRetentionDays: 7,
    },
    protectData: true,
  },
};

/** `fixedstep-<stage>-<component>`: stage first, so it's visible even when names truncate. */
export const resourceName = (stage: Stage, component: string) => `${APP}-${stage}-${component}`;
