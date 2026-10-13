import type { GradeResult } from "@fixedstep/content-schema";
import type { GradeRequest } from "@fixedstep/test-harness";
import type { Env } from "../env";

export type Grader = (req: GradeRequest) => Promise<GradeResult>;

export function createGrader(env: Env): Grader {
  if (env.GRADER_MODE === "local") {
    return async (req) => {
      const { grade } = await import("@fixedstep/test-harness");
      const { quickjsExecutor } = await import("@fixedstep/test-harness/quickjs");
      return grade(req, quickjsExecutor());
    };
  }

  const functionName = env.GRADER_FUNCTION_NAME as string;
  return async (req) => {
    const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
    const client = new LambdaClient({});
    const out = await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: new TextEncoder().encode(JSON.stringify(req)),
      }),
    );
    const body = new TextDecoder().decode(out.Payload);
    if (out.FunctionError) throw new Error(`grader failed: ${body}`);
    return JSON.parse(body) as GradeResult;
  };
}
