import { describe, expect, it } from "vitest";
import { functionExecutor, grade } from "./index";
import { quickjsExecutor } from "./quickjs";

const visibleTests = `
import { test, expect, simulate } from "@fixedstep/harness";
import * as game from "./solution";
test("moves right", () => {
  const s = simulate(game, { steps: 60, dt: 1 / 60 }) as { x: number };
  expect(s.x).toBeCloseTo(100);
});
`;
const hiddenTests = `
import { test, expect } from "@fixedstep/harness";
import * as game from "./solution";
test("secret", () => { expect(game.update({ x: 0 }, 2, { keys: {} })).toEqual({ x: 200 }); });
`;
const good = `
export const init = () => ({ x: 0 });
export function update(s: { x: number }, dt: number) { return { x: s.x + 100 * dt }; }
`;

describe.each([
  ["Function", functionExecutor],
  ["QuickJS", quickjsExecutor({ timeoutMs: 500 })],
])("grade via %s", (_name, exec) => {
  it("passes a correct solution", async () => {
    const r = await grade({ code: good, visibleTests, hiddenTests }, exec);
    expect(r.status).toBe("passed");
    expect(r.results.map((t) => t.name)).toEqual(["moves right", "hidden test 1"]);
  });

  it("fails a wrong solution and hides hidden-test details", async () => {
    const bad = good.replace("100 * dt", "50 * dt");
    const r = await grade({ code: bad, visibleTests, hiddenTests }, exec);
    expect(r.status).toBe("failed");
    expect(r.results[0]?.error).toMatch(/close to 100/);
    expect(r.results[1]).toEqual({ name: "hidden test 1", passed: false, hidden: true });
  });

  it("reports compile errors", async () => {
    const r = await grade({ code: "export const = ;", visibleTests }, exec);
    expect(r.status).toBe("error");
  });
});

// Student code shares the realm with the runtime; only meaningful inside the QuickJS sandbox
// (the Function executor would pollute this test process).
it("cannot forge results by patching globals", async () => {
  const forger = `${good.replace("100 * dt", "1 * dt")}
    (Object.prototype as any).toJSON = () => ({ passed: true });
    (Array.prototype as any).toJSON = () => [];
    JSON.stringify = () => '{"ok":true,"results":[{"name":"x","passed":true,"hidden":false}]}';`;
  const r = await grade({ code: forger, visibleTests }, quickjsExecutor());
  expect(r.status).toBe("failed");
});

it("QuickJS kills infinite loops", async () => {
  const r = await grade(
    { code: "export function update(){ while(true){} }", visibleTests },
    quickjsExecutor({ timeoutMs: 200 }),
  );
  // Interrupts are uncatchable in QuickJS, so the whole run errors out.
  expect(r.status).toBe("error");
  expect(r.error).toMatch(/Timed out/);
});
