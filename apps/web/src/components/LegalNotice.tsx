import { Link } from "@tanstack/react-router";

/** Shown where signing up or paying happens. Opens the pages in a new tab, so form input survives. */
export function AgreeNotice({ lead }: { lead: string }) {
  return (
    <p className="muted legal-notice">
      {lead}, you agree to the{" "}
      <Link to="/terms" target="_blank">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link to="/privacy" target="_blank">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
