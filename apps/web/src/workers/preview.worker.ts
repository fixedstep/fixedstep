import { transpile } from "@fixedstep/test-harness";

/**
 * Runs a sim lesson's init/update/render on an OffscreenCanvas with a fixed-timestep loop:
 * the simulation always advances in exact 1/60 s steps (like the grader), while rendering
 * happens once per animation frame.
 */
type Game = {
  init: () => unknown;
  update: (state: unknown, dt: number, input: { keys: Record<string, boolean> }) => unknown;
  render: (ctx: OffscreenCanvasRenderingContext2D, state: unknown) => void;
};
type Msg =
  | { type: "start"; code: string; canvas: OffscreenCanvas }
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

scope.onmessage = (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === "key") {
    keys[msg.key] = msg.down;
    return;
  }
  try {
    const game = load(msg.code);
    const ctx = msg.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    let state = game.init();
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      try {
        acc += Math.min(0.25, (now - last) / 1000); // clamp to avoid a spiral of death
        last = now;
        while (acc >= STEP) {
          const next = game.update(state, STEP, { keys: { ...keys } });
          if (next !== undefined) state = next;
          acc -= STEP;
        }
        game.render(ctx, state);
        nextFrame(frame);
      } catch (err) {
        scope.postMessage({ type: "error", message: String(err) });
      }
    };
    nextFrame(frame);
  } catch (err) {
    scope.postMessage({ type: "error", message: String(err) });
  }
};
