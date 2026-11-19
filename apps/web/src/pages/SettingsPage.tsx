import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";

/** A placeholder: later tasks add profile picture, display name, leaderboard and deletion. */
export function SettingsPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const user = me.data?.user;

  return (
    <section className="settings">
      <h1>Settings</h1>
      {user && !user.isAnonymous && (
        <>
          <p className="muted">Signed in as {user.email}.</p>
          <p>
            More settings are coming: profile picture, display name, leaderboard visibility and
            account deletion.
          </p>
        </>
      )}
      {user?.isAnonymous && (
        <p>
          You're using a guest account.{" "}
          <Link to="/login" search={{ mode: "signUp", redirect: "/settings" }}>
            Create an account
          </Link>{" "}
          to keep your progress.
        </p>
      )}
      {me.data && !user && (
        <p>
          <Link to="/login" search={{ redirect: "/settings" }}>
            Sign in
          </Link>{" "}
          to manage your account.
        </p>
      )}
    </section>
  );
}
