import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { authClient } from "../lib/auth-client";

/** Landing page for the emailed reset link; Better Auth redirects here with ?token or ?error. */
export function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    const res = await authClient.resetPassword({ newPassword: password, token });
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    setDone(true);
  };

  if (!token || params.get("error")) {
    return (
      <div className="login">
        <h1>Link expired</h1>
        <p>This reset link is invalid or has expired.</p>
        <Link to="/login">Request a new one</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login">
        <h1>Password updated</h1>
        <p>You've been signed out everywhere. Sign in with your new password.</p>
        <Link to="/login">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="login">
      <h1>Choose a new password</h1>
      <form onSubmit={onSubmit}>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">
          Set password
        </button>
      </form>
    </div>
  );
}
