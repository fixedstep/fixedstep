import { expect, it } from "vitest";
import { createRunQueue } from "./queue";

it("rejects once running plus waiting reaches the limit", () => {
  const queue = createRunQueue({ concurrency: 1, maxQueued: 2 });
  const releases = [queue.tryAcquire(), queue.tryAcquire(), queue.tryAcquire()];
  expect(releases.every(Boolean)).toBe(true);
  expect(queue.tryAcquire()).toBeNull();

  releases[0]?.();
  releases[0]?.(); // releasing twice frees only one slot
  expect(queue.tryAcquire()).not.toBeNull();
  expect(queue.tryAcquire()).toBeNull();
});

it("runs jobs one at a time, in order", async () => {
  const queue = createRunQueue({ concurrency: 1, maxQueued: 2 });
  const log: string[] = [];
  let running = 0;
  const job = (name: string) => async () => {
    running++;
    expect(running).toBe(1);
    log.push(`start ${name}`);
    await new Promise((r) => setTimeout(r, 5));
    log.push(`end ${name}`);
    running--;
    return name;
  };
  const results = await Promise.all([
    queue.run(job("a")),
    queue.run(job("b")),
    queue.run(job("c")),
  ]);
  expect(results).toEqual(["a", "b", "c"]);
  expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
});

it("keeps going after a job fails", async () => {
  const queue = createRunQueue({ concurrency: 1, maxQueued: 1 });
  const failed = queue.run(async () => {
    throw new Error("boom");
  });
  const next = queue.run(async () => "ok");
  await expect(failed).rejects.toThrow("boom");
  await expect(next).resolves.toBe("ok");
});
