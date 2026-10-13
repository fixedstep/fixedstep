import { expect, simulate, test } from "@fixedstep/harness";
import * as game from "./solution";

test("bounces off the right wall", () => {
  const s = simulate(game, { steps: 2, dt: 0.1, state: { x: 300, y: 120, vx: 200, vy: 0, r: 10 } });
  expect(s.vx).toBeLessThan(0);
  expect(s.x + s.r).toBeLessThan(game.WIDTH + 0.001);
});

test("bounces off the top wall", () => {
  const s = simulate(game, { steps: 1, dt: 0.1, state: { x: 160, y: 12, vx: 0, vy: -100, r: 10 } });
  expect(s.vy).toBeGreaterThan(0);
  expect(s.y).toBeCloseTo(10);
});
