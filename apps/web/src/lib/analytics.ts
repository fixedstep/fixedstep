import type { ClientConfig } from "@fixedstep/content-schema";
import type { CaptureResult, PostHogConfig } from "posthog-js";
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

/** The subset of the posthog-js API used here. */
export type PostHogLike = {
  init(key: string, options: Partial<PostHogConfig>): unknown;
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

/** Search-referrer free text (`store_google`, also pinned off) has no business leaving. */
const KEYWORD_KEY = /ph_keyword|search_engine/;

const MAX_DEPTH = 12;

/** One entry per custom event, so adding or removing a variant of the union is a type error. */
const CUSTOM_EVENT_NAMES: Record<AnalyticsEvent["name"], true> = {
  sign_up: true,
  email_verified: true,
  course_started: true,
  lesson_completed: true,
  checkout_started: true,
  checkout_completed: true,
};

/**
 * The only events that may leave the browser: our own, plus `$pageview` and `$identify`
 * (`identify()` emits just `$identify`; person props ride on it as `$set` / `$set_once`, so no
 * separate `$set` event is needed). Anything else PostHog or its project settings produce
 * (`$web_vitals`, `$heatmap`, `$dead_click`, `$exception`, `$autocapture`, `$pageleave`, …) is
 * dropped.
 */
const ALLOWED_EVENTS: ReadonlySet<string> = new Set([
  "$pageview",
  "$identify",
  ...Object.keys(CUSTOM_EVENT_NAMES),
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Strips query and hash from an absolute http(s) URL, or a path starting with `/`. */
function sanitizeString(value: string): string {
  if (/^https?:\/\//i.test(value)) return sanitizeUrl(value);
  if (value.startsWith("/") && /[?#]/.test(value)) return sanitizeUrl(value);
  return value;
}

/** Deep copy of `value` with URLs sanitised in string values and object keys. */
function sanitizeDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (depth > MAX_DEPTH) return undefined; // deeper than anything we send: drop, don't pass raw
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v, depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (KEYWORD_KEY.test(key)) continue;
    out[sanitizeString(key)] = sanitizeDeep(v, depth + 1);
  }
  return out;
}

function sanitizeBag(bag: unknown): void {
  if (!bag || typeof bag !== "object") return;
  const props = bag as Record<string, unknown>;
  for (const key of URL_PROPS) {
    const value = props[key];
    if (typeof value === "string") props[key] = sanitizeUrl(value);
  }
}

export function posthogOptions(host: string) {
  return {
    api_host: host,
    persistence: "memory" as const,
    capture_pageview: false, // sent on route resolve instead
    // Everything below is pinned off on the client because PostHog project settings can switch
    // these on remotely (a client boolean wins over remote config in posthog-js 1.441.2; for
    // `autocapture` there's no remote switch at all). Several put full URLs, query strings
    // included, in nested props. Don't rely on project toggles: they do nothing here.
    autocapture: false,
    rageclick: false,
    capture_pageleave: false,
    capture_performance: false, // web vitals + network timing (`$web_vitals`)
    capture_heatmaps: false, // `$$heatmap`, keyed by location.href
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_webmcp: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_scroll_properties: true,
    advanced_disable_toolbar_metrics: true,
    // `identify()` reloads flags, and that `/flags` POST carries raw `$initial_current_url`
    // (query included) and bypasses `before_send`. Only this sets `remoteRequestsDisabled`;
    // `advanced_disable_feature_flags` alone doesn't stop the request.
    advanced_disable_flags: true,
    store_google: false, // registers `ph_keyword` from search-referrer free text
    person_profiles: "identified_only" as const,
    before_send: (cr: CaptureResult | null): CaptureResult | null => {
      if (!cr) return cr;
      if (!ALLOWED_EVENTS.has(cr.event)) return null;
      // Backstop: strip query and hash from every URL-like string and key, at any depth.
      const out = sanitizeDeep(cr) as CaptureResult;
      // Person info rides on `$identify` as top-level `$set` / `$set_once` (initial URL and
      // referrer), and events can also nest them under `properties`.
      for (const bag of [out.properties, out.$set, out.$set_once]) {
        sanitizeBag(bag);
        sanitizeBag(bag?.$set);
        sanitizeBag(bag?.$set_once);
      }
      return out;
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
      if (id) {
        // Account to account: reset first so the two never merge. Anonymous to identified
        // must not reset, so the guest funnel links.
        run((p) => {
          if (wasIdentified) p.reset();
          p.identify(id);
        });
      } else if (wasIdentified) run((p) => p.reset());
    },
  };
}

export const analytics = createAnalytics(() =>
  // Loaded only when a key is configured, so local/e2e/CI never fetch or run it.
  import("posthog-js").then((m): PostHogLike => m.default),
);
