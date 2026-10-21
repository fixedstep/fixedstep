import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { DB_NAME, DB_USER } from "../app-spec";
import { resourceName, type StageConfig } from "../config";

export function createDatabase(
  config: StageConfig,
  args: {
    region: string;
    tier: string;
    network: gcp.compute.Network;
    peering: gcp.servicenetworking.Connection;
    password: pulumi.Output<string>;
  },
  opts: pulumi.CustomResourceOptions,
) {
  const { stage, protectData } = config;

  const instance = new gcp.sql.DatabaseInstance(
    "postgres",
    {
      name: resourceName(stage, "db"),
      region: args.region,
      databaseVersion: "POSTGRES_17",
      // Pulumi's guard; `settings.deletionProtectionEnabled` is GCP's own.
      deletionProtection: protectData,
      settings: {
        // Postgres 16+ defaults to Enterprise Plus, which has no small/shared-core tiers.
        edition: "ENTERPRISE",
        tier: args.tier,
        availabilityType: config.db.highAvailability ? "REGIONAL" : "ZONAL",
        diskType: "PD_SSD",
        diskSize: config.db.diskGb,
        diskAutoresize: true,
        diskAutoresizeLimit: config.db.diskGb * 5,
        deletionProtectionEnabled: protectData,
        ipConfiguration: {
          ipv4Enabled: false,
          privateNetwork: args.network.id,
          sslMode: "ENCRYPTED_ONLY",
        },
        backupConfiguration: {
          enabled: true,
          pointInTimeRecoveryEnabled: protectData,
          backupRetentionSettings: { retainedBackups: config.db.backupRetentionDays },
          transactionLogRetentionDays: protectData ? config.db.backupRetentionDays : undefined,
        },
        insightsConfig: { queryInsightsEnabled: false },
      },
    },
    { ...opts, dependsOn: [args.peering], protect: protectData },
  );

  const database = new gcp.sql.Database(
    "db",
    { name: DB_NAME, instance: instance.name },
    { ...opts, protect: protectData },
  );
  const user = new gcp.sql.User(
    "app-user",
    { name: DB_USER, instance: instance.name, password: args.password },
    opts,
  );

  // sslmode=require: encrypted, without verifying Cloud SQL's per-instance CA (private IP only).
  const url = pulumi.secret(
    pulumi.interpolate`postgres://${user.name}:${args.password}@${instance.privateIpAddress}:5432/${database.name}?sslmode=require`,
  );
  return { instance, url };
}
