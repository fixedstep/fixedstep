import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { resourceName, type Stage } from "../config";

/**
 * A monthly cost budget for the whole account (each stage has its own), emailing
 * `budgetAlertEmail` when actual spend passes 80% or the month's forecast passes 100%. It only
 * alerts; nothing is stopped. Skipped until the email is set:
 * `pnpm infra config set -s aws-<stage> budgetAlertEmail <address>`.
 */
export function createBudget(stage: Stage, limitUsd: number, opts: pulumi.CustomResourceOptions) {
  const email = new pulumi.Config().get("budgetAlertEmail");
  if (!email) {
    pulumi.log.warn("budgetAlertEmail not set; no cost budget alert is created");
    return;
  }
  const notify = (notificationType: "ACTUAL" | "FORECASTED", threshold: number) => ({
    comparisonOperator: "GREATER_THAN",
    notificationType,
    threshold,
    thresholdType: "PERCENTAGE",
    subscriberEmailAddresses: [email],
  });
  return new aws.budgets.Budget(
    "monthly",
    {
      name: resourceName(stage, "monthly"),
      budgetType: "COST",
      timeUnit: "MONTHLY",
      limitAmount: String(limitUsd),
      limitUnit: "USD",
      notifications: [notify("ACTUAL", 80), notify("FORECASTED", 100)],
    },
    opts,
  );
}
