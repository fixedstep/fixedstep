import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { resourceName, type Stage } from "../config";
import { executionRole } from "./service";

/**
 * A Postgres client task definition (psql, pg_dump, pg_restore) for one-off jobs such as a cloud
 * migration's restore (see README "Moving between clouds"). Nothing runs until you
 * `aws ecs run-task` it, with the API's subnets and security group so it can reach the database.
 */
export function createOpsTask(
  stage: Stage,
  args: { databaseUrl: aws.ssm.Parameter },
  opts: pulumi.CustomResourceOptions,
) {
  const name = resourceName(stage, "ops");
  const exec = executionRole(name, "ops", [args.databaseUrl.arn], opts);
  const logs = new aws.cloudwatch.LogGroup(
    "ops",
    { name: `/ecs/${name}`, retentionInDays: 14 },
    opts,
  );
  const taskDefinition = new aws.ecs.TaskDefinition(
    "ops",
    {
      family: name,
      cpu: "256",
      memory: "512",
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      runtimePlatform: { operatingSystemFamily: "LINUX", cpuArchitecture: "X86_64" },
      executionRoleArn: exec.role.arn,
      containerDefinitions: pulumi.jsonStringify([
        {
          name: "ops",
          // ECR Public's Docker Hub mirror: no anonymous pull limits. Alpine's busybox has wget.
          image: "public.ecr.aws/docker/library/postgres:17-alpine",
          essential: true,
          command: ["psql", "-c", "select version()"],
          secrets: [{ name: "DATABASE_URL", valueFrom: args.databaseUrl.arn }],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logs.name,
              "awslogs-region": aws.getRegionOutput().region,
              "awslogs-stream-prefix": "ops",
            },
          },
        },
      ]),
    },
    opts,
  );
  return { taskDefinition, logs };
}
