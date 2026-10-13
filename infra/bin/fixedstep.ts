import { App, Tags } from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack";
import { APP, REGION, STAGES, type Stage, stackName } from "../lib/config";
import { ContentStack } from "../lib/content-stack";
import { DataStack } from "../lib/data-stack";
import { GithubOidcStack } from "../lib/github-oidc-stack";
import { GraderStack } from "../lib/grader-stack";
import { NetworkStack } from "../lib/network-stack";

const app = new App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION };

// Account-level, deployed once: `pnpm cdk deploy Fixedstep-GithubOidc`
const oidc = new GithubOidcStack(app, "Fixedstep-GithubOidc", {
  stackName: "Fixedstep-GithubOidc",
  env,
});

// Stage stacks: `pnpm cdk deploy -c stage=staging --all`
const stageName = app.node.tryGetContext("stage") as Stage | undefined;
if (stageName) {
  const config = STAGES[stageName];
  if (!config) throw new Error(`unknown stage "${stageName}" (expected staging|prod)`);

  const props = (component: string) => ({
    stackName: stackName(config.stage, component),
    env,
    config,
    terminationProtection: config.protectData,
  });

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

  for (const stack of app.node.children) {
    if (stack !== oidc) Tags.of(stack).add("Stage", config.stage);
  }
}

Tags.of(app).add("App", APP);
