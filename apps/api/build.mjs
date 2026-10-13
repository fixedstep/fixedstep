import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  // Only used when GRADER_MODE=local (dev); production invokes the grader Lambda.
  external: ["quickjs-emscripten"],
  // Some CJS dependencies call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
