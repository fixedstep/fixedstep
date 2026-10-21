import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type { DnsRecord } from "../app-spec";
import { resourceName, type Stage } from "../config";

/**
 * Public HTTPS for the API through an API Gateway HTTP API. It forwards every request over a
 * VPC link to the tasks registered in Cloud Map, so there's no load balancer billed by the hour,
 * only per request. Limits to know about: a 30s timeout and a 10 MB request body.
 */
export function createIngress(
  stage: Stage,
  args: {
    domain?: string;
    subnetIds: pulumi.Input<string>[];
    securityGroupId: pulumi.Input<string>;
  },
  opts: pulumi.CustomResourceOptions,
) {
  const name = resourceName(stage, "http");
  const api = new aws.apigatewayv2.Api("http", { name, protocolType: "HTTP" }, opts);
  const link = new aws.apigatewayv2.VpcLink(
    "http",
    { name, subnetIds: args.subnetIds, securityGroupIds: [args.securityGroupId] },
    opts,
  );
  const stageResource = new aws.apigatewayv2.Stage(
    "http",
    {
      apiId: api.id,
      name: "$default",
      autoDeploy: true,
      // A cap on runaway traffic (and the bill): requests per second across the API.
      defaultRouteSettings: { throttlingRateLimit: 100, throttlingBurstLimit: 200 },
    },
    opts,
  );

  /** Routes everything to the Cloud Map service the API's tasks register in (SRV records). */
  const route = (discoveryServiceArn: pulumi.Input<string>) => {
    const integration = new aws.apigatewayv2.Integration(
      "api",
      {
        apiId: api.id,
        integrationType: "HTTP_PROXY",
        integrationMethod: "ANY",
        integrationUri: discoveryServiceArn,
        connectionType: "VPC_LINK",
        connectionId: link.id,
        payloadFormatVersion: "1.0",
        timeoutMilliseconds: 30_000,
      },
      opts,
    );
    new aws.apigatewayv2.Route(
      "default",
      {
        apiId: api.id,
        routeKey: "$default",
        target: pulumi.interpolate`integrations/${integration.id}`,
      },
      opts,
    );
  };

  let siteUrl = api.apiEndpoint;
  let dnsRecords: pulumi.Output<DnsRecord[]> | undefined;
  if (args.domain) {
    const cert = new aws.acm.Certificate(
      "site",
      { domainName: args.domain, validationMethod: "DNS" },
      opts,
    );
    const validationRecords = cert.domainValidationOptions.apply((options) =>
      options.map((o) => ({
        name: o.resourceRecordName,
        type: o.resourceRecordType,
        rrdata: o.resourceRecordValue,
      })),
    );
    // `up` waits below until the certificate is issued, which needs this record in DNS. Stack
    // outputs only appear at the end, so print it now.
    validationRecords.apply((records) => {
      for (const r of records) {
        pulumi.log.info(`certificate validation: create ${r.type} ${r.name} → ${r.rrdata}`);
      }
    });
    const validation = new aws.acm.CertificateValidation(
      "site",
      { certificateArn: cert.arn },
      opts,
    );
    const domainName = new aws.apigatewayv2.DomainName(
      "site",
      {
        domainName: args.domain,
        domainNameConfiguration: {
          certificateArn: validation.certificateArn,
          endpointType: "REGIONAL",
          securityPolicy: "TLS_1_2",
        },
      },
      opts,
    );
    new aws.apigatewayv2.ApiMapping(
      "site",
      { apiId: api.id, domainName: domainName.id, stage: stageResource.id },
      opts,
    );
    siteUrl = pulumi.output(`https://${args.domain}`);
    // An apex domain can't be a CNAME; use your DNS provider's ALIAS/ANAME record instead.
    dnsRecords = pulumi
      .all([validationRecords, domainName.domainNameConfiguration.targetDomainName])
      .apply(([records, target]) => [
        ...records,
        { name: `${args.domain}.`, type: "CNAME", rrdata: `${target}.` },
      ]);
  }

  return { route, siteUrl, apiUrl: api.apiEndpoint, dnsRecords };
}
