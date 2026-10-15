# Sample content

A tiny course used for local development, tests and CI of the public repo. The real course
content lives in a **private** repository with the same layout and is synced to the
production database by that repo's CI (`fixedstep-content sync <dir>`).

Layout:

```
courses/<course>/course.yaml                 # CourseManifest  (chapter order)
courses/<course>/<chapter>/chapter.yaml      # ChapterManifest (lesson order)
courses/<course>/<chapter>/<lesson>/
  lesson.md          # YAML frontmatter (LessonFrontmatter) + markdown body
  starter.ts         # code/sim: what the student starts with
  tests.ts           # code/sim: visible tests (sent to the browser)
  tests.hidden.ts    # optional, server-only
  solution.ts        # code/sim: server-only; must pass every test (checked by CI)
```

Parallel snippets in other languages: consecutive fenced blocks that share a `group` are
rendered as tabs, e.g. ` ```cpp group=loop ` followed by ` ```csharp group=loop `.

Interactive playgrounds: a ` ```ts playground ` block renders as a live editor + canvas
(320 × 240). The code exports `init / update / render` like a sim lesson. It isn't graded or
saved. Top-level numeric constants with a `@range` comment get a slider that rewrites the
literal in place:

```ts
const GRAVITY = 900; // @range 0..2000 step 10
```

Edits are hot-swapped without resetting the game, unless the new `init()` returns a
different state (then it restarts). `validate` checks that every playground compiles and that
`init`/`update` run.
