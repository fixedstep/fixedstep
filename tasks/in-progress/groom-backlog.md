# Groom the backlog: priority prefixes on todo tasks

**Area:** `tasks/` (todo, in-progress, complete), `tasks/README.md` (new),
`.claude/skills/ship-task/SKILL.md`, `CLAUDE.md` (Git flow line)
**Depends on:** nothing.
**Origin:** user request (2026-10-27). Decisions:
- **Buckets, not ranks:** `<n>_<slug>.md` with `n` from 1 (do next) to 5 (someday). Several
  tasks can share a bucket; adding or reprioritising a task renames only that task.
- **Prefix only in `tasks/todo/`:** the slug is the name without the prefix. `/ship-task` takes
  the slug, the branch is `<slug>`, and the file moves to `tasks/in-progress/<slug>.md` (prefix
  stripped). `in-progress/` and `complete/` keep plain names, so existing links don't change.
- **Order agreed with the user** (below).
- **Also review** the stale `tasks/in-progress/email-provider-setup.md`.

## Problem

`tasks/todo/` is an unordered list of nine tasks, so "what's next" lives only in the user's head.
One task (`email-provider-setup`) has sat in `in-progress/` since before 2026-10-27.

## Agreed priorities

| Bucket | Task | Why |
|---|---|---|
| 1 | `game-engine-course` | The user's top pick. |
| 1 | `ci-timeouts-and-action-bumps` | A hung CI job burns Actions minutes; Node 20 deprecation. |
| 1 | `lesson-body-horizontal-scroll` | Small, user-visible bug. |
| 2 | `e2e-firefox` | Land before the CSS migration so both browsers guard it. |
| 3 | `css-in-ts-vanilla-extract` | Large refactor; after `e2e-firefox`. |
| 3 | `achievements` | Feature; no blockers. |
| 4 | `grader-capacity-tuning` | Needs real traffic to tune against. |
| 4 | `content-publish-limits` | GCP Cloud Run only; production is on AWS. |
| 5 | `reverse-cloud-migration` | Only matters for a move back to GCP. |

## Suggested approach

- **Rename** each todo file with `git mv` to `<bucket>_<slug>.md` per the table.
- **Cross-references:** references by slug (`` `e2e-firefox` ``) stay valid. Fix any reference
  by path (e.g. `tasks/todo/e2e-firefox.md` in `tasks/complete/course-ratings-discoverability.md`)
  to the new path, or change it to the slug. Grep `tasks/`, `CLAUDE.md`, `README.md` and
  `.claude/` for every old path.
- **Document the convention** in a short `tasks/README.md`: folders, the `<n>_<slug>.md` todo
  naming, what 1–5 mean, that the prefix is dropped on start, and how to reprioritise (rename
  one file). Point to it from CLAUDE.md's Git flow line ("named after its `tasks/` slug": say the
  slug excludes the priority prefix).
- **`/ship-task` step 1:** accept a slug or a prefixed name, find `tasks/todo/<n>_<slug>.md`
  (or the unprefixed name, for tasks added before this convention), branch `<slug>`, and
  `git mv` it to `tasks/in-progress/<slug>.md`. Note that a new todo task needs a bucket,
  which the user picks.
- **`email-provider-setup`:** check its acceptance criteria against the code and what's
  deployed. If everything is met, tick and move it to `complete/`. Otherwise tick what's done,
  and either leave it in progress with a note on what's blocking it, or move the remainder
  back to `todo/` with a bucket the user agrees to. Ask the user about anything that can only
  be checked outside the repo (DNS, Postmark, AWS).

## Acceptance criteria

- [ ] Every file in `tasks/todo/` is named `<1–5>_<slug>.md`, with buckets as in the table.
- [ ] No reference to an old todo path remains in `tasks/`, `CLAUDE.md`, `README.md` or `.claude/`.
- [ ] `tasks/README.md` documents the convention; CLAUDE.md links to it and says the slug
      excludes the prefix.
- [ ] `/ship-task` step 1 handles prefixed todo files: the branch and the in-progress file use
      the plain slug.
- [ ] `email-provider-setup` is completed, or its remaining work is split out or explained, as
      agreed with the user.
- [ ] Lint passes (docs-only change).
