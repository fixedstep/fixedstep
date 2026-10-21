import * as aws from "@pulumi/aws";
import * as dockerBuild from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";
import type { AppSecrets, ServiceSpec } from "../app-spec";
import { resourceName, type Stage } from "../config";
import { REPO_ROOT, repoPath } from "../paths";

export type ServiceArgs = {
  stage: Stage;
  spec: ServiceSpec;
  secrets: AppSecrets;
  cluster: aws.ecs.Cluster;
  /** The cluster's FARGATE/FARGATE_SPOT providers; services can't use them before they exist. */
  capacityProviders: aws.ecs.ClusterCapacityProviders;
  namespaceId: pulumi.Input<string>;
  subnetIds: pulumi.Input<string>[];
  securityGroupId: pulumi.Input<string>;
  /** Fargate CPU units (256 = 0.25 vCPU) and MiB; must be a valid Fargate pairing. */
  cpu: number;
  memoryMiB: number;
  minTasks: number;
  maxTasks: number;
  /** Fargate Spot: ~70% cheaper, but tasks can be reclaimed with two minutes' notice. */
  spot: boolean;
  /**
   * How Cloud Map registers tasks: `A` for callers that resolve the name (the API → grader),
   * `SRV` for API Gateway's VPC link, which needs the port from the record.
   */
  discovery: "A" | "SRV";
};

/**
 * Builds a role that ECS can assume to pull the image, write logs and read the given SSM
 * parameters into the container's environment. Tasks get no task role, so code inside the
 * containers has no AWS credentials at all.
 */
export function executionRole(
  name: string,
  component: string,
  parameterArns: pulumi.Input<string>[],
  opts: pulumi.CustomResourceOptions,
) {
  const role = new aws.iam.Role(
    `${component}-exec`,
    {
      name: `${name}-exec`,
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ecs-tasks.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    },
    opts,
  );
  const attachments: pulumi.Resource[] = [
    new aws.iam.RolePolicyAttachment(
      `${component}-exec`,
      {
        role: role.name,
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
      },
      opts,
    ),
  ];
  if (parameterArns.length) {
    attachments.push(
      new aws.iam.RolePolicy(
        `${component}-exec-secrets`,
        {
          role: role.id,
          policy: pulumi.jsonStringify({
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: "ssm:GetParameters", Resource: parameterArns }],
          }),
        },
        opts,
      ),
    );
  }
  return { role, attachments };
}

/**
 * Stores each secret as an SSM SecureString (standard parameters are free; Secrets Manager
 * charges per secret) under `/fixedstep-<stage>-<component>/<KEY>`.
 */
export function secretParameters(
  name: string,
  component: string,
  keys: string[],
  secrets: AppSecrets,
  opts: pulumi.CustomResourceOptions,
) {
  return keys.map((key) => {
    const value = secrets[key];
    if (!value) throw new Error(`${component}: secret ${key} is not defined`);
    const param = new aws.ssm.Parameter(
      `${component}-${key.toLowerCase().replaceAll("_", "-")}`,
      { name: `/${name}/${key}`, type: "SecureString", value },
      opts,
    );
    return { key, param };
  });
}

