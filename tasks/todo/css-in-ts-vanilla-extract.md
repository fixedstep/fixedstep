# Component-scoped styles with vanilla-extract

**Area:** `apps/web` (all components and pages, `src/styles.css`, `src/main.tsx`, `vite.config.ts`),
`e2e/specs/*`
**Depends on:** nothing. Do it between feature tasks: it touches every component, so other web
work in flight will conflict.
**Origin:** user request (2026-10-27). Decisions: vanilla-extract; migrate everything in one task;
theme covers colors + dark mode, a spacing/type scale, and a manual light/dark toggle; e2e
locates elements by role/label/text.

## Problem

All web styling is one global `apps/web/src/styles.css` (~1,340 lines, imported once in
`main.tsx`). Styles aren't tied to the components that use them: deleting a component leaves its
CSS behind, class names can collide, and nothing checks that a class or token exists. The goal
is self-contained components: a component's styles live next to it, are typed, and go away when
it's deleted.

## Suggested approach

- **Setup:** `@vanilla-extract/css` and `@vanilla-extract/vite-plugin` (plus
  `@vanilla-extract/recipes` if variants need it). Zero runtime: CSS is extracted at build time.
  Check the plugin under the Vite worker config and in the e2e web server.
- **Theme (`src/theme.css.ts`):** a typed contract (`createThemeContract`) with:
  - colors: the ~20 current CSS variables (`--bg`, `--surface`, `--text`, `--muted`, `--border`,
    `--accent`, `--accent-text`, `--ok`, `--bad`, `--code-bg`, …) with light and dark values;
  - a spacing scale, font sizes/line heights, and radii, replacing raw px values;
  - dark mode: follow `prefers-color-scheme` by default, overridable by the toggle.
- **Manual theme toggle:** light / dark / system, in the header. Stored per viewer in
  localStorage (wrapped in try/catch), applied before first paint to avoid a flash (small inline
  script or a class on `<html>`), and keeps `color-scheme` in step. Separate from the code
  editor's own theme picker (`EditorThemePicker`); decide whether "system" for the editor should
  follow the site theme.
- **Migration (all at once):** each component/page gets a `Name.css.ts` next to it with only its
  styles; shared bits (buttons, prose, muted text, layout primitives) become small shared style
  modules or components rather than global classes. `styles.css` shrinks to a minimal global
  layer (reset, `body`, element defaults for markdown `.prose` content) via `globalStyle`, or is
  deleted. Keep markup and behaviour unchanged.
- **Content-rendered markup:** `Markdown.tsx` renders author HTML (headings, code, tables), which
  can't carry generated class names; style it with `globalStyle` scoped under the prose
  container class.
- **E2E:** move specs off class selectors (`.test-hint`, `.star-rating`, `.rating-summary`,
  `.lesson-bar`, `#course-outline .star-rating`, …) to role/label/text locators; add
  `data-testid` only where no accessible handle exists.
- **Visual check:** compare before/after screenshots of the main pages at 360, 768 and 1280px,
  light and dark, so the migration doesn't change the look.

## Acceptance criteria

- [ ] vanilla-extract builds in `vite dev`, `vite build` and the e2e web server; no runtime CSS-in-JS.
- [ ] Every component and page has its styles in a co-located `*.css.ts`; deleting a component's
      files removes its CSS (no leftover rules in a global sheet).
- [ ] Colors, spacing, type scale and radii come from the typed theme; no raw hex colors in
      component styles.
- [ ] Light/dark/system toggle in the UI, persisted per viewer, no flash of the wrong theme on load;
      system follows `prefers-color-scheme`.
- [ ] Global CSS is limited to reset/base and markdown prose styling.
- [ ] E2E specs use role/label/text (or `data-testid`) locators, not class selectors; all pass.
- [ ] Before/after screenshots at 360/768/1280px, light and dark, show no unintended changes;
      phone width has no horizontal page scroll (see `lesson-body-horizontal-scroll`).
- [ ] Lint, typecheck and tests pass.
