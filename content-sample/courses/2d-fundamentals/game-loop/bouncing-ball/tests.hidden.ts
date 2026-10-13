import { expect, random, simulate, test } from "@fixedstep/harness";
import * as game from "./solution";

test("stays inside the arena for 10 simulated seconds", () => {
  for (let trial = 0; trial < 20; trial++) {
    let s = {
      x: 20 + random() * 280,
      y: 20 + random() * 200,
      vx: random() * 600 - 300,
      vy: random() * 600 - 300,
      r: 10,
    };
    for (let i = 0; i < 600; i++) {
      s = simulate(game, { steps: 1, dt: 1 / 60, state: s });
      expect(s.x - s.r).toBeGreaterThan(-0.001);
      expect(s.x + s.r).toBeLessThan(game.WIDTH + 0.001);
      expect(s.y - s.r).toBeGreaterThan(-0.001);
      expect(s.y + s.r).toBeLessThan(game.HEIGHT + 0.001);
    }
  }
});
