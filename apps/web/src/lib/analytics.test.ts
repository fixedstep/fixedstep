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
      uuid: "u",
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

describe("PII", () => {
  const jsonOfCalls = (ph: ReturnType<typeof fakePostHog>["ph"]) =>
    JSON.stringify([
      ph.init.mock.calls.map((c) => c[0]),
      ph.register.mock.calls,
      ph.capture.mock.calls,
      ph.identify.mock.calls,
    ]);

  it("never sends the email or name in any PostHog call", async () => {
    const { ph } = fakePostHog();
    const a = createAnalytics(async () => ph);
    a.setUser(user());
    await a.init(config);
    a.pageview();
    a.setUser(user());
    a.track({ name: "sign_up", method: "email", fromGuest: true });
    a.track({ name: "lesson_completed", course: "c", lessonId: "l", kind: "code" });
    a.track({ name: "checkout_started", interval: "month" }, { beacon: true });
    a.setUser(null);
    const json = jsonOfCalls(ph);
    expect(json).not.toContain("ada@example.com");
    expect(json).not.toContain("Ada");
    expect(ph.identify).toHaveBeenCalledWith("u1");
  });

  it("passes only the event name and its own props to capture", async () => {
    const { ph } = fakePostHog();
    const a = createAnalytics(async () => ph);
    await a.init(config);
    a.track({ name: "sign_up", method: "github", fromGuest: false });
    expect(ph.capture).toHaveBeenCalledWith(
      "sign_up",
      { method: "github", fromGuest: false },
      undefined,
    );
  });
});

describe("buffered identity", () => {
  it("flushes an identify queued before init, after the stage is registered", async () => {
    const { ph } = fakePostHog();
    const a = createAnalytics(async () => ph);
    a.setUser(user());
    expect(ph.identify).not.toHaveBeenCalled();
    await a.init(config);
    expect(ph.identify).toHaveBeenCalledWith("u1");
    expect(ph.register.mock.invocationCallOrder[0]).toBeLessThan(
      ph.identify.mock.invocationCallOrder[0] as number,
    );
  });

  it("drops buffered identify and events when init(null) arrives", async () => {
    const { ph } = fakePostHog();
    const load = vi.fn(async () => ph);
    const a = createAnalytics(load);
    a.setUser(user());
    a.pageview();
    await a.init(null);
    expect(load).not.toHaveBeenCalled();
    expect(ph.identify).not.toHaveBeenCalled();
    expect(ph.capture).not.toHaveBeenCalled();
  });

  it("goes quiet, dropping the buffer, when posthog.init itself throws", async () => {
    const { ph } = fakePostHog();
    ph.init.mockImplementation(() => {
      throw new Error("bad config");
    });
    const a = createAnalytics(async () => ph);
    a.pageview();
    await expect(a.init(config)).resolves.toBeUndefined();
    a.pageview();
    a.setUser(user());
    expect(ph.capture).not.toHaveBeenCalled();
    expect(ph.identify).not.toHaveBeenCalled();
  });
});

describe("posthog-js is only imported when a key is configured", () => {
  it("the default instance never loads posthog-js for init(null)", async () => {
    vi.resetModules();
    const factory = vi.fn(() => ({ default: { init: vi.fn() } }));
    vi.doMock("posthog-js", factory);
    const mod = await import("./analytics");
    mod.analytics.pageview();
    await mod.analytics.init(null);
    mod.analytics.track({ name: "email_verified" });
    expect(factory).not.toHaveBeenCalled();
    vi.doUnmock("posthog-js");
  });
});

describe("sanitizeUrl edge cases", () => {
  it("strips tokens, redirect and checkout params in any position", () => {
    expect(sanitizeUrl("https://x.test/reset-password?token=SECRET")).not.toContain("SECRET");
    expect(sanitizeUrl("https://x.test/login?redirect=%2Fa&x=1")).toBe("https://x.test/login");
    expect(sanitizeUrl("https://x.test/#/reset?token=SECRET")).toBe("https://x.test/");
    expect(sanitizeUrl("https://x.test:8080/a/b/?checkout=success#z")).toBe(
      "https://x.test:8080/a/b/",
    );
    expect(sanitizeUrl("/reset-password?token=SECRET#h")).toBe("/reset-password");
    expect(sanitizeUrl("")).toBe("");
  });
});

