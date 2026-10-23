# Let learners rate courses (1–5 stars) and show the average

**Area:** `packages/db/src/schema.ts` (+ new migration in `packages/db/drizzle/`),
`packages/content-schema/src/index.ts`, `apps/api/src/routes/courses.ts`,
`apps/web/src/pages/home/CourseCatalog.tsx`, the course outline view,
`apps/web/src/components/CompletionCard.tsx`
**Origin:** requested 2026-10-23, after the first tagged deploy.

## Problem

There's no way for learners to say how a course was, and no signal in the catalog about which
courses people like.

## Decisions (agreed with the user)

- **Stars only.** An integer from 1 to 5, one rating per user per course. Users can change it
  later. No written reviews; those would be a separate ticket because they need moderation.
- **Who can rate:** a signed-in, **non-guest** user (`user.isAnonymous` is false) who has
  completed **at least one lesson** in the course (a `lesson_progress` row for a lesson in one of
  its chapters). The API enforces this; the UI only hides the widget.
- **Display:** average to **one decimal** (e.g. `4.2`) plus the count, e.g. `4.2 ★ (17)`. Show it
  only once a course has **≥ 3 ratings**. Below that, show nothing in the catalog and
  "Not enough ratings yet" on the course page.
- **Placement:**
  1. Course list/home (`CourseCatalog`): average + count per course.
  2. Course page/outline: average + count, and the widget where the user sets their own rating.
  3. Completion card: prompt the user to rate when they finish the course's last lesson.

## Suggested approach

