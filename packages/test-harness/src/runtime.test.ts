import { describe, expect, it } from "vitest";
import { functionExecutor, grade, HINT_MAX_LENGTH } from "./index";
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
const bad = good.replace("100 * dt", "50 * dt");
/** A visible "moves right" test whose third argument is `opts` (source text). */
const visibleWithOpts = (opts: string) => `
import { test, expect, simulate } from "@fixedstep/harness";
import * as game from "./solution";
test("moves right", () => {
  const s = simulate(game, { steps: 60, dt: 1 / 60 }) as { x: number };
  expect(s.x).toBeCloseTo(100);
}, ${opts});
`;
const hiddenWithHint = `
import { test, expect } from "@fixedstep/harness";
import * as game from "./solution";
test("secret", () => { expect(game.update({ x: 0 }, 2, { keys: {} })).toEqual({ x: 200 }); },
  { hint: "scale by dt" });
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
    const r = await grade({ code: bad, visibleTests, hiddenTests }, exec);
    expect(r.status).toBe("failed");
    expect(r.results[0]?.error).toMatch(/close to 100/);
    expect(r.results[0]).not.toHaveProperty("hint");
    expect(r.results[1]).toEqual({ name: "hidden test 1", passed: false, hidden: true });
  });

  it("reports a hint on a failing visible test, alongside the error", async () => {
    const tests = visibleWithOpts(`{ hint: "multiply by dt" }`);
    const r = await grade({ code: bad, visibleTests: tests }, exec);
    expect(r.results[0]?.hint).toBe("multiply by dt");
    expect(r.results[0]?.error).toMatch(/close to 100/);
  });

  it("omits the hint when the test passes", async () => {
    const tests = visibleWithOpts(`{ hint: "multiply by dt" }`);
    const r = await grade({ code: good, visibleTests: tests }, exec);
    expect(r.status).toBe("passed");
    expect(r.results[0]).not.toHaveProperty("hint");
  });

  it("reports a hidden test's hint but never its error", async () => {
    const r = await grade({ code: bad, visibleTests, hiddenTests: hiddenWithHint }, exec);
    expect(r.results[1]).toEqual({
      name: "hidden test 1",
      passed: false,
      hidden: true,
      hint: "scale by dt",
    });
    expect(r.results[1]).not.toHaveProperty("error");
  });

  it.each(["{ hint: 42 }", "null", "{}", `{ hint: "" }`, "undefined"])(
    "ignores a missing or invalid hint (%s)",
    async (opts) => {
      const r = await grade({ code: bad, visibleTests: visibleWithOpts(opts) }, exec);
      expect(r.status).toBe("failed");
      expect(r.results).toHaveLength(1);
      expect(r.results[0]).toMatchObject({ name: "moves right", passed: false });
      expect(r.results[0]).not.toHaveProperty("hint");
    },
  );

  it(`truncates hints to ${HINT_MAX_LENGTH} chars`, async () => {
    const long = "x".repeat(HINT_MAX_LENGTH + 50);
    const r = await grade(
      { code: bad, visibleTests: visibleWithOpts(`{ hint: "${long}" }`) },
      exec,
    );
    expect(r.results[0]?.hint).toBe("x".repeat(HINT_MAX_LENGTH));
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

describe.each([
  ["Function", functionExecutor],
  ["QuickJS", quickjsExecutor({ timeoutMs: 500 })],
])("hint edge cases via %s", (_name, exec) => {
  it("round-trips quotes, newlines, backslashes and unicode", async () => {
    const hint = `Don't "quote"\nnew\\line   \u{1F4A1} café`;
    const tests = visibleWithOpts(`{ hint: ${JSON.stringify(hint)} }`);
    const r = await grade({ code: bad, visibleTests: tests }, exec);
    expect(r.results[0]?.hint).toBe(hint);
  });

  it("reports a hint when the test throws a non-assertion error", async () => {
    const tests = `
import { test } from "@fixedstep/harness";
test("boom", () => { throw new Error("kaput"); }, { hint: "check your return value" });
`;
    const r = await grade({ code: good, visibleTests: tests }, exec);
    expect(r.results[0]).toMatchObject({
      passed: false,
      error: "kaput",
      hint: "check your return value",
    });
  });

  it("keeps hints attached to the right test in a mixed run, hidden indices in order", async () => {
    const tests = `
import { test, expect } from "@fixedstep/harness";
test("a", () => { expect(1).toBe(2); }, { hint: "hint a" });
test("b", () => { expect(1).toBe(1); }, { hint: "hint b" });
test("c", () => { expect(1).toBe(2); });
`;
    const hidden = `
import { test, expect } from "@fixedstep/harness";
test("h1", () => { expect(1).toBe(2); }, { hint: "hidden one" });
test("h2", () => { expect(1).toBe(2); });
test("h3", () => { expect(1).toBe(2); }, { hint: "hidden three" });
`;
    const r = await grade({ code: good, visibleTests: tests, hiddenTests: hidden }, exec);
    expect(r.results.map((t) => [t.name, t.hint])).toEqual([
      ["a", "hint a"],
      ["b", undefined],
      ["c", undefined],
      ["hidden test 1", "hidden one"],
      ["hidden test 2", undefined],
      ["hidden test 3", "hidden three"],
    ]);
    expect(r.results[1]).not.toHaveProperty("hint");
    for (const t of r.results.slice(3)) expect(t).not.toHaveProperty("error");
  });

  it("does not cut a hint of exactly the max length", async () => {
    const exact = "y".repeat(HINT_MAX_LENGTH);
    const r = await grade(
      { code: bad, visibleTests: visibleWithOpts(`{ hint: "${exact}" }`) },
      exec,
    );
    expect(r.results[0]?.hint).toBe(exact);
  });

  it("ignores a hint on opts that is a non-string object or array", async () => {
    const r = await grade({ code: bad, visibleTests: visibleWithOpts(`{ hint: ["a"] }`) }, exec);
    expect(r.results[0]).not.toHaveProperty("hint");
  });

  it("does not break loading when opts.hint is a throwing getter", async () => {
    const opts = `{ get hint(): string { throw new Error("hostile"); } }`;
    const r = await grade({ code: bad, visibleTests: visibleWithOpts(opts) }, exec);
    expect(r.status).toBe("failed");
    expect(r.results[0]).toMatchObject({ name: "moves right", passed: false });
  });
});
