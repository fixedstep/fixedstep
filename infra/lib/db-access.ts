import * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import { DB_PORT } from "./data-stack";

/**
 * Lets `client` reach Postgres by creating the ingress rule in the *client's* stack.
 * `db.connections.allowDefaultPortFrom(client)` would put the rule in the Data stack instead,
 * making Data depend on its consumers: a cross-stack cycle.
 */
export class DbAccess extends Construct {
  constructor(scope: Construct, id: string, db: rds.DatabaseInstance, client: ec2.IConnectable) {
    super(scope, id);
    const dbSg = db.connections.securityGroups[0];
    if (!dbSg) throw new Error("database has no security group");
    for (const [i, sg] of client.connections.securityGroups.entries()) {
      new ec2.CfnSecurityGroupIngress(this, `Ingress${i}`, {
        groupId: dbSg.securityGroupId,
        sourceSecurityGroupId: sg.securityGroupId,
        ipProtocol: "tcp",
        fromPort: DB_PORT,
        toPort: DB_PORT,
        description: `from ${sg.node.path}`,
      });
    }
  }
}
