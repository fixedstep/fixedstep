import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";
import { resourceName, type StageConfig, secretName } from "./config";

export const DB_NAME = "fixedstep";
export const DB_PORT = 5432;

export class DataStack extends Stack {
  readonly db: rds.DatabaseInstance;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { config: StageConfig; vpc: ec2.IVpc },
  ) {
    super(scope, id, props);
    const { config, vpc } = props;

    this.db = new rds.DatabaseInstance(this, "Postgres", {
      instanceIdentifier: resourceName(config.stage, "db"),
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      instanceType: config.db.instanceType,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      databaseName: DB_NAME,
      port: DB_PORT,
      credentials: rds.Credentials.fromGeneratedSecret("fixedstep_admin", {
        secretName: secretName(config.stage, "db-admin"),
      }),
      multiAz: config.db.multiAz,
      allocatedStorage: config.db.allocatedStorageGb,
      maxAllocatedStorage: config.db.allocatedStorageGb * 5,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: Duration.days(config.db.backupRetentionDays),
      deletionProtection: config.protectData,
      removalPolicy: config.protectData ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      enablePerformanceInsights: false,
      cloudwatchLogsExports: ["postgresql"],
    });
  }
}
