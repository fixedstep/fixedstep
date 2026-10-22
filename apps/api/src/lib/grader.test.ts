import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHttpGrader, GraderBusyError, type HttpGraderOptions } from "./grader";

const result = { status: "passed", results: [], durationMs: 1 };
const req = { code: "export const x = 1;", visibleTests: "" };

const reply = (status: number, body: unknown = { error: "x" }) =>
  new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  sleep = vi.fn(async (_ms: number) => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const grader = (opts: Partial<HttpGraderOptions> = {}) =>
  createHttpGrader({
    url: new URL("http://grader/grade"),
    token: "t".repeat(32),
    sleep,
    random: () => 0,
    ...opts,
  });

it("retries a 429 and returns the result", async () => {
  fetchMock.mockResolvedValueOnce(reply(429)).mockResolvedValueOnce(reply(200, result));
  await expect(grader()(req)).resolves.toEqual(result);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("gives up with GraderBusyError after maxAttempts", async () => {
  fetchMock.mockImplementation(async () => reply(503));
  await expect(grader()(req)).rejects.toBeInstanceOf(GraderBusyError);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("does not retry other 4xx responses", async () => {
  for (const status of [400, 401]) {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(reply(status));
    const err = await grader()(req).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(GraderBusyError);
    expect(err.message).toMatch(`grader failed: ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
});

it("retries a network error once", async () => {
  fetchMock
    .mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockResolvedValueOnce(reply(200, result));
  await expect(grader()(req)).resolves.toEqual(result);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("retries a network error only once", async () => {
  fetchMock.mockRejectedValue(new TypeError("fetch failed"));
  await expect(grader()(req)).rejects.toBeInstanceOf(GraderBusyError);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("shares one deadline across attempts", async () => {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
  const started = Date.now();
  await expect(grader({ deadlineMs: 50 })(req)).rejects.toBeInstanceOf(GraderBusyError);
  expect(Date.now() - started).toBeLessThan(500);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("backs off with jitter between attempts", async () => {
  fetchMock.mockImplementation(async () => reply(429));
  for (const random of [() => 0, () => 0.999]) {
    sleep.mockClear();
    await grader({ random })(req).catch(() => {});
    const [first, second] = sleep.mock.calls.map(([ms]) => ms);
    expect(first).toBeGreaterThanOrEqual(125);
    expect(first).toBeLessThanOrEqual(250);
    expect(second).toBeGreaterThanOrEqual(500);
    expect(second).toBeLessThanOrEqual(1000);
  }
});
