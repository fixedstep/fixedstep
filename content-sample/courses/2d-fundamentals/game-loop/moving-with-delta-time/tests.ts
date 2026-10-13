import { expect, test } from "@fixedstep/harness";
import { move } from "./solution";

test("moves along x", () => {
  expect(move({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5)).toEqual({ x: 50, y: 0 });
});

test("moves along both axes", () => {
  const p = move({ x: 10, y: 20 }, { x: -30, y: 60 }, 1 / 60);
  expect(p.x).toBeCloseTo(9.5);
  expect(p.y).toBeCloseTo(21);
});

test("does not mutate the input", () => {
  const pos = { x: 1, y: 1 };
  move(pos, { x: 5, y: 5 }, 1);
  expect(pos).toEqual({ x: 1, y: 1 });
});
