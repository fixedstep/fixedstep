# Tasks

One Markdown file per task, in one of three folders:

- `todo/`: not started. Named `<n>_<slug>.md`, where `n` is a priority bucket:
  1 do next, 2 soon, 3 planned, 4 later or waiting on something, 5 someday.
  Several tasks can share a bucket. Order within a bucket isn't meaningful.
- `in-progress/`: on a feature branch. Named `<slug>.md`.
- `complete/`: merged. Named `<slug>.md`.

The **slug** is the file name without `.md` and without the `<n>_` prefix. It names the
branch, and `/ship-task` takes it. Starting a task moves `todo/<n>_<slug>.md` to
`in-progress/<slug>.md`, dropping the prefix.

- **New task:** the user picks its bucket.
- **Reprioritise:** rename that one file (`git mv todo/4_x.md todo/2_x.md`). Nothing else changes.
- **Linking:** refer to todo tasks by slug (`` `e2e-firefox` ``), not by path, because the
  prefix can change.
