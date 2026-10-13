import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createDb } from "@fixedstep/db";
import type { S3Event } from "aws-lambda";
import { parseBundle } from "./bundle";
import { syncContent } from "./sync";

/**
 * Runs inside the VPC (the only place that can reach RDS). Triggered when the private
 * content repo's CI uploads a validated bundle to the content bucket.
 */
const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});

async function databaseUrl(): Promise<string> {
  const out = await secrets.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }),
  );
  const s = JSON.parse(out.SecretString ?? "{}") as Record<string, string | number>;
  const user = encodeURIComponent(String(s.username));
  const pass = encodeURIComponent(String(s.password));
  return `postgres://${user}:${pass}@${s.host}:${s.port}/${process.env.DB_NAME}?sslmode=require`;
}

export async function handler(event: S3Event) {
  const db = createDb(await databaseUrl(), { max: 1 });
  try {
    for (const record of event.Records) {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
      const obj = await s3.send(new GetObjectCommand({ Bucket: record.s3.bucket.name, Key: key }));
      const bundle = parseBundle(await (obj.Body?.transformToString() ?? Promise.resolve("{}")));
      await syncContent(db, bundle.courses);
      console.log(`synced ${key}: ${bundle.courses.length} course(s) from ${bundle.createdAt}`);
    }
  } finally {
    await db.$client.end();
  }
}
