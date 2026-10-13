import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const repoPath = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

/** ESM output for Lambda, with a require() for CJS dependencies. */
export const ESM_BANNER =
  "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);";
