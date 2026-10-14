import { existsSync } from "node:fs";
import {
  Annotations,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import type * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { resourceName, type StageConfig, secretName } from "./config";
import { DB_NAME } from "./data-stack";
import { DbAccess } from "./db-access";
import { REPO_ROOT, repoPath } from "./paths";

/** Rewrites extension-less paths to /index.html so the SPA router handles them. */
const SPA_REWRITE = `
function handler(event) {
  var request = event.request;
  if (request.uri.indexOf('.') === -1) request.uri = '/index.html';
  return request;
}`;

/**
 * One origin for everything: CloudFront serves the SPA from S3 and forwards /api/* to an
 * *internal* ALB through a CloudFront VPC origin. The API has no public endpoint, cookies
 * are first-party, and no CORS is needed. (CloudFront, the web bucket and the API live in
 * one stack because the API needs the site URL and CloudFront needs the ALB.)
 */
export class AppStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      config: StageConfig;
      vpc: ec2.IVpc;
      db: rds.DatabaseInstance;
      grader: lambda.IFunction;
    },
  ) {
    super(scope, id, props);
    const { config, vpc, db, grader } = props;
    const stage = config.stage;

    // --- Domain (optional until the hosted zone exists) -------------------------------------
    const zone = config.domain
      ? route53.HostedZone.fromLookup(this, "Zone", { domainName: config.domain.zoneName })
      : undefined;
    const certificate =
      config.domain && zone
        ? new acm.Certificate(this, "Cert", {
            domainName: config.domain.name,
            validation: acm.CertificateValidation.fromDns(zone),
          })
        : undefined;

    // --- Web bucket ---------------------------------------------------------------------------
    const webBucket = new s3.Bucket(this, "Web", {
      bucketName: `${resourceName(stage, "web")}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY, // build output; always reproducible
      autoDeleteObjects: true,
    });

    // --- API secrets ----------------------------------------------------------------------------
    // Fill in the empty values in the console after the first deploy (or with the CLI).
    const appSecret = new secretsmanager.Secret(this, "ApiSecret", {
      secretName: secretName(stage, "api"),
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          GITHUB_CLIENT_ID: "",
          GITHUB_CLIENT_SECRET: "",
          POLAR_ACCESS_TOKEN: "",
          POLAR_WEBHOOK_SECRET: "",
          POLAR_PRO_PRODUCT_ID: "",
        }),
        generateStringKey: "BETTER_AUTH_SECRET",
        passwordLength: 48,
        excludePunctuation: true,
      },
    });
    const dbSecret = db.secret;
    if (!dbSecret) throw new Error("database must have a generated secret");

    // --- API service ------------------------------------------------------------------------------
    const cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: resourceName(stage, "cluster"),
      vpc,
    });

    const api = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Api", {
      cluster,
      serviceName: resourceName(stage, "api"),
      loadBalancerName: resourceName(stage, "api"),
      publicLoadBalancer: false,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      cpu: config.api.cpu,
      memoryLimitMiB: config.api.memoryMiB,
      desiredCount: config.api.desiredCount,
      minHealthyPercent: 100,
      circuitBreaker: { rollback: true },
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(REPO_ROOT, {
          file: "apps/api/Dockerfile",
          platform: Platform.LINUX_ARM64,
          exclude: ["**/node_modules", "**/dist", "**/cdk.out", ".git", "content-sample"],
        }),
        containerPort: 3000,
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: "api",
          logGroup: new logs.LogGroup(this, "ApiLogs", {
            logGroupName: `/fixedstep/${stage}/api`,
            retention: logs.RetentionDays.ONE_MONTH,
          }),
        }),
        environment: {
          NODE_ENV: "production",
          DB_NAME,
          GRADER_MODE: "lambda",
          GRADER_FUNCTION_NAME: grader.functionName,
          POLAR_SERVER: stage === "prod" ? "production" : "sandbox",
        },
        secrets: {
          DB_HOST: ecs.Secret.fromSecretsManager(dbSecret, "host"),
          DB_PORT: ecs.Secret.fromSecretsManager(dbSecret, "port"),
          DB_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
          ...Object.fromEntries(
            [
              "BETTER_AUTH_SECRET",
              "GITHUB_CLIENT_ID",
              "GITHUB_CLIENT_SECRET",
              "POLAR_ACCESS_TOKEN",
              "POLAR_WEBHOOK_SECRET",
              "POLAR_PRO_PRODUCT_ID",
            ].map((k) => [k, ecs.Secret.fromSecretsManager(appSecret, k)]),
          ),
        },
      },
    });
    api.targetGroup.configureHealthCheck({ path: "/health", healthyThresholdCount: 2 });
    api.targetGroup.setAttribute("deregistration_delay.timeout_seconds", "15");
    new DbAccess(this, "DbAccess", db, api.service);
    grader.grantInvoke(api.taskDefinition.taskRole);

    // --- CloudFront ---------------------------------------------------------------------------------
    const distribution = new cloudfront.Distribution(this, "Cdn", {
      comment: resourceName(stage, "cdn"),
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      domainNames: config.domain ? [config.domain.name] : undefined,
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: new cloudfront.Function(this, "SpaRewrite", {
              functionName: resourceName(stage, "spa-rewrite"),
              runtime: cloudfront.FunctionRuntime.JS_2_0,
              code: cloudfront.FunctionCode.fromInline(SPA_REWRITE),
            }),
          },
        ],
      },
      additionalBehaviors: {
        "/api/*": {
          origin: origins.VpcOrigin.withApplicationLoadBalancer(api.loadBalancer, {
            vpcOriginName: resourceName(stage, "api-origin"),
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 80,
            readTimeout: Duration.seconds(30),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });
    // The CloudFront domain is only known once the distribution exists. No cycle: the task
    // definition depends on the distribution, which depends on the ALB, not on the tasks.
    const siteUrl = config.domain
      ? `https://${config.domain.name}`
      : `https://${distribution.distributionDomainName}`;
    api.taskDefinition.defaultContainer?.addEnvironment("BETTER_AUTH_URL", siteUrl);
    api.taskDefinition.defaultContainer?.addEnvironment("WEB_ORIGIN", siteUrl);

    if (zone && config.domain) {
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, "AliasA", { zone, recordName: config.domain.name, target });
      new route53.AaaaRecord(this, "AliasAAAA", { zone, recordName: config.domain.name, target });
    }

    // --- Web deployment (requires `pnpm --filter @fixedstep/web build` before deploy) ----------
    const webDist = repoPath("apps/web/dist");
    if (existsSync(webDist)) {
      new s3deploy.BucketDeployment(this, "WebDeploy", {
        sources: [s3deploy.Source.asset(webDist)],
        destinationBucket: webBucket,
        distribution,
        distributionPaths: ["/*"],
        memoryLimit: 512,
      });
    } else {
      Annotations.of(this).addWarning(
        "apps/web/dist not found; skipping web upload (build the web app first)",
      );
    }

    new CfnOutput(this, "SiteUrl", { value: siteUrl });
    new CfnOutput(this, "ApiSecretName", { value: appSecret.secretName });
  }
}
