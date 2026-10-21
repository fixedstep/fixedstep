import { serve } from "@hono/node-server";
import { createGraderApp } from "./app";

const token = process.env.GRADER_TOKEN;
if (!token || token.length < 32) throw new Error("GRADER_TOKEN (32+ chars) is required");

const server = serve(
  { fetch: createGraderApp({ token }).fetch, port: Number(process.env.PORT ?? 3001) },
  (info) => console.log(`grader listening on :${info.port}`),
);
process.on("SIGTERM", () => server.close());