/** One container on ECS Fargate: image, secrets, logs, task definition, service, autoscaling. */
export function fargateService(
  component: string,
  args: ServiceArgs,
  opts: pulumi.CustomResourceOptions,
) {
  const name = resourceName(args.stage, component);
  const region = aws.getRegionOutput().region;

  const repo = new aws.ecr.Repository(
    component,
    { name, imageTagMutability: "MUTABLE", forceDelete: true },
    opts,
  );
  // Keep the last few images per service for rollbacks.
  new aws.ecr.LifecyclePolicy(
    component,
    {
      repository: repo.name,
      policy: JSON.stringify({
        rules: [
          {
            rulePriority: 1,
            description: "keep recent",
            selection: { tagStatus: "any", countType: "imageCountMoreThan", countNumber: 5 },
            action: { type: "expire" },
          },
        ],
      }),
    },
    opts,
  );
  const auth = aws.ecr.getAuthorizationTokenOutput({ registryId: repo.registryId });
  const image = new dockerBuild.Image(
    `${component}-image`,
    {
      context: { location: REPO_ROOT },
      dockerfile: { location: repoPath(args.spec.dockerfile) },
      platforms: ["linux/amd64"], // Fargate Spot has no arm64
      push: true,
      tags: [pulumi.interpolate`${repo.repositoryUrl}:latest`],
      registries: [
        {
          address: repo.repositoryUrl.apply((url) => url.split("/")[0] as string),
          username: auth.userName,
          password: auth.password,
        },
      ],
      buildOnPreview: false,
    },
    opts,
  );

  const params = secretParameters(name, component, args.spec.secrets, args.secrets, opts);
  const exec = executionRole(
    name,
    component,
    params.map((p) => p.param.arn),
    opts,
  );
  const logs = new aws.cloudwatch.LogGroup(
    component,
    { name: `/ecs/${name}`, retentionInDays: 14 },
    opts,
  );

  const port = args.spec.port;
  const taskDefinition = new aws.ecs.TaskDefinition(
    component,
    {
      family: name,
      cpu: String(args.cpu),
      memory: String(args.memoryMiB),
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      runtimePlatform: { operatingSystemFamily: "LINUX", cpuArchitecture: "X86_64" },
      executionRoleArn: exec.role.arn,
      containerDefinitions: pulumi.jsonStringify([
        {
          name: component,
          image: image.ref,
          essential: true,
          portMappings: [{ containerPort: port, protocol: "tcp" }],
          environment: [
            ...Object.entries(args.spec.env).map(([key, value]) => ({ name: key, value })),
            // ECS reads secrets only when a task starts. Changing a value bumps its version,
            // which changes this definition and rolls out new tasks.
            {
              name: "SECRETS_VERSION",
              value: pulumi.all(params.map((p) => p.param.version)).apply((v) => v.join(".")),
            },
          ],
          secrets: params.map((p) => ({ name: p.key, valueFrom: p.param.arn })),
          // The images have no curl; Node's fetch does the job.
          healthCheck: {
            command: [
              "CMD",
              "node",
              "-e",
              `fetch('http://127.0.0.1:${port}${args.spec.healthPath}').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))`,
            ],
            interval: 15,
            timeout: 5,
            retries: 3,
            startPeriod: 30,
          },
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logs.name,
              "awslogs-region": region,
              "awslogs-stream-prefix": component,
            },
          },
        },
      ]),
    },
    opts,
  );

  const discovery = new aws.servicediscovery.Service(
    component,
    {
      name: component,
      dnsConfig: {
        namespaceId: args.namespaceId,
        routingPolicy: "MULTIVALUE",
        dnsRecords: [{ type: args.discovery, ttl: 10 }],
      },
      forceDestroy: true,
    },
    opts,
  );

  const service = new aws.ecs.Service(
    component,
    {
      name,
      cluster: args.cluster.arn,
      taskDefinition: taskDefinition.arn,
      desiredCount: args.minTasks,
      capacityProviderStrategies: [
        { capacityProvider: args.spot ? "FARGATE_SPOT" : "FARGATE", weight: 1 },
      ],
      networkConfiguration: {
        subnets: args.subnetIds,
        securityGroups: [args.securityGroupId],
        assignPublicIp: true, // egress without a NAT; the security group blocks all inbound
      },
      serviceRegistries:
        args.discovery === "SRV"
          ? { registryArn: discovery.arn, containerName: component, containerPort: port }
          : { registryArn: discovery.arn },
      deploymentCircuitBreaker: { enable: true, rollback: true },
      deploymentMinimumHealthyPercent: 100,
      deploymentMaximumPercent: 200,
      waitForSteadyState: true,
    },
    {
      ...opts,
      dependsOn: [...exec.attachments, args.capacityProviders],
      // Autoscaling owns the running count after creation.
      ignoreChanges: ["desiredCount"],
    },
  );

  const scaling = {
    serviceNamespace: "ecs",
    scalableDimension: "ecs:service:DesiredCount",
    resourceId: pulumi.interpolate`service/${args.cluster.name}/${service.name}`,
  };
  const target = new aws.appautoscaling.Target(
    component,
    { ...scaling, minCapacity: args.minTasks, maxCapacity: args.maxTasks },
    opts,
  );
  new aws.appautoscaling.Policy(
    component,
    {
      name: `${name}-cpu`,
      policyType: "TargetTrackingScaling",
      serviceNamespace: target.serviceNamespace,
      scalableDimension: target.scalableDimension,
      resourceId: target.resourceId,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: { predefinedMetricType: "ECSServiceAverageCPUUtilization" },
        targetValue: 60,
        scaleOutCooldown: 30,
        scaleInCooldown: 120,
      },
    },
    opts,
  );

  return { service, discovery, params, logs };
}
