import * as dockerBuild from "@pulumi/docker-build";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import type { AppSecrets, ServiceSpec } from "../app-spec";
import { resourceName, type Stage } from "../config";
import { REPO_ROOT, repoPath } from "../paths";

export type ServiceArgs = {
  stage: Stage;
  region: string;
  registry: pulumi.Input<string>;
  spec: ServiceSpec;
  secrets: AppSecrets;
  cpu: number;
  memoryMiB: number;
  minInstances: number;
  maxInstances: number;
  /** Requests per instance (the grader runs one submission at a time). */
  concurrency: number;
  public: boolean;
  /** Routes all egress through this subnet (for Cloud SQL, NAT, and the internal grader). */
  vpc?: { network: pulumi.Input<string>; subnetwork: pulumi.Input<string> };
};

/** One container on Cloud Run: image, its own service account, its secrets, the service. */
export function cloudRunService(
  component: string,
  args: ServiceArgs,
  opts: pulumi.CustomResourceOptions,
) {
  const name = resourceName(args.stage, component);
  const host = `${args.region}-docker.pkg.dev`;

  const image = new dockerBuild.Image(
    `${component}-image`,
    {
      context: { location: REPO_ROOT },
      dockerfile: { location: repoPath(args.spec.dockerfile) },
      platforms: ["linux/amd64"], // Cloud Run has no arm64
      push: true,
      tags: [pulumi.interpolate`${args.registry}/${component}:latest`],
      registries: [
        {
          address: host,
          username: "oauth2accesstoken",
          password: gcp.organizations.getClientConfigOutput().accessToken,
        },
      ],
      buildOnPreview: false,
    },
    opts,
  );

  // No project roles: it can read only the secrets below.
  const account = new gcp.serviceaccount.Account(
    `${component}-sa`,
    { accountId: name, displayName: `${name} (Cloud Run)` },
    opts,
  );

  const secretEnvs = args.spec.secrets.map((key) => {
    const value = args.secrets[key];
    if (!value) throw new Error(`${component}: secret ${key} is not defined`);
    const id = `${component}-${key.toLowerCase().replaceAll("_", "-")}`;
    const secret = new gcp.secretmanager.Secret(
      id,
      { secretId: `${name}-${key.toLowerCase().replaceAll("_", "-")}`, replication: { auto: {} } },
      opts,
    );
    // Referencing the version number (not "latest") rolls out a new revision when a value changes.
    const version = new gcp.secretmanager.SecretVersion(
      id,
      { secret: secret.id, secretData: value },
      opts,
    );
    const access = new gcp.secretmanager.SecretIamMember(
      id,
      {
        secretId: secret.id,
        role: "roles/secretmanager.secretAccessor",
        member: pulumi.interpolate`serviceAccount:${account.email}`,
      },
      opts,
    );
    return {
      access,
      env: {
        name: key,
        valueSource: { secretKeyRef: { secret: secret.secretId, version: version.version } },
      },
    };
  });

  const service = new gcp.cloudrunv2.Service(
    component,
    {
      name,
      location: args.region,
      ingress: args.public ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY",
      // Pulumi-side guard against deleting the service; stateless, so off.
      deletionProtection: false,
      template: {
        serviceAccount: account.email,
        maxInstanceRequestConcurrency: args.concurrency,
        timeout: "30s",
        scaling: { minInstanceCount: args.minInstances, maxInstanceCount: args.maxInstances },
        vpcAccess: args.vpc && {
          networkInterfaces: [args.vpc],
          egress: "ALL_TRAFFIC",
        },
        containers: [
          {
            image: image.ref,
            ports: { containerPort: args.spec.port },
            resources: {
              limits: { cpu: String(args.cpu), memory: `${args.memoryMiB}Mi` },
              cpuIdle: true, // billed per request, not per instance-hour
              startupCpuBoost: true,
            },
            envs: [
              ...Object.entries(args.spec.env).map(([name, value]) => ({ name, value })),
              ...secretEnvs.map((s) => s.env),
            ],
            startupProbe: {
              httpGet: { path: args.spec.healthPath },
              periodSeconds: 2,
              failureThreshold: 30,
            },
          },
        ],
      },
    },
    { ...opts, dependsOn: secretEnvs.map((s) => s.access) },
  );

  // Cloud Run's own IAM check stays open on both: the API is public and does its own auth;
  // the grader is unreachable from the internet (internal ingress) and checks a bearer token,
  // which keeps the API-to-grader call portable (no Google ID tokens in app code).
  new gcp.cloudrunv2.ServiceIamMember(
    `${component}-invoker`,
    { name: service.name, location: args.region, role: "roles/run.invoker", member: "allUsers" },
    opts,
  );

  return { service, account };
}
