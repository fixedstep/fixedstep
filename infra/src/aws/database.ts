import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { DB_NAME, DB_USER } from "../app-spec";
import { resourceName, type StageConfig } from "../config";

/**
 * - `aurora-serverless`: Aurora Serverless v2 that pauses at 0 ACU when idle, so you pay only for
 *   storage. The first query after a pause waits ~15s for it to resume, so this suits staging only.
 * - `rds`: a small always-on RDS instance.
 */
export type AwsDb =
  | { kind: "aurora-serverless"; maxAcu: number; pauseAfterSeconds: number }
  | { kind: "rds"; instanceClass: string };

export function createDatabase(
  config: StageConfig,
  args: {
    db: AwsDb;
    subnetIds: pulumi.Input<string>[];
    securityGroupId: pulumi.Input<string>;
    password: pulumi.Output<string>;
  },
  opts: pulumi.CustomResourceOptions,
) {
  const { stage, protectData } = config;
  const name = resourceName(stage, "db");
  const stateful = { ...opts, protect: protectData };

  const subnetGroup = new aws.rds.SubnetGroup("db", { name, subnetIds: args.subnetIds }, opts);
  // The master user is the app's user (on GCP it's a separate Cloud SQL user). Creating a
  // narrower role would need a Postgres provider that can reach the private network.
  const common = {
    dbSubnetGroupName: subnetGroup.name,
    vpcSecurityGroupIds: [args.securityGroupId],
    storageEncrypted: true,
    backupRetentionPeriod: config.db.backupRetentionDays,
    deletionProtection: protectData,
    skipFinalSnapshot: !protectData,
    finalSnapshotIdentifier: protectData ? `${name}-final` : undefined,
  };

  let host: pulumi.Output<string>;
  if (args.db.kind === "aurora-serverless") {
    const cluster = new aws.rds.Cluster(
      "postgres",
      {
        ...common,
        clusterIdentifier: name,
        engine: "aurora-postgresql",
        engineMode: "provisioned",
        engineVersion: aws.rds.getEngineVersionOutput({
          engine: "aurora-postgresql",
          version: "17",
          latest: true,
        }).versionActual,
        databaseName: DB_NAME,
        masterUsername: DB_USER,
        masterPassword: args.password,
        serverlessv2ScalingConfiguration: {
          minCapacity: 0,
          maxCapacity: args.db.maxAcu,
          secondsUntilAutoPause: args.db.pauseAfterSeconds,
        },
      },
      // Minor upgrades are applied by AWS; don't fight them on the next `up`.
      { ...stateful, ignoreChanges: ["engineVersion"] },
    );
    new aws.rds.ClusterInstance(
      "postgres-1",
      {
        identifier: `${name}-1`,
        clusterIdentifier: cluster.id,
        instanceClass: "db.serverless",
        engine: "aurora-postgresql",
        engineVersion: cluster.engineVersion,
      },
      { ...stateful, ignoreChanges: ["engineVersion"] },
    );
    host = cluster.endpoint;
  } else {
    const instance = new aws.rds.Instance(
      "postgres",
      {
        ...common,
        identifier: name,
        engine: "postgres",
        engineVersion: "17",
        autoMinorVersionUpgrade: true,
        instanceClass: args.db.instanceClass,
        multiAz: config.db.highAvailability,
        storageType: "gp3",
        allocatedStorage: config.db.diskGb,
        maxAllocatedStorage: config.db.diskGb * 5,
        dbName: DB_NAME,
        username: DB_USER,
        password: args.password,
        publiclyAccessible: false,
      },
      stateful,
    );
    host = instance.address;
  }

  // sslmode=require: encrypted, without verifying the RDS CA (private subnets only).
  const url = pulumi.secret(
    pulumi.interpolate`postgres://${DB_USER}:${args.password}@${host}:5432/${DB_NAME}?sslmode=require`,
  );
  return { url };
}
