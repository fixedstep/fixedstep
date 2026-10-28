# Preview unpublished courses in local dev

**Area:** `packages/content-cli` (`cli.ts` `dev`, `sync.ts`), root `package.json` scripts,
README "Writing course content".
**Depends on:** nothing.
**Origin:** user request (2026-10-28), for the `game-engine` playthrough.

## Problem

A course with `published: false` is hidden everywhere: `apps/api/src/routes/courses.ts` and
`lessons.ts` filter on `courses.published = true`, and there is no preview mode. To play an
unfinished course locally, an author has to edit `published: true` into `course.yaml` and
remember not to commit it. There is also no single short command for the local content loop.

## Proposal (designer to confirm)

- **Preview flag in the CLI:** `content:dev` (and optionally `content:sync`) takes `--preview`
  (or a `CONTENT_PREVIEW=1` env var), which syncs every course as `published: true` in the
  local database only. `validate`/`bundle` and the publish workflow ignore it, so staging and
  prod still honour `course.yaml`.
- **Guard:** refuse `--preview` unless `DATABASE_URL` points at a local host (localhost,
  `postgres` on the compose network), so it can never publish a draft to a shared database.
- **Short command:** add a root script, e.g. `pnpm content:preview` →
  `content:dev --preview`, and document it in the README next to `content:dev` (with the
  `scripts/in-docker.sh` form). A Makefile is optional; the repo has none today, so prefer a
  pnpm script unless the user wants `make`.
- **Afterwards:** a normal `content:sync`/`content:dev` puts the real `published` values back.

No API change: the routes keep filtering on `published`, so nothing new reaches learners.

## Acceptance criteria

- [ ] `scripts/in-docker.sh pnpm content:preview` shows `published: false` courses in the local
      app and re-syncs on save.
- [ ] Preview mode is refused against a non-local `DATABASE_URL`; `bundle` and the publish
      workflow are unaffected.
- [ ] Unit tests for the flag (the sync uses `published: true` only in preview) and the guard.
- [ ] README documents the command.
