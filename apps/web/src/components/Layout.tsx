import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";

export function Layout() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

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
              <span className="stat" title="Day streak">🔥 {me.data.streak}</span>
              <span className="stat" title="Experience">⭐ {me.data.xp} XP</span>
              {me.data.pro && <span className="badge">PRO</span>}
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
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
