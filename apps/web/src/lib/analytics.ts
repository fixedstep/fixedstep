import type { ClientConfig } from "@fixedstep/content-schema";
import type { Me } from "./api";

/**
 * Product analytics (PostHog), privacy-first: in-memory persistence (no cookies or local
 * storage, so no consent banner), no autocapture or session recording, URLs stripped of query
 * and hash, and users identified by their opaque id only. Everything is a no-op until
 * `init(config)` runs, and `init(null)` (no key configured: local, e2e, CI) never even loads
 * posthog-js.
 *
 * Event props are ids, slugs and enums only, never free text or lesson content. There's no
 * view/attempt data client-side, so "course started" means the first lesson completed in it.
 * A full-page redirect (GitHub login, Polar checkout, verify-email link) starts a new anonymous
 * id, so events from before it don't join the identified ones after it (accepted, see README).
 */
export type AnalyticsEvent =
  | { name: "sign_up"; method: "email" | "github"; fromGuest: boolean }
  | { name: "email_verified" }
  | { name: "course_started"; course: string }
  | { name: "lesson_completed"; course: string; lessonId: string; kind: string }
  | { name: "checkout_started"; interval: "month" | "year" }
  | { name: "checkout_completed" };

type CaptureResult = { event: string; properties: Record<string, unknown> };

/** The subset of the posthog-js API used here. */
export type PostHogLike = {
  init(key: string, options: ReturnType<typeof posthogOptions>): unknown;
  register(props: Record<string, unknown>): void;
  capture(event: string, props?: Record<string, unknown>, options?: { transport?: string }): void;
  identify(id: string): void;
  reset(): void;
};

/** Origin + path only: `/reset-password?token=…`, `?redirect=` and `?checkout=` never leave. */
export function sanitizeUrl(href: string): string {
  try {
    const url = new URL(href);
    return url.origin + url.pathname;
  } catch {
    // Not absolute: a path, or a PostHog marker like "$direct".
    return href.split(/[?#]/)[0] ?? href;
  }
}

const URL_PROPS = [
  "$current_url",
  "$referrer",
  "$initial_referrer",
  "$initial_current_url",
  "$session_entry_url",
  "$session_entry_referrer",
  "$pathname",
  "$initial_pathname",
];

export function posthogOptions(host: string) {
  return {
    api_host: host,
    persistence: "memory" as const,
    autocapture: false,
    capture_pageview: false, // sent on route resolve instead
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only" as const,
    before_send: (cr: CaptureResult | null): CaptureResult | null => {
      if (!cr) return cr;
      for (const key of URL_PROPS) {
        const value = cr.properties[key];
        if (typeof value === "string") cr.properties[key] = sanitizeUrl(value);
      }
      return cr;
    },
  };
}

const BUFFER_CAP = 50;

export function createAnalytics(load: () => Promise<PostHogLike>) {
  let state: "pending" | "on" | "off" = "pending";
  let ph: PostHogLike | null = null;
  let buffer: Array<(ph: PostHogLike) => void> = [];
  let identified: string | null = null;

  const run = (fn: (ph: PostHogLike) => void) => {
    if (state === "off") return;
    if (ph) fn(ph);
    else if (buffer.length < BUFFER_CAP) buffer.push(fn);
  };

  return {
    async init(config: ClientConfig["analytics"]): Promise<void> {
      if (!config) {
        state = "off";
        buffer = [];
        return;
      }
      try {
        const loaded = await load();
        loaded.init(config.key, posthogOptions(config.host));
        // Before anything buffered is flushed, so the first events carry the stage too.
        loaded.register({ stage: config.stage });
        ph = loaded;
        state = "on";
        const pending = buffer;
        buffer = [];
        for (const fn of pending) fn(loaded);
      } catch {
        state = "off"; // blocked or failed to load: analytics must never break the app
        buffer = [];
      }
    },

    track(event: AnalyticsEvent, opts: { beacon?: boolean } = {}): void {
      const { name, ...props } = event;
      run((p) => p.capture(name, props, opts.beacon ? { transport: "sendBeacon" } : undefined));
    },

    pageview(): void {
      run((p) => p.capture("$pageview"));
    },

    /** Identify real accounts by id only; guests stay anonymous; reset on sign-out. */
    setUser(user: Me["user"]): void {
      const id = user && !user.isAnonymous ? user.id : null;
      if (id === identified) return;
      const wasIdentified = identified !== null;
      identified = id;
      if (id) run((p) => p.identify(id));
      else if (wasIdentified) run((p) => p.reset());
    },
  };
}

export const analytics = createAnalytics(() =>
  // Loaded only when a key is configured, so local/e2e/CI never fetch or run it.
  import("posthog-js").then((m) => m.default as unknown as PostHogLike),
);
