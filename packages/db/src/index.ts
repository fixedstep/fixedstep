import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, { max: opts.max ?? 10 });
  return drizzle({ client, schema }); // exposes the raw client as db.$client
}

export type Db = ReturnType<typeof createDb>;
