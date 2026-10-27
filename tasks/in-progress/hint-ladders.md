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

## Plan

### Scope

This branch covers every acceptance criterion. The lesson-page check at desktop and phone width
is manual in `pnpm dev`, done by the user or the lead. The open questions keep their defaults:
no XP penalty, and all failures count regardless of `contentHash`. **Deferred:** updating the
private content repo (README section, bump `PLATFORM_REF`). That is a follow-up in that repo.
There are no infra or cost changes. The app spec is unchanged, and the migration runs through
the existing migrate step.

**Decisions:**
- **Format.** Hints are split on a line that is exactly `---` (trailing spaces allowed).
  Splits happen only outside fenced code blocks (a ```` ``` ```` or `~~~` toggles "in fence"),
  so `---` inside code is safe. Before splitting, `<!-- … -->` comments outside fences are
  removed and each hint is trimmed. This keeps the separator the task suggested and avoids
  adding a new syntax. The cost is that authors can't use `---` as a horizontal rule or a setext
  `##` underline in hints. The scaffold comment and README say to use `***` and `## Heading`
  instead. A file that is empty or holds only comments means "no hints", which is valid and
  produces no finding, so the scaffold validates cleanly. **Load errors** (`ContentError`, like
  the existing "code lessons need starter.ts"): an empty hint between separators, more than
  `MAX_HINTS = 4` hints, or `hints.md` on a `reading`/`quiz` lesson. These go in the loader and
  not in `validate.ts`, so `content:dev` can't sync a 5-hint lesson either.
- **Rendering.** Hints are rendered as markdown with plain `ReactMarkdown` (no playground or tab
  segments). Like lesson bodies, raw HTML is not rendered.
- **Unlocking.** `unlocked = min(total, count(*))` of `submissions` where the user and lesson
  match and `status in ('failed','error')`. The existing `submissions_user_lesson_idx` index
  covers this query. Submitting requires a user, and signed-out visitors become anonymous
  guests on their first submit, so guests are counted like anyone else. `mergeGuestProgress`
  already moves submissions to the real account, so the count carries over. A visitor with no
  session gets `unlocked: 0`, not a 401. Passing never resets the count.
- **Reveal persistence.** Unlocking is decided by the server. "Revealed" is only a UI choice,
  so it lives in localStorage under `fixedstep:hints-revealed:<lessonId>` (a number, following
  the same pattern as drafts) and is clamped to `unlocked` when read. A DB table would add
  scope without adding security. Hints reveal in order: only hint `revealed + 1` can be shown.
- **Bundle compatibility.** `BUNDLE_VERSION` stays `1`, because the change is additive.
  - Content repo pinned to an old platform: the old loader reads only the files it knows, so
    `hints.md` is silently ignored and nothing breaks. Hints ship once `PLATFORM_REF` is bumped.
  - New bundle sent to an old API: zod objects strip unknown keys (inside `.and()` too), so
    `hints` is dropped and the sync still succeeds.
  - Old bundle sent to a new API: `hints` defaults to `[]`.
- **contentHash.** Hash the `hints.md` text only when the file exists, so existing lessons keep
  their hashes.

### Changes (in order)

1. **`packages/content-schema/src/index.ts`** (DTO changes):
   - Add `hints: "hints.md"` to `LESSON_FILES`, and update the doc comment: optional,
     server-only, unlocked one at a time.
   - `export const MAX_HINTS = 4;`
   - `export const HintStatus = z.object({ total: z.number().int(), unlocked: z.number().int() });`
     plus the type.
   - `export const LessonHints = HintStatus.extend({ hints: z.array(z.string()) });` plus the
     type. `hints.length === unlocked`.
   - Add `hintStatus: HintStatus` to `PublicLesson`, and `hintStatus: HintStatus` to
     `SubmitResponse` (always set; `{0,0}` for lessons without hints). The name is
     `hintStatus` rather than `hints` so nobody mistakes it for the texts.
2. **`packages/db/src/schema.ts`**: on `lessons`, add
   `/** Server-only, like hiddenTests. Only unlocked hints are sent. */ hints: text("hints").array().notNull().default(sql\`'{}'::text[]\`)`.
   Migration `packages/db/drizzle/0004_lesson_hints.sql`
   (`ALTER TABLE "lessons" ADD COLUMN "hints" text[] DEFAULT '{}'::text[] NOT NULL;`) along with
   its snapshot and journal entry. These must be generated, not hand-written:
   `drizzle.config.ts` uses cwd-relative paths and pnpm isn't on the sandbox PATH, so the lead
   or user runs `! pnpm --filter @fixedstep/db generate --name lesson_hints`.
3. **`packages/content-cli/src/hints.ts`** (new):
   `export function parseHints(md: string): { hints: string[]; empty: number[] }`. It strips
   comments outside fences, splits on `---` lines outside fences, and trims. `empty` holds the
   1-based indexes of blank hints. A file that is entirely blank gives `{ hints: [], empty: [] }`.
4. **`packages/content-cli/src/load.ts`**:
   - `LoadedLesson.hints: string[]`.
   - Read `LESSON_FILES.hints` in the existing `Promise.all`.
   - Apply the three `ContentError` rules above, with messages such as
     `${dir}/hints.md: hint 2 is empty`, `…: at most 4 hints (found 5)` and
     `…: hints are only for code/sim lessons`.
   - After the existing hash loop, add `if (hintsRaw !== null) hash.update(hintsRaw)`.
5. **`packages/content-cli/src/bundle.ts`**: add
   `hints: z.array(z.string().min(1)).max(MAX_HINTS).default([])` to the lesson object.
   Add a comment that the default is there so bundles from older platform refs parse.
6. **`packages/content-cli/src/sync.ts`**: add `hints: l.hints` to `values`.
7. **`packages/content-cli/src/scaffold.ts`**: `code` and `sim` also write `LESSON_FILES.hints`
   containing a single HTML comment that explains the format: 1–4 hints, nudge first,
   `---` between them, hint *n* unlocks after *n* failed submissions, markdown allowed, use
   `***` for a rule, delete the file for no hints.
8. **`packages/content-cli/template/README.md`**:
   - Add `hints.md` to the layout block (`# code/sim, optional: 1–4 hints, server-only`).
   - Add a short "Hints" section: the format, the unlock rule, and drafting with Claude Code
     (e.g. "Read lesson.md, tests.ts and solution.ts in <lesson dir>; write hints.md with 3
     hints from nudge to near-answer, separated by `---`; don't paste the solution"), then edit
     by hand.
   - Note that the final hint may nearly give the answer away, but it should not be the code.
9. **`apps/api/src/lib/hints.ts`** (new):
   `export async function hintStatus(db: Db, userId: string | undefined, lesson: { id: string; hints: string[] }): Promise<HintStatus>`.
   It skips the query when `total === 0` or there is no user.
10. **`apps/api/src/routes/lessons.ts`**:
    - GET `/lessons/:id`: add `hintStatus: await hintStatus(db, user?.id, lesson)` to the
      field-by-field body. Never add `lesson.hints`.
    - POST submit: after the submission insert, compute `hintStatus` and add it to the
      response.
    - New `GET /lessons/:id/hints`: uses `readLimit`, `findLesson`, and the same 402 paid check
      as lesson detail. It returns `LessonHints` as
      `{ total, unlocked, hints: lesson.hints.slice(0, unlocked) }`, with the `satisfies` type
      annotation. Add a comment marking the slice as the only place hint text leaves the server.
11. **`apps/web/src/lib/api.ts`**: `hints: (id: string) => request<LessonHints>(\`/lessons/${id}/hints\`)`.
12. **`apps/web/src/components/HintsPanel.tsx`** (new): `HintsPanel({ lessonId, status }: { lessonId: string; status: HintStatus })`.
    - Renders nothing when `total === 0`.
    - Renders `<section className="hints-panel" aria-labelledby=…><h3>Hints</h3><ol>`. Each
      row reads "Hint n of N", then one of:
      - the revealed text, in `<div className="prose"><ReactMarkdown>`;
      - a `Show hint n` button, only for `n === revealed + 1 && n <= unlocked`;
      - a muted "Unlocks after another failed submission" or "…after k more failed submissions".
    - Data comes from `useQuery(["hints", lessonId, status.unlocked], …, { enabled: revealed > 0 })`.
    - Revealed state is in localStorage, using try/catch like the draft helpers.
    - **Avoid the `.test-hint` class and any button name starting with "Submit" or "Run tests".**
      `e2e/specs/test-hints.spec.ts` counts `.test-hint` and clicks `/^Submit/`.
13. **`apps/web/src/pages/LessonPage.tsx`**: in `CodeWorkspace`, render
    `<HintsPanel lessonId={lesson.id} status={submit.data?.hintStatus ?? lesson.hintStatus} />`
    between `<SubmitStatus>` and the visible-tests `<details>`. The two hint features stay
    apart: per-test hints remain inside `ResultsPanel` rows, and the ladder is its own section
    below them.
14. **`apps/web/src/styles.css`**: add `.hints-panel` styles. Rows use `overflow-wrap: anywhere`,
    and `pre` gets `overflow-x: auto` so there is no page-level horizontal scroll at 360px.
15. **`content-sample/courses/2d-fundamentals/game-loop/moving-with-delta-time/hints.md`**: three
    hints. This lesson is free, so guests can try them. For example: (1) frames vary, so what
    should the per-frame step depend on? (2) multiply velocity by `dt` for each axis; (3) build
    and return `{ x: …, y: … }` without assigning to `pos`, with a small fenced snippet. The text
    must not contain "+10 XP", "Lesson complete" or anything else the e2e specs match on.

### Tests

- **`packages/content-cli/src/hints.test.ts`** (new):
  - 1, 3 and 4 hints;
  - `---` inside a ```` ``` ```` fence does not split;
  - `***` stays inside a hint;
  - comments are stripped, and a file with only comments gives `[]`;
  - CRLF and trailing spaces on separators;
  - an empty middle hint is reported in `empty`.
- **`packages/content-cli/src/load.test.ts`** (new, using the same tmp-dir style as
  `scaffold.test.ts`, built with `newLesson`):
  - hints load in order;
  - a lesson without `hints.md` gives `[]` and keeps its contentHash (compare it with a hash
    taken before the file was added);
  - 5 hints, an empty hint, and `hints.md` on a reading lesson each throw `ContentError`.
- **`packages/content-cli/src/scaffold.test.ts`**: the existing "every kind validates" case now
  covers the scaffolded comment-only `hints.md`. Add an assertion that the code/sim lessons
  load with `hints: []`.
- **`packages/content-cli/src/bundle.test.ts`** (new):
  - `parseBundle` accepts a lesson without `hints` and returns `[]`;
  - it rejects 5 hints;
  - a round-trip keeps hints.
- **`apps/api/src/routes/lessons.test.ts`**:
  - Make the test middleware read the user from an `x-user` header, defaulting to `u1`, with
    `none` meaning signed out. Add user `u2` so the existing count assertions are untouched.
    The sample's moving-with-delta-time lesson has 3 hints, and the grader is mocked.
  - **0 unlocked:** GET `/hints` returns `{ total: 3, unlocked: 0, hints: [] }`, and lesson
    detail has `hintStatus` `{3, 0}`.
  - **Unlocking:** a `failed` submit gives response `hintStatus.unlocked === 1`, and GET
    returns exactly `[hint1]`. An `error` submit gives 2. Two more failures give 3 (the
    maximum) and all hints. A `passed` submit doesn't increment.
  - **Signed out:** `x-user: none` gives `unlocked: 0` and `hints: []`.
  - **Paywall:** the paid `bouncing-ball` returns 402 from `/hints` without Pro.
  - **Leak test** (one test, covering every sample lesson through GET detail, plus one submit
    response at 0 unlocked):
    - the serialized JSON contains none of the hint texts, `solution`, or `hiddenTests` source;
    - the `PublicLesson` key set is exactly the expected list;
    - every quiz question's keys are exactly `id, prompt, options`.
- **`apps/api/src/routes/internal.test.ts`**: after the sync, `lessons.hints` for
  moving-with-delta-time has length 3.
- **`packages/content-schema/src/index.test.ts`**: `LessonHints` and `HintStatus` parse
  correctly. `PublicLesson` without `hintStatus` fails to parse.
- **Optional e2e** `e2e/specs/hint-ladder.spec.ts`: the guest flow (fail a submit, show hint 1,
  reload, still shown) and a 360px no-overflow check, mirroring `test-hints.spec.ts`.

Checks, run from the repo root (see CLAUDE.md):
- `node_modules/.bin/biome check .`
- `node_modules/.bin/tsc -p <pkg> --noEmit` for every package listed there
- `node_modules/.bin/vitest run --configLoader runner`
- `content:validate` on the sample. With no pnpm, the sample-sync tests cover this, but the
  lead runs `pnpm content:validate` once.
- e2e: `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts`

### Risks

- **Hint leakage (new server-only field):** `lessons.hints` is read through `findLesson`'s
  full-row select, the same as `hiddenTests` and `solution`. It must only ever leave the server
  through the `slice(0, unlocked)` in `/hints`. The detail and submit bodies are built field by
  field from the DTOs, and the leak test pins down the key sets. Reviewer: check that no
  `...lesson` spread is added anywhere.
- **Unlock integrity:** the count comes only from server-graded `submissions` rows. A grader
  503 inserts no row and so unlocks nothing. Local "Run tests" never counts. Spamming failing
  submits does unlock hints faster, but that is by design and `submitLimit` bounds it.
- **XP/progress:** untouched. There is no penalty, and `progress.ts` is unchanged.
- **`harnessRuntime` and cloud SDKs:** not touched. There are no `infra/` edits.
- **Deploy order:** the migration must run before the new API serves. The existing migrate
  step handles this. Until then, a new API would fail selecting `lessons.hints`.
- **Content-repo downgrade:** if the content repo goes back to an older `PLATFORM_REF`, its
  bundle has no hints, and the next sync clears them. This is acceptable and documented in the
  `bundle.ts` comment.
