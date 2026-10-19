import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { GITHUB_URL } from "../pages/home/content";
import { ManageBillingButton } from "./ManageBillingButton";

export function Layout() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const href = useLocation({ select: (l) => l.href });

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
              {me.data.pro && (
                <>
                  <span className="badge">PRO</span>
                  <ManageBillingButton />
                </>
              )}
              {me.data.user.isAnonymous ? (
                // No sign-out for guests: it would orphan their progress.
                <Link
                  to="/login"
                  search={{ mode: "signUp", redirect: href }}
                  className="button primary small"
                >
                  Save progress
                </Link>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={async () => {
                    await authClient.signOut();
                    await qc.invalidateQueries();
                  }}
                >
                  Sign out
                </button>
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
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}
