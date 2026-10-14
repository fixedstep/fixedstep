import { transpile } from "@fixedstep/test-harness";

/**
 * Runs a sim lesson's init/update/render on an OffscreenCanvas with a fixed-timestep loop:
 * the simulation always advances in exact 1/60 s steps (like the grader), while rendering
 * happens once per animation frame.
 *
 * `reload` swaps in new code without restarting (playground sliders, live edits). The current
 * state is kept unless the new init() returns something different, e.g. a changed start radius.
 */
type Game = {
  init: () => unknown;
  update: (state: unknown, dt: number, input: { keys: Record<string, boolean> }) => unknown;
  render: (ctx: OffscreenCanvasRenderingContext2D, state: unknown) => void;
};
type Msg =
  | { type: "start"; code: string; canvas: OffscreenCanvas }
  | { type: "reload"; code: string }
  | { type: "key"; key: string; down: boolean };

const scope = self as unknown as Worker; // DOM lib typing; `self` is the worker scope
const STEP = 1 / 60;
const keys: Record<string, boolean> = {};
const nextFrame: (cb: (t: number) => void) => void =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16);

function load(code: string): Game {
  const module = { exports: {} as Record<string, unknown> };
  const require = (id: string) => {
    throw new Error(`cannot import "${id}" in a game`);
  };
  new Function("module", "exports", "require", transpile(code, "main.ts"))(
    module,
    module.exports,
    require,
  );
  const game = module.exports as Partial<Game>;
  if (
    typeof game.init !== "function" ||
    typeof game.update !== "function" ||
    typeof game.render !== "function"
  ) {
    throw new Error("export init(), update(state, dt, input) and render(ctx, state)");
  }
  return game as Game;
}

let game: Game | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let state: unknown;
let initSnapshot = "";
let last = 0;
let acc = 0;

const fail = (err: unknown) => {
  game = null; // pause until the next reload
  scope.postMessage({ type: "error", message: String(err) });
};

const snapshot = (s: unknown) => {
  try {
    return JSON.stringify(s) ?? "";
  } catch {
    return "";
  }
};

function swapIn(code: string, keepState: boolean) {
  const next = load(code);
  const fresh = next.init();
  const snap = snapshot(fresh);
  if (!keepState || game === null || snap !== initSnapshot) state = fresh;
  initSnapshot = snap;
  game = next;
  scope.postMessage({ type: "ok" });
}

const frame = (now: number) => {
  acc += Math.min(0.25, (now - last) / 1000); // clamp to avoid a spiral of death
  last = now;
  if (game && ctx) {
    try {
      while (acc >= STEP) {
        const next = game.update(state, STEP, { keys: { ...keys } });
        if (next !== undefined) state = next;
        acc -= STEP;
      }
      game.render(ctx, state);
    } catch (err) {
      fail(err);
    }
  }
  acc = Math.min(acc, STEP);
  nextFrame(frame);
};

scope.onmessage = (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === "key") {
    keys[msg.key] = msg.down;
    return;
  }
  try {
    if (msg.type === "start") {
      ctx = msg.canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable");
      swapIn(msg.code, false);
      last = performance.now();
      nextFrame(frame);
    } else {
      swapIn(msg.code, true);
    }
  } catch (err) {
    // A broken reload keeps the last good game running.
    if (msg.type === "start") fail(err);
    else scope.postMessage({ type: "error", message: String(err) });
  }
};
