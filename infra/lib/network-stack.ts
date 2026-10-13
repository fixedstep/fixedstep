import { Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";
import { resourceName, type StageConfig } from "./config";

export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: StackProps & { config: StageConfig }) {
    super(scope, id, props);
    const { config } = props;

    // fck-nat: a NAT *instance* (~$3-6/mo) instead of a managed NAT Gateway (~$33/mo + data).
    // Fine for this traffic level; swap to ec2.NatProvider.gateway() if it ever bottlenecks.
    const nat = ec2.NatProvider.instanceV2({
      instanceType: config.vpc.natInstanceType,
      machineImage: new ec2.LookupMachineImage({
        name: "fck-nat-al2023-*-arm64-ebs",
        owners: ["568608671756"],
      }),
      defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
    });

    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: resourceName(config.stage, "vpc"),
      maxAzs: config.vpc.maxAzs,
      natGatewayProvider: nat,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "app", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      // Free; keeps S3 traffic (content bundles, ECR layers) off the NAT instance.
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    });
    nat.securityGroup.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.allTraffic());
  }
}
