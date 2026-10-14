import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { GITHUB, resourceName, type StageConfig } from "./config";

interface GithubOidcStackProps extends StackProps {
  config: StageConfig;
}

/**
 * Lets GitHub Actions deploy this stage's account without long-lived keys. Each stage has its
 * own AWS account, so this stack (and the OIDC provider, one per account) exists once per stage.
 * Deployed by hand the first time (CI can't assume a role that doesn't exist yet); after that
 * CI keeps it up to date with the rest of the stage.
 *
 * Trust is keyed on GitHub *environments* (the OIDC subject becomes
 * `repo:<org>/<repo>:environment:<name>` when a job declares one):
 * - platform repo → may assume this account's CDK bootstrap roles
 * - content repo  → may only upload content bundles
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);
    const { stage } = props.config;
    const environment = stage === "prod" ? "production" : "staging";

    const provider = new iam.OidcProviderNative(this, "GithubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const principal = (repo: string) =>
      new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": `repo:${repo}:environment:${environment}`,
        },
      });

    const deployer = new iam.Role(this, "Deployer", {
      roleName: resourceName(stage, "github-deployer"),
      assumedBy: principal(GITHUB.platformRepo),
      maxSessionDuration: Duration.hours(1),
    });
    deployer.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );

    const content = new iam.Role(this, "ContentPublisher", {
      roleName: resourceName(stage, "github-content-publisher"),
      assumedBy: principal(GITHUB.contentRepo),
      maxSessionDuration: Duration.hours(1),
    });
    content.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`arn:aws:s3:::${resourceName(stage, "content-bundles")}-${this.account}/*`],
      }),
    );
  }
}
