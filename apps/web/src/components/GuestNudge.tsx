import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { api } from "../lib/api";

/**
 * Asks a guest to create an account so their progress isn't tied to one browser. `message`
 * replaces the default wording and becomes the sign-up link's text.
 */
export function GuestNudge({ message }: { message?: string }) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const href = useLocation({ select: (l) => l.href });
  if (!me.data?.user?.isAnonymous) return null;
  if (message) {
    return (
      <p className="guest-nudge">
        <Link to="/login" search={{ mode: "signUp", redirect: href }}>
          {message}
        </Link>
      </p>
    );
  }
  return (
    <p className="guest-nudge">
      You're learning as a guest, so this progress lives in this browser only.{" "}
      <Link to="/login" search={{ mode: "signUp", redirect: href }}>
        Create a free account
      </Link>{" "}
      to keep it.
    </p>
  );
}
