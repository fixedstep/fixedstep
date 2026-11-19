# Header user menu (dropdown)

**Area:** `apps/web/src/components/Layout.tsx`, `apps/web/src/styles.css`, `apps/web/src/router.tsx`,
`e2e/`.
**Depends on:** nothing. It's the entry point that `profile-image`, `profile-page`, `forums`,
`achievements`, `leaderboards` and `account-self-deletion` hang their links from.
**Origin:** user request (2026-11-19).

## Problem

The header puts everything inline: streak, XP, PRO badge, "Manage billing" and "Sign out". Each
new user feature (settings, profile, forums, achievements) would add another inline item, and
the header already gets crowded at phone width. We need one dropdown that holds the account
options.

## Suggested approach

- Replace the inline account controls in `Layout.tsx` with a menu button: the user's avatar
  (`user.image`, falling back to initials) and their name. Keep streak and XP visible in the bar,
  or move them into the menu at narrow widths (designer decides).
- Menu items for signed-in users: Profile (once `profile-page` exists), Settings, Manage billing
  (pro only, reusing `ManageBillingButton`'s behaviour), Sign out. Guests keep the
  "Save progress" call to action and get no Sign out (it would orphan their progress).
- Add a `/settings` route as a placeholder page that later tasks fill in (profile image, display
  name, leaderboard visibility, account deletion).
- Accessibility: use a `<button aria-haspopup="menu" aria-expanded>` and a `role="menu"` list.
  Support keyboard use (Enter/Space open, arrow keys move, Escape closes and returns focus).
  Close on outside click and on route change. A small hand-rolled component is fine; adding a
  headless UI dependency is the designer's call.
- Phone width: the menu stays inside the viewport (16px gutter, no horizontal scroll).

## Acceptance criteria

- [x] Signed-in users open a dropdown from the header with Settings, Manage billing (pro only)
      and Sign out. Sign out behaves as it does today (`analytics.setUser(null)`, queries
      invalidated). Note: Manage billing for Pro is covered by the `UserMenu.test.ts` markup
      test only (e2e has no Pro user); a manual click-through is listed in the PR.
- [x] Guests still see "Save progress" and no Sign out.
- [x] Mouse and keyboard both work, and the ARIA roles and states are correct.
- [x] `/settings` exists and is reachable from the menu.
- [x] No horizontal scroll at 375px width.
- [x] e2e: open the menu, go to settings, sign out.
- [x] Lint, typecheck and tests pass.

## Plan

### Scope

This branch covers every acceptance criterion. Nothing is deferred, and there are no infra, cost,
API or `@fixedstep/content-schema` changes. `Me` in `apps/web/src/lib/api.ts` already has
`user.name`, `user.email`, `user.image`, `user.isAnonymous` and `pro`.

One gap in coverage: e2e has no Pro user, so **Manage billing** in the menu is checked only by
the unit test (SSR markup). The tester should click it once by hand with a Pro user on the dev
stack.

### Decisions

- **Streak and XP stay in the bar at every width.** They're short, they're the motivation loop,
  and `guest-progress.spec.ts` asserts `getByTitle("Experience")`. Two things change at narrow
  widths instead:
  - at `max-width: 480px` the trigger shows only the avatar (the name is visually hidden but
    stays the accessible name);
  - the bar's PRO badge is hidden at `max-width: 480px`. PRO always shows in the menu header.
- **Hand-rolled, no new dependency.** The menu is one component with about six key handlers.
  A headless library would add bundle weight and a new styling model for one widget.
- **Guests get no menu.** They keep stats plus "Save progress" exactly as today, and get no
  Sign out and no Settings. Signed-out visitors keep the "Sign in" link.
- **The panel is always rendered and toggled with `hidden`.** `aria-controls` then always points
  at an element that exists, and SSR unit tests can see the items without simulating a click.
- **Closing:** Escape (focus returns to the trigger), Tab (focus moves on naturally), a
  `pointerdown` outside the menu, a route change, and choosing Sign out. Manage billing does
  **not** close the menu, so its pending and "Billing unavailable" states stay visible. On
  success it navigates away anyway.

### Changes (in order)

1. **`apps/web/src/lib/user-menu.ts`** (new, pure functions so they can be unit-tested):
   - `export function initials(name: string): string`: trims, splits on whitespace, takes the
     first code point (`Array.from`) of the first and last word, and uppercases it. One word
     gives one letter. Empty or blank gives `"?"`. For example, `"E2E user"` gives `"EU"`.
   - `export function menuKeyTarget(key: string, current: number, count: number): number | "close" | null`:
     - `ArrowDown` goes to `(current + 1) % count` (from `-1` it goes to `0`).
     - `ArrowUp` goes to `(current - 1 + count) % count` (from `-1` it goes to `count - 1`).
     - `Home` goes to `0`, and `End` goes to `count - 1`.
     - `Escape` returns `"close"`.
     - Any other key returns `null`.
2. **`apps/web/src/components/ManageBillingButton.tsx`**: widen the props to
   `{ className?: string; role?: "menuitem"; tabIndex?: number }` and pass `role` and `tabIndex`
   through to the `<button>`. The default behaviour is unchanged, and `HomePage.tsx` is
   untouched.
3. **`apps/web/src/components/UserMenu.tsx`** (new):
   `export function UserMenu({ user, pro }: { user: NonNullable<Me["user"]>; pro: boolean })`.
   - **State:** `open`, plus a `focusOnOpen` ref holding `"first" | "last"`. Ids come from
     `useId()`. A `rootRef` wraps the whole menu and a `listRef` points at the `<ul>`.
   - **Trigger:** `<button type="button" className="user-menu-trigger" id={triggerId}
     aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}>`. It contains:
     - the avatar, marked `aria-hidden`: `<img className="avatar" src={user.image} alt=""
       width={28} height={28} referrerPolicy="no-referrer">` when there is an image, otherwise
       `<span className="avatar">{initials(user.name)}</span>`;
     - `<span className="user-menu-name">{user.name}</span>`, which gives the button its
       accessible name.

     Clicking toggles the menu. Native Enter and Space activate the click, which opens the menu
     and focuses the first item. `onKeyDown` handles ArrowDown (open, focus the first item) and
     ArrowUp (open, focus the last item), calling `preventDefault` for both.
   - **Panel:** `<div className="user-menu-panel" hidden={!open}>` contains:
     - a header (not a menu item): `<div className="user-menu-who">` holding the name, the
       muted email, and `<span className="badge">PRO</span>` when `pro`;
     - `<ul role="menu" id={menuId} aria-labelledby={triggerId} onKeyDown={...}>`, where each
       item is wrapped in `<li role="none">`:
       1. `<Link to="/settings" role="menuitem" tabIndex={-1} className="user-menu-item">Settings</Link>`
       2. when `pro`, `<ManageBillingButton role="menuitem" tabIndex={-1} className="user-menu-item" />`
       3. `<button type="button" role="menuitem" tabIndex={-1} className="user-menu-item">Sign out</button>`

       Leave a comment that Profile goes first once `profile-page` lands.
   - **Sign out:** move the logic verbatim from `Layout.tsx` (`await authClient.signOut();
     analytics.setUser(null); await qc.invalidateQueries();`, with `useQueryClient` in here).
     Close the menu first.
   - **List `onKeyDown`:**
     - Get the items with `listRef.current.querySelectorAll('[role="menuitem"]')` and the
       current index from `document.activeElement`.
     - Apply `menuKeyTarget`. A number focuses that item and calls `preventDefault`. `"close"`
       closes the menu and focuses the trigger.
     - `Tab` closes without `preventDefault`.
     - A space on the Settings link calls `preventDefault` and then `.click()`, since links
       don't activate on Space.
   - **Effects:**
     - When `open` becomes true, focus the first or last item per `focusOnOpen` (default
       `"first"`).
     - While open, add a `document` `pointerdown` listener that closes the menu when the event
       target is outside `rootRef`. Remove it in the cleanup.
     - `const href = useLocation({ select: (l) => l.href })`, then
       `useEffect(() => setOpen(false), [href])`.
4. **`apps/web/src/components/Layout.tsx`**:
   - Keep the streak and XP `.stat` spans.
   - Keep the PRO badge but give it `className="badge topbar-pro"`.
   - Drop the inline `<ManageBillingButton />`.
   - Guests: the "Save progress" link is unchanged.
   - Non-guests: render `<UserMenu user={me.data.user} pro={me.data.pro} />` instead of the
     Sign out button.
   - Remove the now-unused `useQueryClient`, `authClient` and `ManageBillingButton` imports.
     `analytics` is still used by the `setUser` effect.
5. **`apps/web/src/pages/SettingsPage.tsx`** (new): `export function SettingsPage()`.
   - It reads `useQuery({ queryKey: ["me"], queryFn: api.me })` and renders
     `<section className="settings">` with `<h1>Settings</h1>`.
   - **Signed in (non-guest):** `<p className="muted">Signed in as {email}.</p>` plus a
     placeholder paragraph: "More settings are coming: profile picture, display name,
     leaderboard visibility and account deletion."
   - **Guest:** a short line and a `Link` to `/login` with `search={{ mode: "signUp", redirect:
     "/settings" }}` ("Create an account").
   - **Signed out:** a `Link` to `/login` with `search={{ redirect: "/settings" }}`.
   - **Loading:** render only the heading.
   - It's a client-side page with no route guard, and the API doesn't change.
6. **`apps/web/src/router.tsx`**: add
   `createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage })`.
7. **`apps/web/src/styles.css`**: add to the `.topbar` block, using the existing variables
   (`--surface`, `--border`, `--code-bg`, `--muted`, `--accent`) and the radii already in use
   (8px buttons, 12px panels).
   - `.topbar-right`: add `margin-left: auto; min-width: 0`. When the bar wraps, the nav then
     sits right-aligned and the trigger is always at the 16px right gutter.
   - `.user-menu { position: relative }`.
   - `.user-menu-trigger`: `display: flex; align-items: center; gap: 8px; padding: 2px 10px 2px 2px;
     border-radius: 999px`, plus a `:focus-visible` outline in `--accent`.
   - `.avatar`: a 28px circle with `object-fit: cover`. The initials fallback uses
     `background: var(--code-bg)`, 12px bold, and centred text.
   - `.user-menu-panel`:
     - `position: absolute; right: 0; top: calc(100% + 6px); z-index: 30`. That's above the
       outline drawer, which uses 19 and 20.
     - `min-width: 12rem; max-width: calc(100vw - 32px)`.
     - `background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
       padding: 6px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.18)`.
   - `.user-menu-panel[hidden] { display: none }`.
   - `.user-menu-who`: padding, `overflow-wrap: anywhere` for long emails, and a bottom border.
   - `.user-menu-panel ul`: no list style, margin or padding.
   - `.user-menu-item`:
     - `display: block; width: 100%; text-align: left; border: none; background: none;
       padding: 8px 10px; border-radius: 8px; color: var(--text); text-decoration: none`.
     - `:hover` and `:focus-visible` use `background: var(--code-bg)`.
   - `@media (max-width: 480px)`: `.user-menu-name` gets the `.sr-only` declarations (it stays
     the accessible name), the trigger padding becomes `2px`, and `.topbar-pro { display: none }`.

### Tests

The vitest include is `apps/*/src/**/*.test.ts`, so unit tests are `.ts` and use `createElement`
plus `renderToStaticMarkup`, as in `components/LegalNotice.test.ts`.

- **`apps/web/src/lib/user-menu.test.ts`** (new):
  - `initials`: two words; three words (first and last); one word; extra whitespace; empty
    gives `"?"`; a non-ASCII first letter (`"émile zola"` gives `"ÉZ"`).
  - `menuKeyTarget`:
    - Down and Up wrap at both ends.
    - From `-1`, Down gives the first item and Up gives the last.
    - Home and End work.
    - Escape gives `"close"`.
    - `"a"` and `"Tab"` give `null`.
- **`apps/web/src/components/UserMenu.test.ts`** (new): wrap the component in
  `QueryClientProvider` (a new `QueryClient`) and `RouterContextProvider`. Build the router with
  `createMemoryHistory` and a root route with a `/settings` child, so `Link` resolves. Cases:
  - The closed trigger has `aria-haspopup="menu"` and `aria-expanded="false"`, and its
    `aria-controls` equals the `id` of the `role="menu"` element. The menu has
    `aria-labelledby` set to the trigger's id, and the panel has the `hidden` attribute.
  - A non-Pro user gets the menu items Settings (`href="/settings"`) and Sign out, in that
    order, all with `tabindex="-1"` and no "Manage billing".
  - A Pro user gets Manage billing between Settings and Sign out, and a PRO badge in the header.
  - With `image: null`, the avatar shows the initials. With an image URL there is an `<img`
    with `alt=""` and that `src`.
- **`e2e/specs/user-menu.spec.ts`** (new). Get `user` from `signUp(page.request)` and use
  `const trigger = page.getByRole("banner").getByRole("button", { name: user.name })`.
  1. **"open the menu with the mouse, go to settings, sign out":**
     - On `/`, `trigger` has `aria-expanded="false"`.
     - Click it: `aria-expanded="true"`, `getByRole("menu")` is visible, and its menu items are
       exactly `["Settings", "Sign out"]`.
     - Click `menuitem` "Settings": the URL ends in `/settings`, the "Settings" heading is
       visible, the menu is hidden (closed on route change), and the email text shows.
     - Open the menu again and click `menuitem` "Sign out": the banner's "Sign in" link is
       visible and `/api/me`'s `user` is null.
  2. **"keyboard":**
     - `trigger.focus()`, then press Enter: "Settings" is focused.
     - ArrowDown focuses "Sign out", ArrowDown again wraps to "Settings", ArrowUp goes to
       "Sign out", Home goes to "Settings", and End goes to "Sign out".
     - Escape hides the menu, and the trigger is focused with `aria-expanded="false"`.
     - ArrowDown on the trigger opens the menu with "Settings" focused.
     - Escape, then Space, opens it again.
     - Click `page.locator("main")`: the menu is hidden.
  3. **"phone width":** `test.use({ viewport: { width: 375, height: 740 } })` in a
     `test.describe`.
     - Open the menu.
     - Assert the menu's `boundingBox()` has `x >= 16` and `x + width <= 375 - 16 + 1`.
     - Call `expectNoPageScrollX(page)`.
- **Update existing e2e specs:** the inline "Sign out" button is gone.
  - **`auth.spec.ts`:** replace lines 17, 19 and 42. Assert that the `user.name` trigger is
    visible; to sign out, click the trigger and then `getByRole("menuitem", { name: "Sign out" })`.
  - **`analytics-off.spec.ts`** (lines 20 and 22) and **`legal.spec.ts`** (line 87): wait for
    the `user.name` trigger instead. Capture `user` from `signUp`, which returns it.
  - **`guest-progress.spec.ts`:**
    - After line 34 (guest), assert
      `page.getByRole("banner").locator('[aria-haspopup="menu"]')` has a count of 0 and no
      "Sign out" button exists.
    - At line 45, wait for the `user.name` trigger.
  - **`phone-layout.spec.ts`:** no change. Its signed-in tests now exercise the new bar at 360px.

### Checks

Run these from the repo root, as in CLAUDE.md:

- `node_modules/.bin/biome check .`
- `node_modules/.bin/tsc -p apps/web --noEmit` and `node_modules/.bin/tsc -p e2e --noEmit`.
  Run the rest of the list too; the other packages are untouched, so they should be no-ops.
- `node_modules/.bin/vitest run --configLoader runner`
- `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts`

### Risks

- **CLAUDE.md invariants:**
  - No new data reaches the browser: the menu uses fields `/api/me` already sends.
  - Nothing touches XP or `progress.ts`, `harnessRuntime`, cloud SDKs or infra.
- **Sign-out regression:** the logic moves from `Layout` into `UserMenu`. Keep the three calls
  in the same order. e2e `auth` and `user-menu` both cover it.
- **`user.image` is rendered as an `<img>` from whatever URL the auth provider stored.** There
  is no CSP today, and `referrerPolicy="no-referrer"` avoids leaking the page URL. The
  `profile-image` task owns upload and hosting.
- **Pending billing state:** `ManageBillingButton` sets `disabled` while the portal request is
  pending, so focus can drop out of the menu for that moment. This is acceptable because the
  page navigates away. Switching it to `aria-disabled` is optional follow-up work, not part of
  this branch.
- **SSR test:** `UserMenu` calls `useLocation`. The `createRouter` and `createMemoryHistory`
  setup initializes `router.state.location`, so this should render. If it doesn't, move the
  close-on-route-change into `Layout` as `<UserMenu key={href} … />` (a remount) and drop the
  hook.

### Optional (not in this branch)

- Show the menu to guests with a "Create account" item.
- A Profile item. It belongs to `profile-page`.