- **DB:** a `course_ratings` table with `userId` (FK `user`, cascade), `courseId` (FK `courses`,
  cascade), `stars` (integer, plus a `CHECK` that it's between 1 and 5) and `...timestamps`.
  Primary key `(userId, courseId)`. Generate the migration with drizzle-kit, not by hand.
  - Content sync archives courses rather than deleting them, so ratings survive re-syncs. Archived
    or unpublished courses are already filtered out of `GET /courses`.
  - Guests can't rate, so `mergeGuestProgress` doesn't need to change. Confirm that.
- **API:**
  - `PUT /courses/:slug/rating` with body `{ stars }`. Validate it with a zod schema from
    `@fixedstep/content-schema`. Upsert on the PK.
  - Response codes: 401 no user; 403 guest, or no completed lesson in the course;
    404 unknown/unpublished/archived course; 400 bad `stars`.
  - Optional: `DELETE` the same path to clear a rating.
  - Add `rating: { average: number | null, count: number, mine: number | null }` to
    `CourseOutline`.
    - `average` is `null` when `count < 3`. Otherwise round it **on the server**
      (`round(avg(stars)::numeric, 1)`), so every client shows the same number.
    - `mine` is the caller's own rating.
    - Keep the minimum count in one named constant.
  - Compute the aggregates in one grouped query, not one query per course.
  - Build the response field by field, as the other DTOs are.
- **Web:**
  - A small accessible star widget: keyboard-operable, `role="radiogroup"` or the equivalent,
    with labels like "Rate 4 out of 5".
  - Update optimistically, and roll back if the API call fails.
  - Use a read-only variant for the catalog.
  - Show the widget only to users who can rate. A guest who has completed lessons sees a nudge to
    create an account instead (reuse `GuestNudge` if it fits).

## Acceptance criteria

- [ ] Migration adds `course_ratings` with a composite PK, FKs and a 1–5 check constraint.
- [ ] `PUT /courses/:slug/rating` returns the codes listed above (401/403/404/400), and rating
      twice updates the row instead of adding a second one.
- [ ] `GET /courses` includes `rating` per course. `average` is `null` below 3 ratings and
      rounded to one decimal at or above 3. `mine` reflects the caller.
- [ ] The catalog, course page and completion card show the rating as described. The widget
      works from the keyboard.
- [ ] Tests cover:
  - the eligibility rules (guest, no progress, progress in a *different* course)
  - the 3-rating threshold boundary (2 vs 3)
  - rounding (e.g. 4, 4, 5 → 4.3)
  - updating a rating that already exists
- [ ] Lint, typecheck and tests pass (see CLAUDE.md "Running checks").

## Plan

**Flags:** nothing deferred, and no infra or cost changes. Migrations already run at API startup
(`apps/api/src/server.ts` → `runMigrations`), so neither `infra/src/gcp` nor `infra/src/aws`
changes. No cloud SDKs. Ratings never touch XP or `progress.ts`. The one thing outside the
CLAUDE.md check list is the drizzle-kit generate command (step 1). If the sandbox blocks it, the
lead or user runs it.

### Scope

All acceptance criteria. `DELETE /courses/:slug/rating` is optional and not included here (see
Optional).

Answers to the open questions:
- **Course page/outline:** there's no course route. The router has `/`, `/lessons/$lessonId`,
  `/login` and `/reset-password`. A course's outline is drawn in two places: `CourseCard` in
  `CourseCatalog.tsx` (home), and `Outline` in `LessonShell.tsx` (the sidebar on every lesson).
  The **interactive widget goes in the `LessonShell` `Outline` header**. That's the only
  per-course view, and it's where a learner who has done a lesson actually is. The catalog card
  gets the read-only summary. A new `/courses/$slug` page is out of scope.
- **CompletionCard:** it reads the cached `["courses"]` query and calls `findLessonContext`.
  `ctx.next === null` means the lesson just passed is the course's last one. That's already the
  branch that renders "That's the end of …". It has `ctx.course` (soon to include `rating`) and
  `lessonId`. The cache can be stale for the lesson just finished (`useSubmit` invalidates
  `["courses"]` on success), so count `lessonId` as done, the same way `chapterComplete` does.
- **Where `rating` lives:** on `CourseOutline` from `GET /courses`. The catalog, `LessonShell`
  and `CompletionCard` all share the one `["courses"]` query, so a separate endpoint would add
  requests and a second cache to keep in step. One extra grouped query per `GET /courses` is
  cheap.
- **Guests / `mergeGuestProgress`:** confirmed it needs no change. The API rejects guest ratings,
  so a guest never has `course_ratings` rows to move, and the cascade on guest delete removes
  nothing.

### Changes (in order)

1. **`packages/db/src/schema.ts`**: import `check` from `drizzle-orm/pg-core`, then add this after
   `lessonProgress`:
   ```ts
   export const courseRatings = pgTable("course_ratings", {
     userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
     courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
     stars: integer("stars").notNull(),
     ...timestamps,
   }, (t) => [
     primaryKey({ columns: [t.userId, t.courseId] }),
     check("course_ratings_stars_check", sql`${t.stars} between 1 and 5`),
   ]);
   ```
   It's exported automatically through `export * from "./schema"`.
   **Migration:** run `cd packages/db && node_modules/.bin/drizzle-kit generate --name course_ratings`
   (offline, no DB needed). It should produce `packages/db/drizzle/0003_course_ratings.sql`,
   `drizzle/meta/0003_snapshot.json` and a new `_journal.json` entry, the same as the named
   `0001_`/`0002_` migrations. Commit them unedited. Check that the SQL contains the composite
   PK, both FKs with `ON DELETE cascade` and the `CHECK`.

2. **`packages/content-schema/src/index.ts`** (DTO change):
   ```ts
   export const CourseRating = z.object({
     /** Rounded to 1 decimal server-side; null below the minimum count. */
     average: z.number().nullable(),
     count: z.number().int(),
     /** The caller's own rating, if any. */
     mine: z.number().int().min(1).max(5).nullable(),
   });
   export const RateCourseRequest = z.object({ stars: z.number().int().min(1).max(5) });
   ```
   Add `rating: CourseRating` to `CourseOutline`, and export the inferred types.

3. **`apps/api/src/lib/ratings.ts`** (new):
   - `export const MIN_RATINGS_TO_SHOW = 3;`
   - `export async function courseRatings(db: Db, userId: string | null, courseIds?: string[]): Promise<Map<string, CourseRating>>`
     is **one grouped query** over `course_ratings`, `group by course_id`, selecting:
     - `count(*)::int`
     - `round(avg(stars)::numeric, 1)` with `.mapWith(Number)` (numeric comes back as a string)
     - `max(stars) filter (where user_id = ${userId})` for `mine`. Use `sql\`null\`` when
       `userId` is null.

     Apply `average = count >= MIN_RATINGS_TO_SHOW ? avg : null` in TS. Filter on
     `inArray(courseId, courseIds)` when given.
   - `export const NO_RATING: CourseRating = { average: null, count: 0, mine: null };`

4. **`apps/api/src/routes/courses.ts`**:
   - Select `courses.id` as `courseId` in the outline query. Call `courseRatings(db, user?.id ?? null)`
     once, and set `rating: ratings.get(row.courseId) ?? NO_RATING` when the course object is
     built.
   - Build `rating` field by field (`{ average, count, mine }`), not by spreading a row.
   - New `r.put("/courses/:slug/rating", …)`. Checks run in this order:
     1. `!user` → 401.
     2. `user.isAnonymous` → 403 `{ error: "create an account to rate" }`.
     3. `Slug.safeParse(slug)` fails, or no course with that slug that is `published` and has
        `archivedAt` null → 404.
     4. `RateCourseRequest.safeParse(await c.req.json().catch(() => ({})))` fails → 400.
     5. No `lesson_progress` row for this user joined `lessons` → `chapters` with
        `chapters.courseId = course.id` (`limit 1`) → 403 `{ error: "complete a lesson first" }`.
        Don't filter out archived lessons/chapters: earlier completions still count.
     6. Upsert with `db.insert(courseRatings).values({ userId, courseId, stars }).onConflictDoUpdate({ target: [courseRatings.userId, courseRatings.courseId], set: { stars, updatedAt: new Date() } })`.
        Set `updatedAt` explicitly; don't count on `$onUpdate` firing inside an upsert.
     7. Return 200 with `(await courseRatings(db, user.id, [course.id])).get(course.id) ?? NO_RATING`,
        `satisfies CourseRating`.

5. **`apps/web/src/lib/api.ts`**: add
   `rateCourse: (slug: string, stars: number) => request<CourseRating>(`/courses/${slug}/rating`, { method: "PUT", body: JSON.stringify({ stars } satisfies RateCourseRequest) })`.

6. **`apps/web/src/lib/rating.ts`** (new, pure, unit-tested):
   - `formatRating(r: CourseRating): string | null` returns `"4.2 ★ (17)"` (`average.toFixed(1)`),
     or null when `average` is null.
   - `rateAccess(me: Me | undefined, course: CourseOutline, justCompleted?: string): "rate" | "guest" | "none"`.
     It returns `"rate"` for a non-anonymous user with ≥ 1 completed lesson in the course
     (`justCompleted` counts), `"guest"` for an anonymous user with ≥ 1 completed lesson, and
     `"none"` otherwise.
   - `withRating(courses: CourseOutline[], slug: string, rating: CourseRating): CourseOutline[]`
     is an immutable replace, used for the optimistic update and rollback.

7. **`apps/web/src/components/StarRating.tsx`** (new):
   - `RatingSummary({ rating, emptyText?: string })` is the read-only view. It renders
     `formatRating`, or `emptyText` if given, otherwise nothing. Use
     `aria-label="Rated 4.2 out of 5 from 17 ratings"`.
   - `StarRating({ course })` is the widget. Build it as a `<fieldset role="radiogroup">` with
     legend/`aria-label` "Your rating" and five native `<input type="radio" name={`rating-${slug}`}>`.
     Each has a visually hidden label "Rate N out of 5" and a ★ glyph, with
     `checked={course.rating.mine === n}`. Native radios give arrow-key, Tab and Space behaviour
     for free.
   - `useRateCourse()` is a `useMutation` around `api.rateCourse`:
     - `onMutate`: `cancelQueries(["courses"])`, snapshot, then
       `setQueryData(["courses"], withRating(…, { ...rating, mine: stars }))`.
     - `onError`: restore the snapshot and show an inline `role="status"` error.
     - `onSuccess`: `setQueryData` with the server `rating`.

     Arrow keys commit each step. That's acceptable because the PUT is an idempotent upsert.
   - Styles go in `apps/web/src/styles.css` (`.star-rating`, `.rating-summary`) and must include a
     visible `:focus-visible` ring.

8. **`apps/web/src/pages/home/CourseCatalog.tsx`**: render `<RatingSummary rating={course.rating} />`
   under the description in `course-card-head`. It shows nothing below the threshold.

9. **`apps/web/src/components/LessonShell.tsx`** `Outline` header: add
   `<RatingSummary rating={ctx.course.rating} emptyText="Not enough ratings yet" />`, plus a
   `useQuery(["me"])`. Then branch on `rateAccess(me.data, ctx.course)`:
   - `"rate"` → `<StarRating course={ctx.course} />`
   - `"guest"` → `<GuestNudge message="Create a free account to rate this course." />`
   - `"none"` → nothing

10. **`apps/web/src/components/GuestNudge.tsx`**: add an optional `message?: string` prop that
    replaces the default sentence. The link and `isAnonymous` gating stay as they are.

11. **`apps/web/src/components/CompletionCard.tsx`**: in the `!ctx.next` branch, add a
    "Rate {course.title}" prompt with `<StarRating course={ctx.course} />` when
    `rateAccess(me, ctx.course, lessonId) === "rate"`. Guests already see `GuestNudge` under the
    card (`SubmitStatus` in `LessonPage.tsx`), so the card adds nothing for them.

### Tests

Run them with `node_modules/.bin/vitest run --configLoader runner`.

- **`apps/api/src/routes/courses.test.ts`** (new). Follow the setup in `guests.test.ts` and
  `lessons.test.ts`:
  - `createTestDb()` in `beforeAll` (30 s timeout). `content-sample` has only one course, so
    insert rows by hand with the `one()` helper:
    - courses `a` and `b`, both published, each with one chapter and one lesson
    - course `draft` (unpublished)
    - course `old` (published, `archivedAt` set)
  - Users: `member` (progress in `a`), `other` (progress only in `b`), `guest`
    (`isAnonymous: true`, progress in `a`) and `r1..r3` (progress in `a`).
  - Build `new Hono<AppEnv>()` with a middleware that reads `x-user` and sets
    `{ id, isAnonymous: id === "guest" } as never`, or `null`. Then `app.route("/", courseRoutes({ db } as never))`
    and a small `put(user, slug, body)` helper.

  Cases:
  - 401 with no user.
  - 403 for a guest who has progress.
  - 403 for `other` on course `a`: progress in a *different* course.
  - 403 for a user with no progress at all.
  - 404 for an unknown slug, for `draft` and for `old`.
  - 400 for `stars` 0, 6, 3.5, `"4"` and a missing body.
  - Rating twice (`3` then `5`) leaves one row with `stars = 5`, and the response `mine` is 5.
  - Threshold: with 2 ratings, `GET /courses` gives `a.rating` = `{ average: null, count: 2 }`;
    after a 3rd it's non-null.
  - Rounding: 4, 4, 5 → `average: 4.3`.
  - `mine`: the caller's value; `null` for another user and for an anonymous request; `b` keeps
    `NO_RATING`.
  - Guests/sync: deleting a user cascades their rating away. Optionally, re-syncing doesn't
    touch ratings.
- **`apps/web/src/lib/rating.test.ts`** (new, same style as `course-nav.test.ts`) covers:
  - `formatRating`: null, `4.3 ★ (3)` and `4.0 ★ (3)`
  - `rateAccess`: signed out, guest, member with no progress, member with progress, and
    `justCompleted` counting
  - `withRating`: leaves the other courses untouched
- **`apps/web/src/lib/course-nav.test.ts`**: add `rating: { average: null, count: 0, mine: null }`
  to the `course` fixture, or typecheck fails. No new cases.
- No React component tests: `apps/web` has no DOM test setup, so check keyboard use of the
  widget by hand in `pnpm dev`.

Checks, from the repo root:
- `node_modules/.bin/biome check .`
- `node_modules/.bin/tsc -p <pkg> --noEmit` for every package listed in CLAUDE.md. At minimum
  `apps/api`, `apps/web`, `packages/content-schema` and `packages/db`.
- the vitest command above

### Risks

- **Leaks to the browser:** `rating` is built field by field from the aggregate. It only ever
  carries the caller's own `mine`, never other users' ids or stars. Don't put lesson rows or the
  raw `course_ratings` rows in any response.
- **XP:** untouched. The rating endpoint only reads `lesson_progress`; it never writes it.
  `progress.ts` stays the only writer.
- **`harnessRuntime` / cloud SDKs:** not touched.
- **Contract:** `CourseOutline` gets a required field. The API and web change in the same PR,
  so there's no version skew within one deploy. A tab already open during a deploy just gets the
  extra field.
- **Migration:** it's additive (a new table only), so it's safe to run on startup. Commit the
  generated SQL and snapshot without editing them.

### Optional (not in this branch)

- `DELETE /courses/:slug/rating`.
- A `createRateLimiter` on the PUT (for example 30/min). It's an idempotent upsert behind auth,
  so it's low risk without one.
- A `/courses/$slug` page.
- An index on `course_ratings(course_id)`. The PK covers `mine`; the full-table group-by is fine
  at the current size.
