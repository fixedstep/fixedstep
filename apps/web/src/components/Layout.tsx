import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { analytics } from "../lib/analytics";
import { api } from "../lib/api";
import { useAnalyticsMarkers } from "../lib/use-analytics-markers";
import { GITHUB_URL } from "../pages/home/content";
import { UserMenu } from "./UserMenu";

export function Layout() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const href = useLocation({ select: (l) => l.href });
  const user = me.data ? me.data.user : undefined;

  useEffect(() => {
    if (user !== undefined) analytics.setUser(user);
  }, [user]);
  useAnalyticsMarkers(me.data);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          fixedstep
        </Link>
        <nav className="topbar-right">
          {me.data?.user ? (
            <>
              <span className="stat" title="Day streak">
                🔥 {me.data.streak}
              </span>
              <span className="stat" title="Experience">
                ⭐ {me.data.xp} XP
              </span>
              {me.data.pro && <span className="badge topbar-pro">PRO</span>}
              {me.data.user.isAnonymous ? (
                // No account menu for guests: sign-out would orphan their progress.
                <Link
                  to="/login"
                  search={{ mode: "signUp", redirect: href }}
                  className="button primary small"
                >
                  Save progress
                </Link>
              ) : (
                <UserMenu user={me.data.user} pro={me.data.pro} />
              )}
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span className="muted">© {new Date().getFullYear()} Fixedstep</span>
        <nav>
          <Link to="/">Courses</Link>
          <a href="/#pricing">Pricing</a>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}
