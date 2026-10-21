import * as gcp from "@pulumi/gcp";
import type * as pulumi from "@pulumi/pulumi";
import { resourceName, type Stage } from "../config";

/**
 * A private VPC for the API's egress. Cloud SQL gets a private IP through Private Service Access,
 * and Cloud NAT gives the API internet egress (OAuth, Polar, SMTP), since all of its traffic
 * goes through the VPC. That routing is also what lets it reach the internal-only grader.
 */
export function createNetwork(stage: Stage, region: string, opts: pulumi.CustomResourceOptions) {
  const network = new gcp.compute.Network(
    "vpc",
    { name: resourceName(stage, "vpc"), autoCreateSubnetworks: false },
    opts,
  );

  const subnet = new gcp.compute.Subnetwork(
    "app",
    {
      name: resourceName(stage, "app"),
      region,
      network: network.id,
      // Cloud Run Direct VPC egress takes IPs from here (at least /26; /24 leaves room to scale).
      ipCidrRange: "10.10.0.0/24",
      // Needed to reach *.run.app (the grader) and Google APIs from inside the VPC.
      privateIpGoogleAccess: true,
    },
    opts,
  );

  const pscRange = new gcp.compute.GlobalAddress(
    "services-range",
    {
      name: resourceName(stage, "services-range"),
      network: network.id,
      purpose: "VPC_PEERING",
      addressType: "INTERNAL",
      prefixLength: 20,
    },
    opts,
  );
  const peering = new gcp.servicenetworking.Connection(
    "services-peering",
    {
      network: network.id,
      service: "servicenetworking.googleapis.com",
      reservedPeeringRanges: [pscRange.name],
    },
    opts,
  );

  const router = new gcp.compute.Router(
    "router",
    { name: resourceName(stage, "router"), region, network: network.id },
    opts,
  );
  new gcp.compute.RouterNat(
    "nat",
    {
      name: resourceName(stage, "nat"),
      region,
      router: router.name,
      natIpAllocateOption: "AUTO_ONLY",
      sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_IP_RANGES",
    },
    opts,
  );

  return { network, subnet, peering };
}
