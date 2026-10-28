# SEO: prerendered public pages, course landing pages, sitemap

**Area:** `apps/api` (publish route, HTML serving), `apps/web` (course page, head tags, shared
render), `packages/db` (prerendered pages storage), `packages/content-schema`.
**Depends on:** nothing. Related: `analytics` (search traffic shows up there).
**Origin:** user request (2026-10-27).

## Problem

The web app is a client-rendered SPA served by the API (`apps/api/src/web.ts`), so every URL
returns the same `index.html`:

- One fixed `<title>`, and no description, canonical, Open Graph/Twitter or JSON-LD tags. Crawlers
  that don't run JS (Bing, DuckDuckGo, AI crawlers) and link-preview bots (Slack, Discord, X,
  iMessage) see an empty page.
- Unknown URLs return 200 with the client-side not-found page (a soft 404).
- There are no course pages: routes are `/`, `/lessons/<uuid>`, `/login`, `/reset-password`.
  Lesson URLs are UUIDs with no keywords.
- No `robots.txt` or sitemap.

## Decisions (user, 2026-10-27)

- **Prerender public pages at content publish**, not inject meta at request time and not full
  SSR. When `POST /internal/content` publishes, the API renders static HTML for every public page
  and stores it. Requests for those URLs are served the stored HTML with the SPA script, so
  every crawler gets the full body and meta tags.
- **New public course landing pages** (`/courses/<slug>`), prerendered: title, description,
  chapters and lesson titles, which lessons are free, price/CTA, rating.
- **Free lesson bodies are indexable**, because they add unique, long-tail content (concept
  explanations, code snippets). Paid lessons get a prerendered page with title + course context
  only (no body), or are left out of the index (designer's call).
- Other public pages (home) are prerendered at publish too, since the catalog comes from content.

## Suggested approach

1. **URLs.** Slug-based, readable URLs: `/courses/<course>` and
   `/courses/<course>/<chapter>/<lesson>` (or `/courses/<course>/<lesson>` if lesson slugs are
   unique per course). Old `/lessons/<uuid>` links 301 to the new URL (or keep working with a
   canonical tag pointing at it). Check that lesson ids are stable across publishes (lessons are
   upserted on `(chapter_id, slug)`).
2. **Shared render.** A pure function per public page that returns the page's body HTML and head
   (title, description, canonical, OG/Twitter, JSON-LD `Course` / `LearningResource`,
   `BreadcrumbList`), run with `react-dom/server` over the same components the SPA uses, or over
   lightweight static versions of them. The SPA uses the same head function on client
   navigation so the two don't drift. Decide hydrate vs. replace on load (hydration mismatch vs.
   a flash). Replacing is simpler if the static markup is close to the rendered page.
3. **Storage and serving.** Store pages in Postgres (e.g. `prerendered_pages(path, html, etag,
   published_at)`), written in the publish transaction. This keeps a single container and stays
   cloud-neutral, with no bucket. `mountWeb` serves the stored page when the path matches,
   otherwise the plain `index.html`. Unknown `/courses/*` paths return a real 404. Keep
   `Cache-Control: no-cache` + ETag. Fall back to plain `index.html` if the DB read fails.
4. **Leaks.** Prerendered HTML is a browser response like any other: build it from
   `@fixedstep/content-schema` public DTOs field by field. Never include `hiddenTests`,
   `solution`, `hints.md` or quiz `answer`s/explanations, and include no paid lesson bodies. Add
   a test that renders every page from a fixture course containing all of those and asserts that
   none of them appear. Escape all content-sourced strings (HTML and JSON-LD).
5. **Fresh data between publishes.** Ratings and prices change without a publish. Either leave
   them out of the static body and JSON-LD (the SPA fills them in), or re-render the affected
   course page when they change. Don't ship a stale `aggregateRating`.
6. **Crawl files.** `robots.txt` (allow public pages; disallow `/api/`, `/login`,
   `/reset-password`; point at the sitemap) and `sitemap.xml`, both generated from the same
   published data. `noindex` on login/reset pages and on staging (staging must never be
   indexed: `X-Robots-Tag: noindex` on the whole stage via config).
7. **Basics.** A per-page `<html lang>`, a default OG image (static asset), a favicon set, and
   canonical URLs from `siteUrl`.

## Open questions for the user

- Exact URL shape (`/courses/<course>/<lesson>` vs. including the chapter).
- Index paid lesson pages as title-only teasers, or leave them out entirely?
- A designed OG image per course, or one site-wide default for now?

## Acceptance criteria

- [ ] Every public page (home, course landing pages, free lessons) is served as prerendered HTML
      with its body, title, description, canonical, OG/Twitter and JSON-LD; verified with JS
      disabled (an e2e test or `curl`).
- [ ] Course landing pages exist at slug URLs and are linked from the catalog. Old
      `/lessons/<uuid>` links still resolve (redirect or canonical).
- [ ] Prerendered pages are regenerated in the publish transaction; no stale rating or price is
      shown.
- [ ] A test proves prerendered HTML never contains solutions, hidden tests, hints, quiz answers
      or paid lesson bodies, and that content strings are escaped.
- [ ] Unknown course and lesson URLs return 404; `robots.txt` and `sitemap.xml` are served;
      staging is `noindex`.
- [ ] Rich results and link previews checked on staging (Google Rich Results test, a Slack or
      Discord unfurl).
