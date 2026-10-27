# Hint ladders for code and sim lessons

**Area:** `packages/content-schema/src/index.ts` (`LESSON_FILES`, DTOs), `packages/db/src/schema.ts`
(`lessons`), `packages/content-cli` (sync, validate, `new`, template), `apps/api/src/routes/lessons.ts`,
`apps/web/src/pages/LessonPage.tsx`, `content-sample/`
**Depends on:** nothing. Pairs with `test-failure-hints`.
**Origin:** user request (2026-10-27). A free alternative to an AI tutor (no per-request model
cost): hints are written ahead of time, optionally drafted with Claude Code while authoring.

## Problem

A learner who is stuck on a `code` or `sim` lesson has only the test output. There is no
graduated help between "tests fail" and giving up.

## Suggested approach

- **Content:** optional `hints.md` next to `lesson.md`, 1–4 hints separated by `---`, ordered
  from a nudge to nearly the answer. Add it to `LESSON_FILES`. `content:validate` rejects empty
  hints, more than 4, and `hints.md` on `reading`/`quiz` lessons. `content:new` for code/sim
  scaffolds an empty-ish `hints.md` with a comment explaining the format.
- **Storage:** server-only `lessons.hints` (`text[]`, default empty), synced by the content CLI.
  Like `hiddenTests` and `solution`, it is never sent wholesale: the final hints can give the
  answer away.
- **Unlocking:** hint *n* becomes available after *n* failed (`failed` or `error`) submissions by
  that user for that lesson, counted server-side from `submissions`. The learner still clicks to
  reveal each one; nothing opens automatically.
- **API:** `SubmitResponse.hintsAvailable` (count unlocked, and total hints) and a
  `GET /lessons/:id/hints` returning only the unlocked hints, built from a content-schema DTO.
  Lesson detail includes the total count so the UI can show "3 hints" before any attempt.
- **UI:** a "Hints" panel beside the results: "Hint 1 of 3 — Show"; locked ones say "unlocks
  after another attempt". Revealed hints stay revealed on reload.
- **Authoring help:** document in the content repo README (and template) how to draft hints
  with Claude Code from `lesson.md`, `tests.ts` and `solution.ts`, then edit by hand.

## Open questions

- Should revealing the last hint reduce the lesson's XP? (Default: no.)
- Should hints reset when the lesson's `contentHash` changes, or keep counting all failures?
  (Default: count all.)

## Acceptance criteria

- [ ] `hints.md` is parsed, validated and synced; lessons without it behave as before.
- [ ] The browser never receives a hint that hasn't been unlocked by server-counted failed
      submissions; tests cover the API at 0, 1 and all-unlocked.
- [ ] Hints, hidden tests, solutions and quiz answers don't leak through any lesson response.
- [ ] The lesson page shows the hint panel and reveals unlocked hints; checked in `pnpm dev`,
      desktop and phone width.
- [ ] `content-sample/` has one lesson with hints; `content:validate` passes.
- [ ] Lint, typecheck and tests pass.
