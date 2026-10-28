import { describe, expect, it, vi } from "vitest";
import { createAnalytics, type PostHogLike, posthogOptions, sanitizeUrl } from "./analytics";
import type { Me } from "./api";

/** A fake that records captures with the registered super properties applied, like PostHog. */
function fakePostHog() {
  const superProps: Record<string, unknown> = {};
  const captured: Array<{ event: string; props: Record<string, unknown>; options?: unknown }> = [];
  const ph = {
    init: vi.fn(),
    register: vi.fn((p: Record<string, unknown>) => Object.assign(superProps, p)),
    capture: vi.fn((event: string, props?: Record<string, unknown>, options?: unknown) => {
      captured.push({ event, props: { ...superProps, ...props }, options });
    }),
    identify: vi.fn(),
    reset: vi.fn(),
  } satisfies PostHogLike;
  return { ph, captured };
}

const config = { key: "phc_test", host: "https://us.i.posthog.com", stage: "staging" };
const user = (over: Partial<NonNullable<Me["user"]>> = {}): Me["user"] => ({
  id: "u1",
  name: "Ada",
  email: "ada@example.com",
  image: null,
  isAnonymous: false,
  emailVerified: true,
  ...over,
});

describe("createAnalytics", () => {
  it("does nothing, and never loads posthog, when no key is configured", async () => {
    const load = vi.fn();
    const a = createAnalytics(load);
    a.pageview();
    a.track({ name: "email_verified" });
    await a.init(null);
    a.pageview();
    a.track({ name: "email_verified" });
    a.setUser(user());
    expect(load).not.toHaveBeenCalled();
  });

  it("initialises with in-memory persistence and no autocapture", async () => {
    const { ph } = fakePostHog();
    await createAnalytics(async () => ph).init(config);
    expect(ph.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        persistence: "memory",
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        person_profiles: "identified_only",
      }),
    );
  });

  it("registers the stage before flushing buffered events, in order", async () => {
    const { ph, captured } = fakePostHog();
    const a = createAnalytics(async () => ph);
    a.pageview();
    a.track({ name: "sign_up", method: "email", fromGuest: false });
    a.track({ name: "email_verified" });
    expect(ph.capture).not.toHaveBeenCalled();
    await a.init(config);
    expect(ph.register.mock.invocationCallOrder[0]).toBeLessThan(
      ph.capture.mock.invocationCallOrder[0] as number,
    );
    expect(captured.map((c) => c.event)).toEqual(["$pageview", "sign_up", "email_verified"]);
    expect(captured.every((c) => c.props.stage === "staging")).toBe(true);
    a.setUser(user());
    a.track({ name: "checkout_completed" });
    expect(captured.at(-1)?.props.stage).toBe("staging");
  });

  it("sends event props and the beacon transport when asked", async () => {
    const { ph, captured } = fakePostHog();
    const a = createAnalytics(async () => ph);
    await a.init(config);
    a.track({ name: "checkout_started", interval: "year" }, { beacon: true });
    expect(captured[0]).toMatchObject({
      event: "checkout_started",
      props: { interval: "year" },
      options: { transport: "sendBeacon" },
    });
  });

  it("stops quietly if posthog fails to load", async () => {
    const a = createAnalytics(() => Promise.reject(new Error("blocked")));
    a.track({ name: "email_verified" });
    await expect(a.init(config)).resolves.toBeUndefined();
    expect(() => a.pageview()).not.toThrow();
  });

  it("caps the buffer before init", async () => {
    const { ph } = fakePostHog();
    const a = createAnalytics(async () => ph);
    for (let i = 0; i < 80; i++) a.pageview();
    await a.init(config);
    expect(ph.capture).toHaveBeenCalledTimes(50);
  });

  describe("setUser", () => {
    it("identifies by id only, once per id", async () => {
      const { ph } = fakePostHog();
      const a = createAnalytics(async () => ph);
      await a.init(config);
      a.setUser(user());
      a.setUser(user());
      expect(ph.identify).toHaveBeenCalledTimes(1);
      expect(ph.identify).toHaveBeenCalledWith("u1");
      expect(ph.identify.mock.calls[0]).toHaveLength(1);
    });

    it("leaves guests anonymous", async () => {
      const { ph } = fakePostHog();
      const a = createAnalytics(async () => ph);
      await a.init(config);
      a.setUser(user({ isAnonymous: true }));
      a.setUser(null);
      expect(ph.identify).not.toHaveBeenCalled();
      expect(ph.reset).not.toHaveBeenCalled();
    });

    it("resets on sign-out, and identifies a different account afterwards", async () => {
      const { ph } = fakePostHog();
      const a = createAnalytics(async () => ph);
      await a.init(config);
      a.setUser(user());
      a.setUser(null);
      a.setUser(null);
      expect(ph.reset).toHaveBeenCalledTimes(1);
      a.setUser(user({ id: "u2" }));
      expect(ph.identify).toHaveBeenLastCalledWith("u2");
    });
  });
});

describe("sanitizeUrl", () => {
  it("strips the query and hash", () => {
    expect(sanitizeUrl("https://x.test/reset-password?token=abc#h")).toBe(
      "https://x.test/reset-password",
    );
    expect(sanitizeUrl("https://x.test/?checkout=success")).toBe("https://x.test/");
    expect(sanitizeUrl("/login?redirect=/lessons/a")).toBe("/login");
  });

  it("leaves non-URL markers alone", () => {
    expect(sanitizeUrl("$direct")).toBe("$direct");
  });
});

describe("before_send", () => {
  it("sanitises every URL property", () => {
    const { before_send } = posthogOptions("https://us.i.posthog.com");
    const out = before_send({
      event: "$pageview",
      properties: {
        $current_url: "https://x.test/reset-password?token=abc",
        $referrer: "https://x.test/login?redirect=/a#b",
        $initial_referrer: "$direct",
        $pathname: "/lessons/a?x=1",
        stage: "staging",
      },
    });
    expect(out?.properties).toEqual({
      $current_url: "https://x.test/reset-password",
      $referrer: "https://x.test/login",
      $initial_referrer: "$direct",
      $pathname: "/lessons/a",
      stage: "staging",
    });
  });

  it("passes a null event through", () => {
    expect(posthogOptions("https://h.test").before_send(null)).toBeNull();
  });
});
