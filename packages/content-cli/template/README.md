# Fixedstep content (private)

Course content for [Fixedstep](https://github.com/timmendenhall/fixedstep). The platform repo
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

## Publishing

`.github/workflows/publish.yml`: pull requests validate, `main` publishes to staging, `v*` tags
publish to prod (after approval in the `production` environment). It runs the platform at
`PLATFORM_REF`; bump that in a PR to pick up platform changes.
