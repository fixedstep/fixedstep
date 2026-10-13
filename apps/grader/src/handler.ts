import type { GradeResult } from "@fixedstep/content-schema";
import { grade } from "@fixedstep/test-harness";
import { quickjsExecutor } from "@fixedstep/test-harness/quickjs";
import { z } from "zod";

/**
 * Invoked synchronously by the API (never exposed publicly). Runs outside any VPC and has
 * no IAM permissions beyond logging: even a sandbox escape would find nothing to reach.
 */
const GradeEvent = z.object({
  code: z.string().max(100_000),
  visibleTests: z.string(),
  hiddenTests: z.string().nullish(),
  seed: z.number().int().optional(),
});

const execute = quickjsExecutor({ timeoutMs: 3_000, memoryBytes: 64 * 1024 * 1024 });

export async function handler(event: unknown): Promise<GradeResult> {
  const req = GradeEvent.parse(event);
  return grade(req, execute);
}
