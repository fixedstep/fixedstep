import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";
import type { Executor } from "./index";

export type QuickJSLimits = { timeoutMs?: number; memoryBytes?: number };

/**
 * Executor backed by QuickJS compiled to WASM: no host APIs, no network, no filesystem,
 * hard memory cap, and an interrupt handler that kills infinite loops. Server-side only.
 */
export function quickjsExecutor({
  timeoutMs = 2_000,
  memoryBytes = 64 * 1024 * 1024,
}: QuickJSLimits = {}): Executor {
  return async (program) => {
    const QuickJS = await getQuickJS();
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(memoryBytes);
    runtime.setMaxStackSize(1024 * 1024);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));
    const vm = runtime.newContext();
    try {
      const result = vm.evalCode(program);
      if (result.error) {
        const err = vm.dump(result.error) as { name?: string; message?: string } | string;
        result.error.dispose();
        const message = typeof err === "string" ? err : `${err.name ?? "Error"}: ${err.message}`;
        throw new Error(/interrupted/i.test(message) ? `Timed out after ${timeoutMs}ms` : message);
      }
      const value = vm.dump(result.value);
      result.value.dispose();
      return String(value);
    } finally {
      vm.dispose();
      runtime.dispose();
    }
  };
}
