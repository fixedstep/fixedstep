import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { GITHUB, resourceName, type Stage } from "../config";

/**
 * Lets GitHub Actions deploy this stage's project without long-lived keys. Each stage has its
 * own project, so this exists once per stage. The first `pulumi up` is run by hand (CI can't
 * use a trust that doesn't exist yet); after that CI keeps it up to date with everything else.
 *
 * Trust is keyed on the GitHub *environment* (the OIDC subject is
 * `repo:<org>/<repo>:environment:<name>` when a job declares one).
 */
export function createGithubDeployer(
  stage: Stage,
  project: string,
  opts: pulumi.CustomResourceOptions,
) {
  const environment = stage === "prod" ? "production" : "staging";

  const pool = new gcp.iam.WorkloadIdentityPool(
    "github",
    { workloadIdentityPoolId: "github", displayName: "GitHub Actions" },
    opts,
  );
  const provider = new gcp.iam.WorkloadIdentityPoolProvider(
    "github",
    {
      workloadIdentityPoolId: pool.workloadIdentityPoolId,
      workloadIdentityPoolProviderId: "github",
      oidc: { issuerUri: "https://token.actions.githubusercontent.com" },
      attributeMapping: { "google.subject": "assertion.sub" },
      attributeCondition: `assertion.sub == "repo:${GITHUB.platformRepo}:environment:${environment}"`,
    },
    opts,
  );

  const deployer = new gcp.serviceaccount.Account(
    "github-deployer",
    { accountId: resourceName(stage, "deployer"), displayName: "GitHub Actions deployer" },
    opts,
  );
  new gcp.serviceaccount.IAMMember(
    "github-deployer-wif",
    {
      serviceAccountId: deployer.name,
      role: "roles/iam.workloadIdentityUser",
      member: pulumi.interpolate`principal://iam.googleapis.com/${pool.name}/subject/repo:${GITHUB.platformRepo}:environment:${environment}`,
    },
    opts,
  );

  // `pulumi up` manages every resource in the project, IAM included, so the deployer needs
  // broad rights. That's acceptable because each stage is its own project and only the
  // GitHub environment (with its review rules) can act as it. The state bucket is granted by
  // hand at bootstrap.
  for (const role of [
    "roles/editor",
    "roles/resourcemanager.projectIamAdmin",
    "roles/run.admin",
    "roles/secretmanager.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.workloadIdentityPoolAdmin",
    "roles/servicenetworking.networksAdmin",
  ]) {
    new gcp.projects.IAMMember(
      `github-deployer-${role.split("/")[1]}`,
      { project, role, member: pulumi.interpolate`serviceAccount:${deployer.email}` },
      opts,
    );
  }

  return { provider: provider.name, deployer: deployer.email };
}
