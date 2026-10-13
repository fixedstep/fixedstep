import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { resourceName, type StageConfig } from "./config";
import { ESM_BANNER, REPO_ROOT, repoPath } from "./paths";

/**
 * Runs untrusted student code in QuickJS/WASM. Deliberately not in the VPC and with no IAM
 * permissions beyond writing its own logs.
 */
export class GraderStack extends Stack {
  readonly fn: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: StackProps & { config: StageConfig }) {
    super(scope, id, props);
    const name = resourceName(props.config.stage, "grader");

    this.fn = new nodejs.NodejsFunction(this, "Grader", {
      functionName: name,
      entry: repoPath("apps/grader/src/handler.ts"),
      handler: "handler",
      projectRoot: REPO_ROOT,
      depsLockFilePath: repoPath("pnpm-lock.yaml"),
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(10),
      logGroup: new logs.LogGroup(this, "Logs", {
        logGroupName: `/aws/lambda/${name}`,
        retention: logs.RetentionDays.ONE_MONTH,
      }),
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node24",
        banner: ESM_BANNER,
        // Ships its .wasm next to the JS; install it as a real node_module instead of bundling.
        nodeModules: ["quickjs-emscripten"],
      },
      // Consider reservedConcurrentExecutions as a cost cap once your account's concurrency
      // quota is raised (new accounts can have a quota as low as 10).
    });
  }
}
