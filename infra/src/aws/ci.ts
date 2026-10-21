import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { GITHUB, resourceName, type Stage } from "../config";

/**
 * Lets GitHub Actions deploy this stage's account without long-lived keys. Each stage has its
 * own account, so this exists once per stage. The first `pulumi up` is run by hand (CI can't
 * use a trust that doesn't exist yet); after that CI keeps it up to date with everything else.
 *
 * Trust is keyed on the GitHub *environment* (the OIDC subject is
 * `repo:<org>/<repo>:environment:<name>` when a job declares one).
 */
export function createGithubDeployer(stage: Stage, opts: pulumi.CustomResourceOptions) {
  const environment = stage === "prod" ? "production" : "staging";
  const issuer = "token.actions.githubusercontent.com";

  // One per account; if the account already has one, import it instead
  // (`pulumi import aws:iam/openIdConnectProvider:OpenIdConnectProvider github <arn>`).
  const provider = new aws.iam.OpenIdConnectProvider(
    "github",
    { url: `https://${issuer}`, clientIdLists: ["sts.amazonaws.com"] },
    opts,
  );

  const role = new aws.iam.Role(
    "github-deployer",
    {
      name: resourceName(stage, "deployer"),
      description: "GitHub Actions deployer",
      assumeRolePolicy: pulumi.jsonStringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Federated: provider.arn },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                [`${issuer}:aud`]: "sts.amazonaws.com",
                [`${issuer}:sub`]: `repo:${GITHUB.platformRepo}:environment:${environment}`,
              },
            },
          },
        ],
      }),
      maxSessionDuration: 7200, // image builds plus `up` can outlast the 1h default
    },
    opts,
  );

  // `pulumi up` manages every resource in the account, IAM included, so the deployer needs
  // broad rights. That's acceptable because each stage is its own account and only the GitHub
  // environment (with its review rules) can assume it. That also covers the state bucket.
  new aws.iam.RolePolicyAttachment(
    "github-deployer-admin",
    { role: role.name, policyArn: "arn:aws:iam::aws:policy/AdministratorAccess" },
    opts,
  );

  return { roleArn: role.arn };
}
