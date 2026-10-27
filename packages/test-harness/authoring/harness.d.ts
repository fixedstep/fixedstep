/**
 * Ambient types for lesson authors. In the content repo, add this file to tsconfig "include"
 * so tests.ts / tests.hidden.ts get type-checked:
 *
 *   import { test, expect, simulate } from "@fixedstep/harness";
 *   import * as game from "./solution";   // resolves to the student's code at runtime
 */
declare module "@fixedstep/harness" {
  export type Input = { keys: Readonly<Record<string, boolean>> };

  /** The simulation contract every `sim` lesson's student code follows. */
  export type Game<S> = {
    init?: () => S;
    update: (state: S, dt: number, input: Input) => S | undefined;
  };

  /**
   * `opts.hint` is the "usual mistake" message shown under the test when it fails (cut at 300
   * chars). It is shown for hidden tests too, so never put inputs or expected values in it.
   */
  export function test(name: string, fn: () => void, opts?: { hint?: string }): void;

  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeCloseTo(expected: number, digits?: number): void;
    toBeGreaterThan(n: number): void;
    toBeLessThan(n: number): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toThrow(): void;
  };

  /** Runs `steps` fixed updates and returns the final state. */
  export function simulate<S>(
    game: Game<S>,
    opts: { steps: number; dt?: number; state?: S; input?: (step: number) => Input },
  ): S;

  /** Seeded PRNG (Math.random is also seeded inside the sandbox). */
  export function random(): number;
}
