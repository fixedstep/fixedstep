import { expect, random, test } from "@fixedstep/harness";
import { move } from "./solution";

test("randomized movement", () => {
  for (let i = 0; i < 50; i++) {
    const pos = { x: random() * 1000, y: random() * 1000 };
    const vel = { x: random() * 400 - 200, y: random() * 400 - 200 };
    const dt = random() / 10;
    const p = move(pos, vel, dt);
    expect(p.x).toBeCloseTo(pos.x + vel.x * dt);
    expect(p.y).toBeCloseTo(pos.y + vel.y * dt);
  }
});
