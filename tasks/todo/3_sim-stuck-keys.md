# Sim preview: keys can get stuck down

**Area:** `apps/web` (`components/Preview.tsx`, `workers/preview.worker.ts`).
**Depends on:** nothing.
**Origin:** found while designing `game-engine-course-part-2` (2026-10-28).

## Problem

`Preview.tsx` forwards `keydown`/`keyup` on the canvas to the worker as `e.key`, and the worker
keeps `keys[e.key] = down`. Two ways a key stays "down" for good:

- **Case change while held:** press `p`, then press Shift, then release `p`. The `keyup`
  arrives as `"P"`, so `keys.p` stays `true`. Lessons that act on a fresh press (pause on
  `p`/`P`, jump) then ignore the next press. The same happens with any letter key, and with
  keys whose `e.key` depends on layout or modifiers.
- **Lost focus:** if the canvas loses focus while a key is held (click elsewhere, switch tabs,
  open the drawer), the `keyup` never reaches it.

## Possible fixes

- Clear all keys on the canvas `blur` and on `visibilitychange` (post a `{ type: "clear" }`
  message, or a `key` up for each held key).
- Track keys by physical `e.code` and map back to a key name. Changing what `input.keys`
  contains would affect every existing sim lesson and the `content` README, so prefer: on
  `keyup`, also release the other case of a single letter.

## Acceptance criteria

- [ ] Releasing a letter key after a Shift change leaves no key held.
- [ ] Blurring the canvas or hiding the tab releases every held key.
- [ ] Existing sim lessons' visible behaviour is unchanged; unit tests cover the key-state logic.
