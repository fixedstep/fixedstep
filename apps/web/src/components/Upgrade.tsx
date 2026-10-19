import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ApiError, api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { withUpgrade } from "../lib/redirect";
import { PRICING } from "../pages/home/content";

export type Interval = "month" | "year";

/**
 * Starts Pro checkout. Guests and signed-out visitors go through sign-up first; the redirect
 * back carries ?upgrade=<interval>, which resumes checkout once there's a real account.
 */
export function useUpgrade() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const navigate = useNavigate();
  const href = useLocation({ select: (l) => l.href });
  const checkout = useMutation({
    mutationFn: api.checkout,
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const user = me.data?.user;
  const needsAccount = !user || user.isAnonymous;

  const start = (interval: Interval) => {
    if (needsAccount) {
      void navigate({
        to: "/login",
        search: { mode: "signUp", redirect: withUpgrade(href, interval) },
      });
    } else {
      checkout.mutate(interval);
    }
  };

  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !user || user.isAnonymous) return;
    const url = new URL(window.location.href);
    const interval = url.searchParams.get("upgrade");
    if (interval !== "month" && interval !== "year") return;
    resumed.current = true;
    url.searchParams.delete("upgrade");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    checkout.mutate(interval);
  }, [user, checkout.mutate]);

  return { start, checkout, needsAccount };
}

export function BillingToggle({
  yearly,
  onChange,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  return (
    <fieldset className="billing-toggle" aria-label="Billing period">
      <button
        type="button"
        aria-pressed={!yearly}
        className={!yearly ? "active" : undefined}
        onClick={() => onChange(false)}
      >
        Monthly
      </button>
      <button
        type="button"
        aria-pressed={yearly}
        className={yearly ? "active" : undefined}
        onClick={() => onChange(true)}
      >
        Yearly <span className="save">{PRICING.yearly.note}</span>
      </button>
    </fieldset>
  );
}

/** What went wrong starting checkout, with the fix (verify email, sign in again). */
export function UpgradeErrors({
  checkout,
}: {
  checkout: ReturnType<typeof useUpgrade>["checkout"];
}) {
  const href = useLocation({ select: (l) => l.href });
  const err = checkout.error;
  if (!(err instanceof ApiError)) return checkout.isError ? <CheckoutFailed /> : null;
  const interval = checkout.variables ?? "month";
  if ((err.body as { code?: string } | null)?.code === "email_unverified") {
    return <VerifyEmailPrompt callbackURL={withUpgrade(href, interval)} />;
  }
  if (err.status === 401) {
    return (
      <p className="muted">
        <Link to="/login" search={{ redirect: withUpgrade(href, interval) }}>
          Sign in
        </Link>{" "}
        first, then upgrade.
      </p>
    );
  }
  if (err.status === 409) {
    return (
      <p className="error">
        {interval === "year" ? "Yearly" : "Monthly"} billing isn't available yet.
      </p>
    );
  }
  return <CheckoutFailed />;
}

function CheckoutFailed() {
  return <p className="error">Couldn't start checkout. Try again.</p>;
}

function VerifyEmailPrompt({ callbackURL }: { callbackURL: string }) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const email = me.data?.user?.email;
  const resend = useMutation({
    mutationFn: async () => {
      if (!email) throw new Error("not signed in");
      const res = await authClient.sendVerificationEmail({ email, callbackURL });
      if (res.error) throw new Error(res.error.message);
    },
  });

  return (
    <p className="muted">
      Verify your email before upgrading. Check {email ?? "your inbox"} for the link
      {resend.isSuccess ? " (sent again)." : ", or "}
      {!resend.isSuccess && (
        <button
          type="button"
          className="link-button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
        >
          send it again
        </button>
      )}
      {resend.isError && <span className="error"> Couldn't send it. Try again.</span>}
    </p>
  );
}