describe("before_send edge cases", () => {
  const { before_send } = posthogOptions("https://us.i.posthog.com");

  it("sanitises session-entry and initial URL props, and an external referrer", () => {
    const out = before_send({
      event: "$pageview",
      uuid: "u",
      properties: {
        $initial_referrer: "https://google.test/search?q=my+email@x.test",
        $initial_current_url: "https://x.test/reset-password?token=SECRET",
        $session_entry_url: "https://x.test/?checkout=success",
        $session_entry_referrer: "https://x.test/login?redirect=/a",
        $initial_pathname: "/a?b=1",
      },
    });
    expect(JSON.stringify(out)).not.toMatch(/SECRET|email@|checkout=|redirect=|\?/);
  });

  it("leaves non-string URL props and other props untouched", () => {
    const out = before_send({
      event: "$pageview",
      uuid: "u",
      properties: { $current_url: 5, $referrer: undefined, lessonId: "a?b" },
    });
    expect(out?.properties).toEqual({ $current_url: 5, $referrer: undefined, lessonId: "a?b" });
  });

  it("sanitises $set_once and $set on $identify, and nested ones in properties", () => {
    const out = before_send({
      event: "$identify",
      uuid: "u",
      properties: {
        distinct_id: "user-1",
        $set_once: { $initial_current_url: "https://x.test/a?token=SECRET2#frag" },
        $current_url: "https://x.test/",
      },
      $set: { $current_url: "https://x.test/b?token=SECRET3", name: "n" },
      $set_once: {
        $initial_current_url: "https://x.test/reset-password?token=SECRET",
        $initial_pathname: "/reset-password?token=SECRET",
        $initial_referrer: "https://google.test/?q=SECRET",
        $session_entry_url: "https://x.test/?checkout=success#h",
      },
    });
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/SECRET/);
    expect(json).not.toContain("?");
    expect(json).not.toContain("#");
    expect(out?.$set_once?.$initial_current_url).toBe("https://x.test/reset-password");
    expect(out?.$set?.name).toBe("n");
  });
});

describe("remote-switchable capture is pinned off", () => {
  const opts = posthogOptions("https://us.i.posthog.com");

  it("pins every feature that project settings can turn on", () => {
    expect(opts).toMatchObject({
      autocapture: false,
      rageclick: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_performance: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_webmcp: false,
      store_google: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_scroll_properties: true,
    });
  });

  it.each([
    "$web_vitals",
    "$heatmap",
    "$$heatmap",
    "$dead_click",
    "$exception",
    "$autocapture",
    "$rageclick",
    "$pageleave",
    "$set",
    "something_else",
  ])("drops %s", (event) => {
    expect(opts.before_send({ event, uuid: "u", properties: {} })).toBeNull();
  });

  it.each([
    "$pageview",
    "$identify",
    "sign_up",
    "email_verified",
    "course_started",
    "lesson_completed",
    "checkout_started",
    "checkout_completed",
  ])("allows %s", (event) => {
    expect(opts.before_send({ event, uuid: "u", properties: {} })).not.toBeNull();
  });

  it("strips URLs from nested props, arrays and keys of an allowed event", () => {
    const out = opts.before_send({
      event: "$pageview",
      uuid: "u",
      properties: {
        nested: { deeper: [{ href: "https://x.test/reset-password?token=SECRET" }] },
        list: ["/reset-password?token=SECRET", "plain?text"],
        "/reset-password?token=SECRET": 1,
        "https://x.test/a#SECRET": { v: "/b#SECRET" },
        $web_vitals_LCP_event: {
          $current_url: "https://x.test/p?token=SECRET",
          navigationURL: "/q?SECRET",
        },
        ph_keyword: "SECRET",
        $initial_ph_keyword: "SECRET",
        $search_engine: "google",
      },
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain("SECRET");
    expect(json).toContain("/reset-password");
    expect(json).toContain("plain?text");
    expect(out?.properties).not.toHaveProperty("ph_keyword");
    expect(out?.properties).not.toHaveProperty("$search_engine");
  });
});
