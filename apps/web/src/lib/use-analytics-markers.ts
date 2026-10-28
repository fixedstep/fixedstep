import { useEffect, useRef } from "react";
import { analytics } from "./analytics";
import type { Me } from "./api";

/**
 * Records events for full-page redirects that come back with a marker param, then strips it
 * (same pattern as `useUpgrade`'s ?upgrade=):
 * - `?verified=1` (the verify-email link; sign-up's callbackURL): `email_verified`, if there's
 *   no `error` param and /me says the email is verified.
 * - `?signed_up=github` (better-auth's `newUserCallbackURL`, first-time GitHub sign-ins only):
 *   `sign_up`. `fromGuest` is unknown after the redirect, so it's reported as false.
 */
export function useAnalyticsMarkers(me: Me | undefined) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !me) return;
    done.current = true;
    const url = new URL(window.location.href);
    const { searchParams } = url;
    const verified = searchParams.get("verified") === "1";
    const github = searchParams.get("signed_up") === "github";
    if (!verified && !github) return;

    const user = me.user;
    if (verified && !searchParams.has("error") && user?.emailVerified) {
      analytics.track({ name: "email_verified" });
    }
    if (github && user && !user.isAnonymous) {
      analytics.track({ name: "sign_up", method: "github", fromGuest: false });
    }
    searchParams.delete("verified");
    searchParams.delete("signed_up");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [me]);
}
