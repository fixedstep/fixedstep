import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { apiSpec, appSecrets, graderSpec } from "../app-spec";
import { resourceName, type Stage, type StageConfig } from "../config";
import { createGithubDeployer } from "./ci";
import { createDatabase } from "./database";
import { createNetwork } from "./network";
import { cloudRunService } from "./service";

/** GCP-only sizing; everything else comes from the cloud-neutral StageConfig. */
const DB_TIER: Record<Stage, string> = { staging: "db-f1-micro", prod: "db-g1-small" };

const APIS = [
  "artifactregistry.googleapis.com",
  "compute.googleapis.com",
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "run.googleapis.com",
  "secretmanager.googleapis.com",
  "servicenetworking.googleapis.com",
  "sqladmin.googleapis.com",
  "sts.googleapis.com",
];

export function deployGcp(config: StageConfig) {
  const { stage } = config;
  const gcpConfig = new pulumi.Config("gcp");
  const project = gcpConfig.require("project");
  const region = gcpConfig.require("region");

  const apis = APIS.map(
    (service) =>
      new gcp.projects.Service(service, { project, service, disableOnDestroy: false }),
  );
  const opts: pulumi.CustomResourceOptions = { dependsOn: apis };

  const deployer = createGithubDeployer(stage, project, opts);
  const net = createNetwork(stage, region, opts);
  const { secrets, dbPassword } = appSecrets();
  const db = createDatabase(
    config,
    { region, tier: DB_TIER[stage], network: net.network, peering: net.peering, password: dbPassword },
    opts,
  );

  const repo = new gcp.artifactregistry.Repository(
    "images",
    {
      repositoryId: resourceName(stage, "images"),
      location: region,
      format: "DOCKER",
      // Keep the last few images per service for rollbacks.
      cleanupPolicies: [
        { id: "keep-recent", action: "KEEP", mostRecentVersions: { keepCount: 5 } },
        { id: "delete-old", action: "DELETE", condition: { olderThan: "604800s" } },
      ],
    },
    opts,
  );
  const registry = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${repo.repositoryId}`;

  const grader = cloudRunService(
    "grader",
    {
      stage,
      region,
      registry,
      spec: graderSpec,
      secrets,
      ...config.grader,
      minInstances: 0,
      concurrency: 1,
      public: false,
    },
    opts,
  );

  // Cloud Run URLs are deterministic, so the API can know its own URL before it exists.
  const projectNumber = gcp.organizations.getProjectOutput({ projectId: project }).number;
  const siteUrl = config.domain
    ? pulumi.output(`https://${config.domain}`)
    : pulumi.interpolate`https://${resourceName(stage, "api")}-${projectNumber}.${region}.run.app`;

  const apiSecrets = { ...secrets, DATABASE_URL: db.url };
  const api = cloudRunService(
    "api",
    {
      stage,
      region,
      registry,
      spec: apiSpec(config, { siteUrl, graderUrl: grader.service.uri, secrets: apiSecrets }),
      secrets: apiSecrets,
      ...config.api,
      concurrency: 80,
      public: true,
      vpc: { network: net.network.id, subnetwork: net.subnet.id },
    },
    opts,
  );

  const domain = config.domain
    ? new gcp.cloudrun.DomainMapping(
        "domain",
        {
          name: config.domain,
          location: region,
          metadata: { namespace: project },
          spec: { routeName: api.service.name },
        },
        opts,
      )
    : undefined;

  return {
    siteUrl,
    apiUrl: api.service.uri,
    /** Add these records at your DNS provider when a domain is configured. */
    dnsRecords: domain?.statuses.apply((s) => (s ?? []).flatMap((x) => x.resourceRecords ?? [])),
    contentSyncToken: secrets.CONTENT_SYNC_TOKEN,
    github: {
      GCP_WORKLOAD_IDENTITY_PROVIDER: deployer.provider,
      GCP_DEPLOYER_SERVICE_ACCOUNT: deployer.deployer,
    },
  };
}
