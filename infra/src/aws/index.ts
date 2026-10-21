import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { apiSpec, appSecrets, type DeployOutputs, graderSpec } from "../app-spec";
import { APP, resourceName, type Stage, type StageConfig } from "../config";
import { createGithubDeployer } from "./ci";
import { type AwsDb, createDatabase } from "./database";
import { createIngress } from "./ingress";
import { createNetwork } from "./network";
import { createOpsTask } from "./ops";
import { fargateService } from "./service";

type TaskSize = { cpu: number; memoryMiB: number };

/**
 * AWS-only sizing; everything else comes from the cloud-neutral StageConfig. Fargate can't scale
 * to zero, so each service keeps at least one task running. Staging is tuned for cost (Spot, the
 * smallest tasks, a database that pauses when idle) and is meant to be destroyed when unused.
 */
const AWS_STAGE: Record<Stage, { spot: boolean; api: TaskSize; grader: TaskSize; db: AwsDb }> = {
  staging: {
    spot: true,
    api: { cpu: 256, memoryMiB: 512 },
    grader: { cpu: 256, memoryMiB: 512 },
    db: { kind: "aurora-serverless", maxAcu: 2, pauseAfterSeconds: 900 },
  },
  prod: {
    spot: false,
    api: { cpu: 512, memoryMiB: 1024 },
    grader: { cpu: 512, memoryMiB: 1024 },
    db: { kind: "rds", instanceClass: "db.t4g.micro" },
  },
};

export function deployAws(config: StageConfig): DeployOutputs {
  const { stage } = config;
  const sizing = AWS_STAGE[stage];
  const opts: pulumi.CustomResourceOptions = {};

  const deployer = createGithubDeployer(stage, opts);
  const net = createNetwork(stage, opts);
  const { secrets, dbPassword } = appSecrets();
  const db = createDatabase(
    config,
    {
      db: sizing.db,
      subnetIds: net.privateSubnetIds,
      securityGroupId: net.sg.db.id,
      password: dbPassword,
    },
    opts,
  );

  const cluster = new aws.ecs.Cluster(
    "cluster",
    {
      name: resourceName(stage, "cluster"),
      settings: [{ name: "containerInsights", value: "disabled" }], // CloudWatch charges extra
    },
    opts,
  );
  const capacityProviders = new aws.ecs.ClusterCapacityProviders(
    "cluster",
    { clusterName: cluster.name, capacityProviders: ["FARGATE", "FARGATE_SPOT"] },
    opts,
  );
  // Private DNS for service discovery, e.g. grader.staging.fixedstep.internal.
  const namespace = new aws.servicediscovery.PrivateDnsNamespace(
    "internal",
    { name: `${stage}.${APP}.internal`, vpc: net.vpc.id },
    opts,
  );
  const shared = {
    stage,
    cluster,
    capacityProviders,
    namespaceId: namespace.id,
    subnetIds: net.publicSubnetIds,
    spot: sizing.spot,
  };

  const grader = fargateService(
    "grader",
    {
      ...shared,
      spec: graderSpec,
      secrets,
      securityGroupId: net.sg.grader.id,
      ...sizing.grader,
      minTasks: 1,
      maxTasks: config.grader.maxInstances,
      discovery: "A",
    },
    opts,
  );
  const graderUrl = pulumi.interpolate`http://${grader.discovery.name}.${namespace.name}:${graderSpec.port}`;

  const ingress = createIngress(
    stage,
    { domain: config.domain, subnetIds: net.publicSubnetIds, securityGroupId: net.sg.vpcLink.id },
    opts,
  );

  const apiSecrets = { ...secrets, DATABASE_URL: db.url };
  const api = fargateService(
    "api",
    {
      ...shared,
      spec: apiSpec(config, { siteUrl: ingress.siteUrl, graderUrl, secrets: apiSecrets }),
      secrets: apiSecrets,
      securityGroupId: net.sg.api.id,
      ...sizing.api,
      minTasks: Math.max(1, config.api.minInstances),
      maxTasks: config.api.maxInstances,
      discovery: "SRV",
    },
    opts,
  );
  ingress.route(api.discovery.arn);

  const databaseUrl = api.params.find((p) => p.key === "DATABASE_URL")?.param;
  if (!databaseUrl) throw new Error("api: DATABASE_URL parameter missing");
  const ops = createOpsTask(stage, { databaseUrl }, opts);

  return {
    siteUrl: ingress.siteUrl,
    apiUrl: ingress.apiUrl,
    dnsRecords: ingress.dnsRecords,
    contentSyncToken: secrets.CONTENT_SYNC_TOKEN,
    github: {
      AWS_DEPLOY_ROLE_ARN: deployer.roleArn,
      AWS_REGION: aws.getRegionOutput().region,
    },
    ops: {
      cluster: cluster.name,
      taskDefinition: ops.taskDefinition.family,
      logGroup: ops.logs.name,
      /** For `aws ecs run-task --network-configuration`: the API's network, so it reaches Postgres. */
      networkConfiguration: pulumi
        .all([pulumi.all(net.publicSubnetIds), net.sg.api.id])
        .apply(
          ([subnets, sg]) =>
            `awsvpcConfiguration={subnets=[${subnets.join(",")}],securityGroups=[${sg}],assignPublicIp=ENABLED}`,
        ),
    },
  };
}
