/**
 * The in-sandbox test runtime.
 *
 * `harnessRuntime` is serialized with Function.prototype.toString() and evaluated inside
 * QuickJS on the server, so it MUST be fully self-contained: no imports, no references to
 * anything outside its own body, and no syntax a bundler would downlevel into helpers.
 * runtime.test.ts guards this by evaluating the serialized source in a fresh Function.
 *
 * Threat model: student code runs in the same JS realm as this runtime and may tamper with
 * globals (JSON, Array.prototype, Object.prototype.toJSON, ...) to forge a passing result.
 * So we capture every builtin we rely on before any student code runs, keep results in
 * closure scope, and serialize the output by hand.
 */
export function harnessRuntime(
  studentJs: string,
  tests: ReadonlyArray<{ readonly js: string; readonly hidden: boolean }>,
  seed: number,
): string {
  // --- Capture builtins before student code can touch them --------------------------------
  const _Function = Function;
  const _String = String;
  const _stringify = JSON.stringify; // only ever called on primitive strings (no toJSON lookup)
  const _is = Object.is;
  const _keys = Object.keys;
  const _freeze = Object.freeze;
  const _isArray = Array.isArray;
  const _abs = Math.abs;
  const _pow = Math.pow;
  const _imul = Math.imul;

  // --- Deterministic randomness (mulberry32) ----------------------------------------------
  let rngState = seed >>> 0;
  const random = (): number => {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let t = rngState;
    t = _imul(t ^ (t >>> 15), t | 1);
    t ^= t + _imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = random;

  // --- Assertions --------------------------------------------------------------------------
  const show = (v: unknown): string => {
    try {
      return typeof v === "string" ? _stringify(v) : _String(v);
    } catch {
      return "<unprintable>";
    }
  };
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  const deepEqual = (a: unknown, b: unknown): boolean => {
    if (_is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (_isArray(a) !== _isArray(b)) return false;
    const ka = _keys(a);
    const kb = _keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) {
      const k = ka[i] as string;
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  };
  const expect = (actual: unknown) =>
    _freeze({
      toBe(expected: unknown) {
        if (!_is(actual, expected)) fail(`expected ${show(actual)} to be ${show(expected)}`);
      },
      toEqual(expected: unknown) {
        if (!deepEqual(actual, expected)) fail(`expected ${show(actual)} to equal ${show(expected)}`);
      },
      toBeCloseTo(expected: number, digits = 4) {
        if (typeof actual !== "number" || !(_abs(actual - expected) < _pow(10, -digits) / 2)) {
          fail(`expected ${show(actual)} to be close to ${show(expected)} (${digits} digits)`);
        }
      },
      toBeGreaterThan(n: number) {
        if (!((actual as number) > n)) fail(`expected ${show(actual)} to be greater than ${n}`);
      },
      toBeLessThan(n: number) {
        if (!((actual as number) < n)) fail(`expected ${show(actual)} to be less than ${n}`);
      },
      toBeTruthy() {
        if (!actual) fail(`expected ${show(actual)} to be truthy`);
      },
      toBeFalsy() {
        if (actual) fail(`expected ${show(actual)} to be falsy`);
      },
      toThrow() {
        let threw = false;
        try {
          (actual as () => unknown)();
        } catch {
          threw = true;
        }
        if (!threw) fail("expected function to throw");
      },
    });

  // --- Simulation contract -----------------------------------------------------------------
  type Game = {
    init?: () => unknown;
    update: (state: unknown, dt: number, input: unknown) => unknown;
  };
  const NO_INPUT = _freeze({ keys: _freeze({}) });
  const simulate = (
    game: Game,
    opts: {
      steps: number;
      dt?: number;
      state?: unknown;
      input?: (step: number) => { keys: Record<string, boolean> };
    },
  ): unknown => {
    const dt = opts.dt ?? 1 / 60;
    let state = opts.state !== undefined ? opts.state : game.init ? game.init() : undefined;
    for (let i = 0; i < opts.steps; i++) {
      const next = game.update(state, dt, opts.input ? opts.input(i) : NO_INPUT);
      if (next !== undefined) state = next;
    }
    return state;
  };

  // --- Registration & module loading -------------------------------------------------------
  type Registered = { name: string; fn: () => void; hidden: boolean };
  const registered: Registered[] = [];
  let currentHidden = false;
  const test = (name: string, fn: () => void) => {
    registered[registered.length] = { name: _String(name), fn, hidden: currentHidden };
  };
  const harnessApi = _freeze({ test, expect, simulate, random });

  let studentExports: unknown;
  const load = (js: string): unknown => {
    const module = { exports: {} as unknown };
    const require = (id: string): unknown => {
      if (id === "@fixedstep/harness") return harnessApi;
      if (id === "./solution" || id === "./starter" || id === "./main") return studentExports;
      throw new Error(`cannot import "${id}" in a lesson`);
    };
    new _Function("module", "exports", "require", js)(module, module.exports, require);
    return module.exports;
  };

  const out = (body: string) => `{${body}}`;
  try {
    studentExports = load(studentJs);
  } catch (e) {
    return out(`"ok":false,"error":${_stringify(`Your code threw while loading: ${show(e)}`)}`);
  }
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i] as { js: string; hidden: boolean };
    currentHidden = t.hidden;
    try {
      load(t.js);
    } catch (e) {
      return out(`"ok":false,"error":${_stringify(`Test file failed to load: ${show(e)}`)}`);
    }
  }

  // --- Run --------------------------------------------------------------------------------
  let results = "";
  for (let i = 0; i < registered.length; i++) {
    const r = registered[i] as Registered;
    let passed = true;
    let error = "";
    try {
      r.fn();
    } catch (e) {
      passed = false;
      error = e instanceof Error ? _String(e.message) : show(e);
    }
    results += `${i ? "," : ""}{"name":${_stringify(r.name)},"passed":${passed ? "true" : "false"},"hidden":${r.hidden ? "true" : "false"}${passed ? "" : `,"error":${_stringify(error)}`}}`;
  }
  return out(`"ok":true,"results":[${results}]`);
}

export type RawRun =
  | { ok: true; results: { name: string; passed: boolean; hidden: boolean; error?: string }[] }
  | { ok: false; error: string };
