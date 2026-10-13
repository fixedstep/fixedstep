# Fixedstep — notes for Claude

- pnpm monorepo; internal packages are consumed as TS source (`exports` → `src/*.ts`), no build step.
  Only `apps/api` (esbuild bundle) and `apps/web` (Vite) build.
- `packages/test-harness/src/runtime.ts`: `harnessRuntime` is serialized with `toString()` and run
  inside QuickJS. Keep it self-contained (no imports/outer references) and capture builtins before
  student code runs. `runtime.test.ts` guards this.
- Never send `lessons.hiddenTests`, `lessons.solution` or quiz `answer`s to the browser; browser
  responses are built field-by-field from `@fixedstep/content-schema` DTOs.
- XP/progress are only written after server-side grading (`apps/api/src/lib/progress.ts`).
- Infra naming: `resourceName(stage, x)` → `fixedstep-<stage>-x`; stacks `Fixedstep-<Stage>-X`.
- Course content is private; only `content-sample/` lives here.
