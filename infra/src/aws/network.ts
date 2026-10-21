import * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import { resourceName, type Stage } from "../config";

const CIDR = "10.20.0.0/16";
const AZ_COUNT = 2; // RDS subnet groups and Aurora need at least two AZs

/**
 * A VPC with, per AZ, a public subnet (the Fargate tasks) and a private one (Postgres, with no
 * route out). There's no NAT, which would cost more than the compute it serves. Instead tasks get
 * public IPs for egress (OAuth, Polar, SMTP, image pulls), and the security groups below admit
 * nothing from the internet. The API is reached only through API Gateway's VPC link, and the
 * grader only from the API.
 */
export function createNetwork(stage: Stage, opts: pulumi.CustomResourceOptions) {
  const tags = (component: string) => ({ Name: resourceName(stage, component) });
  const azs = aws.getAvailabilityZonesOutput({ state: "available" }).names;

  const vpc = new aws.ec2.Vpc(
    "vpc",
    { cidrBlock: CIDR, enableDnsSupport: true, enableDnsHostnames: true, tags: tags("vpc") },
    opts,
  );
  const igw = new aws.ec2.InternetGateway("igw", { vpcId: vpc.id, tags: tags("igw") }, opts);
  const publicRoutes = new aws.ec2.RouteTable(
    "public",
    {
      vpcId: vpc.id,
      routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: igw.id }],
      tags: tags("public"),
    },
    opts,
  );

  const publicSubnets: aws.ec2.Subnet[] = [];
  const privateSubnets: aws.ec2.Subnet[] = [];
  for (let i = 0; i < AZ_COUNT; i++) {
    const availabilityZone = azs.apply((names) => names[i] as string);
    const pub = new aws.ec2.Subnet(
      `public-${i}`,
      { vpcId: vpc.id, cidrBlock: `10.20.${i}.0/24`, availabilityZone, tags: tags(`public-${i}`) },
      opts,
    );
    new aws.ec2.RouteTableAssociation(
      `public-${i}`,
      { subnetId: pub.id, routeTableId: publicRoutes.id },
      opts,
    );
    publicSubnets.push(pub);
    // Private subnets use the VPC's main route table: local traffic only.
    privateSubnets.push(
      new aws.ec2.Subnet(
        `private-${i}`,
        {
          vpcId: vpc.id,
          cidrBlock: `10.20.${10 + i}.0/24`,
          availabilityZone,
          tags: tags(`private-${i}`),
        },
        opts,
      ),
    );
  }

  const allEgress = [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }];
  const vpcLinkSg = new aws.ec2.SecurityGroup(
    "vpc-link",
    {
      name: resourceName(stage, "vpc-link"),
      description: "API Gateway VPC link: forwards to the API inside the VPC",
      vpcId: vpc.id,
      egress: [{ protocol: "tcp", fromPort: 0, toPort: 65535, cidrBlocks: [CIDR] }],
      tags: tags("vpc-link"),
    },
    opts,
  );
  const apiSg = new aws.ec2.SecurityGroup(
    "api",
    {
      name: resourceName(stage, "api"),
      description: "API tasks: reachable only from the VPC link",
      vpcId: vpc.id,
      ingress: [{ protocol: "tcp", fromPort: 0, toPort: 65535, securityGroups: [vpcLinkSg.id] }],
      egress: allEgress,
      tags: tags("api"),
    },
    opts,
  );
  const graderSg = new aws.ec2.SecurityGroup(
    "grader",
    {
      name: resourceName(stage, "grader"),
      description: "Grader tasks: reachable only from the API",
      vpcId: vpc.id,
      ingress: [{ protocol: "tcp", fromPort: 0, toPort: 65535, securityGroups: [apiSg.id] }],
      // Image pulls and log shipping only; student code runs in QuickJS, which has no network.
      egress: allEgress,
      tags: tags("grader"),
    },
    opts,
  );
  const dbSg = new aws.ec2.SecurityGroup(
    "db",
    {
      name: resourceName(stage, "db"),
      description: "Postgres: reachable only from the API (and the one-off ops task)",
      vpcId: vpc.id,
      ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, securityGroups: [apiSg.id] }],
      tags: tags("db"),
    },
    opts,
  );

  return {
    vpc,
    publicSubnetIds: publicSubnets.map((s) => s.id),
    privateSubnetIds: privateSubnets.map((s) => s.id),
    sg: { vpcLink: vpcLinkSg, api: apiSg, grader: graderSg, db: dbSg },
  };
}
