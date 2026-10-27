# Fixedstep content (private)

Course content for [Fixedstep](https://github.com/fixedstep/fixedstep). The platform repo
holds the content CLI, the schema (`@fixedstep/content-schema`) and a small sample course
(`content-sample/`) showing every lesson kind; this repo has the same layout.

```
courses/<course>/course.yaml                 # chapter order; published: false hides the course
courses/<course>/<chapter>/chapter.yaml      # lesson order
courses/<course>/<chapter>/<lesson>/
  lesson.md          # YAML frontmatter + markdown body
  starter.ts         # code/sim: what the student starts with
  tests.ts           # code/sim: visible tests (sent to the browser)
  tests.hidden.ts    # optional, server-only
  solution.ts        # code/sim: server-only; must pass every test
  hints.md           # code/sim, optional: 1–4 hints, server-only
```

## Writing locally

Keep this repo next to a checkout of the platform and point the platform at it, in the
platform's `.env`:

```sh
CONTENT_DIR=../fixedstep-content   # relative to the platform repo root
```

Then, from the platform repo:

```sh
docker compose up                                   # app on http://localhost:5173
scripts/in-docker.sh pnpm content:dev               # re-syncs this repo on every save
pnpm content:new my-course/first-chapter/hello sim  # reading | quiz | code | sim
pnpm content:validate                               # what CI runs
```

`content:dev` syncs even when a solution fails its tests, so you can preview a lesson while
writing it; `content:validate` (and CI) refuse that. Switching back to the browser picks up
the change; if you edited `starter.ts`, use the editor's reset, since your saved draft wins.

## Hints

`hints.md` holds 1–4 markdown hints, ordered from a nudge to nearly the answer, with a line
containing only `---` between them (`---` inside a fenced code block doesn't split). Use `***`
for a horizontal rule and `## Heading` for headings. `<!-- comments -->` are ignored, so a file
holding only a comment means "no hints". Hint *n* unlocks after *n* failed submissions, and the
learner clicks to reveal each one. Hints never reach the browser before they unlock, but the
last one may come close to giving the answer away: it should still not be the solution code.

To draft them with Claude Code, ask something like "Read lesson.md, tests.ts and solution.ts in
`courses/<course>/<chapter>/<lesson>/`; write hints.md with 3 hints from a nudge to a
near-answer, separated by `---`; don't paste the solution", then edit the result by hand.

## Publishing

`.github/workflows/publish.yml`: pull requests validate, `main` publishes to staging, `v*` tags
publish to prod (after approval in the `production` environment). It runs the platform at
`PLATFORM_REF`; bump that in a PR to pick up platform changes.
