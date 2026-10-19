import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";

type Mode = "signIn" | "signUp" | "forgot";

/** `redirect`: a same-origin path to return to (validated in the router). */
export type LoginSearch = { mode?: "signUp"; redirect?: string };

const TITLES: Record<Mode, string> = {
  signIn: "Sign in",
  signUp: "Create an account",
  forgot: "Reset your password",
};
const SUBMIT_LABELS: Record<Mode, string> = {
  signIn: "Sign in",
  signUp: "Sign up",
  forgot: "Send reset link",
};

export function LoginPage() {
  const search = useSearch({ from: "/login" });
  const redirect = search.redirect ?? "/";
  const [mode, setMode] = useState<Mode>(search.mode ?? "signIn");
  const guest = useQuery({ queryKey: ["me"], queryFn: api.me }).data?.user?.isAnonymous;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "forgot") {
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (res.error) setError(res.error.message ?? "Something went wrong");
      else setNotice("If that email has an account, we've sent it a link to reset the password.");
      return;
    }
    const res =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name, callbackURL: redirect });
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    await qc.invalidateQueries();
    router.history.push(redirect);
  };

  return (
    <div className="login">
      <h1>{guest && mode === "signUp" ? "Save your progress" : TITLES[mode]}</h1>
      {guest && mode !== "forgot" && (
        <p className="muted">
          Your guest XP, streak and completed lessons move to the account you{" "}
          {mode === "signUp" ? "create" : "sign in to"}.
        </p>
      )}
      {mode !== "forgot" && (
        <button
          type="button"
          onClick={() => authClient.signIn.social({ provider: "github", callbackURL: redirect })}
        >
          Continue with GitHub
        </button>
      )}
      <form onSubmit={onSubmit}>
        {mode === "signUp" && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== "forgot" && (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p>{notice}</p>}
        <button type="submit" className="primary">
          {SUBMIT_LABELS[mode]}
        </button>
      </form>
      {mode === "signIn" && (
        <button type="button" className="link-button" onClick={() => switchMode("forgot")}>
          Forgot password?
        </button>
      )}
      <button
        type="button"
        className="link-button"
        onClick={() => switchMode(mode === "signUp" ? "signIn" : "signUp")}
      >
        {mode === "signUp" ? "Have an account? Sign in" : "Need an account? Sign up"}
      </button>
    </div>
  );
}
