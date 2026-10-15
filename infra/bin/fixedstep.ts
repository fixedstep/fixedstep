import { App, Tags } from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack";
import { APP, REGION, STAGES, type Stage, stackName } from "../lib/config";
import { ContentStack } from "../lib/content-stack";
import { DataStack } from "../lib/data-stack";
import { GithubOidcStack } from "../lib/github-oidc-stack";
import { GraderStack } from "../lib/grader-stack";
import { NetworkStack } from "../lib/network-stack";

const app = new App();

// Each stage lives in its own AWS account: `pnpm cdk deploy -c stage=staging --all`
const stageName = app.node.tryGetContext("stage") as Stage | undefined;
if (stageName) {
  const config = STAGES[stageName];
  if (!config) throw new Error(`unknown stage "${stageName}" (expected staging|prod)`);

  // Pinning the account makes CDK refuse to deploy with another account's credentials.
  const env = { account: config.account ?? process.env.CDK_DEFAULT_ACCOUNT, region: REGION };
  const props = (component: string) => ({
    stackName: stackName(config.stage, component),
    env,
    config,
    terminationProtection: config.protectData,
  });

  new GithubOidcStack(app, stackName(config.stage, "GithubOidc"), props("GithubOidc"));
  const network = new NetworkStack(app, stackName(config.stage, "Network"), props("Network"));
  const data = new DataStack(app, stackName(config.stage, "Data"), {
    ...props("Data"),
    vpc: network.vpc,
  });
  const grader = new GraderStack(app, stackName(config.stage, "Grader"), props("Grader"));
  new ContentStack(app, stackName(config.stage, "Content"), {
    ...props("Content"),
    vpc: network.vpc,
    db: data.db,
  });
  new AppStack(app, stackName(config.stage, "App"), {
    ...props("App"),
    vpc: network.vpc,
    db: data.db,
    grader: grader.fn,
  });

  Tags.of(app).add("Stage", config.stage);
}

Tags.of(app).add("App", APP);
