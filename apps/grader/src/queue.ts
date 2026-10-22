export type RunQueue = {
  /** Claims a slot (running or waiting), or returns null when the queue is full. */
  tryAcquire(): (() => void) | null;
  run<T>(fn: () => Promise<T>): Promise<T>;
};

/**
 * Bounds the work a grader instance accepts. QuickJS runs block the event loop, so a plain
 * counter around `await run()` would see each request alone. Starting jobs via `setImmediate`
 * lets the poll phase take in (and reject) every request that arrived during a blocking run
 * before the next run starts. Call `tryAcquire` synchronously at handler entry.
 */
export function createRunQueue(opts: { concurrency: number; maxQueued: number }): RunQueue {
  let held = 0;
  let active = 0;
  const pending: (() => void)[] = [];

  function pump() {
    while (active < opts.concurrency && pending.length > 0) {
      active++;
      setImmediate(pending.shift() as () => void);
    }
  }

  return {
    tryAcquire() {
      if (held >= opts.concurrency + opts.maxQueued) return null;
      held++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        held--;
      };
    },
    run(fn) {
      return new Promise((resolve, reject) => {
        pending.push(() => {
          Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        });
        pump();
      });
    },
  };
}
