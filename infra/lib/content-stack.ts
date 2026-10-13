import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import type { Construct } from "constructs";
import { resourceName, type StageConfig } from "./config";
import { DB_NAME } from "./data-stack";
import { ESM_BANNER, REPO_ROOT, repoPath } from "./paths";

/**
 * Private content pipeline: the content repo's CI uploads a validated bundle
 * (`fixedstep-content bundle`) to this bucket; an in-VPC Lambda syncs it into Postgres.
 * The content repo therefore only needs s3:PutObject, never database credentials.
 */
export class ContentStack extends Stack {
  readonly bucket: s3.Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { config: StageConfig; vpc: ec2.IVpc; db: rds.DatabaseInstance },
  ) {
    super(scope, id, props);
    const { config, vpc, db } = props;

    this.bucket = new s3.Bucket(this, "Bundles", {
      bucketName: `${resourceName(config.stage, "content-bundles")}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(90) }],
      removalPolicy: config.protectData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !config.protectData,
    });

    const name = resourceName(config.stage, "content-sync");
    const fn = new nodejs.NodejsFunction(this, "Sync", {
      functionName: name,
      entry: repoPath("packages/content-cli/src/lambda.ts"),
      handler: "handler",
      projectRoot: REPO_ROOT,
      depsLockFilePath: repoPath("pnpm-lock.yaml"),
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.minutes(2),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: { DB_SECRET_ARN: db.secret?.secretArn ?? "", DB_NAME },
      logGroup: new logs.LogGroup(this, "Logs", {
        logGroupName: `/aws/lambda/${name}`,
        retention: logs.RetentionDays.THREE_MONTHS,
      }),
      bundling: { format: nodejs.OutputFormat.ESM, target: "node24", banner: ESM_BANNER },
    });
    db.secret?.grantRead(fn);
    db.connections.allowDefaultPortFrom(fn);
    this.bucket.grantRead(fn);
    this.bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(fn), {
      suffix: ".json",
    });
  }
}
