import { fileURLToPath } from "node:url";

// Not 3000/5173, so a dev stack can keep running alongside.
export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

/** Must end in `_e2e`: start-api.ts drops and recreates it on every run. */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://fixedstep:fixedstep@localhost:5432/fixedstep_e2e";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const API_LOG = fileURLToPath(new URL("../.output/api.log", import.meta.url));

export const PASSWORD = "e2e-password-1";

// The specs depend on content-sample: these slugs, the code lesson's solution.ts and the quiz
// options. Editing content-sample can break e2e; update the specs with it.
export const COURSE = "2d-fundamentals";
export const LESSONS = {
  reading: "what-is-a-game-loop",
  code: "moving-with-delta-time",
  paid: "bouncing-ball",
  quiz: "fixed-timestep-quiz",
} as const;
