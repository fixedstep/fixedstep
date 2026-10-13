import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { GITHUB, resourceName, type Stage } from "./config";

/**
 * Account-level, deployed once by hand: lets GitHub Actions deploy without long-lived keys.
 *
 * Trust is keyed on GitHub *environments* (the OIDC subject becomes
 * `repo:<org>/<repo>:environment:<name>` when a job declares one):
 * - platform repo, `staging` environment     → staging deployer (restrict to `main` in GitHub)
 * - platform repo, `production` environment  → prod deployer (add required reviewers + tag rule)
 * - content repo, same environments          → may only upload content bundles
 *
 * Caveat of a single account: both deployers assume the same CDK bootstrap roles, so the
 * stage separation here is by convention + GitHub protections, not by IAM. Moving to one
 * account per stage later fixes that without changing resource names.
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const provider = new iam.OidcProviderNative(this, "GithubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const principal = (sub: string) =>
      new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        StringLike: { "token.actions.githubusercontent.com:sub": sub },
      });

    const subs: Record<Stage, { platform: string; content: string }> = {
      staging: {
        platform: `repo:${GITHUB.platformRepo}:environment:staging`,
        content: `repo:${GITHUB.contentRepo}:environment:staging`,
      },
      prod: {
        platform: `repo:${GITHUB.platformRepo}:environment:production`,
        content: `repo:${GITHUB.contentRepo}:environment:production`,
      },
    };

    for (const stage of ["staging", "prod"] as const) {
      const deployer = new iam.Role(this, `${stage}Deployer`, {
        roleName: resourceName(stage, "github-deployer"),
        assumedBy: principal(subs[stage].platform),
        maxSessionDuration: Duration.hours(1),
      });
      deployer.addToPolicy(
        new iam.PolicyStatement({
          actions: ["sts:AssumeRole"],
          resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
        }),
      );

      const content = new iam.Role(this, `${stage}ContentPublisher`, {
        roleName: resourceName(stage, "github-content-publisher"),
        assumedBy: principal(subs[stage].content),
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
}
