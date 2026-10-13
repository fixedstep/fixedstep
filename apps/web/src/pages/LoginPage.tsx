import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { authClient } from "../lib/auth-client";

export function LoginPage() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    await qc.invalidateQueries();
    await navigate({ to: "/" });
  };

  return (
    <div className="login">
      <h1>{mode === "signIn" ? "Sign in" : "Create an account"}</h1>
      <button
        type="button"
        onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/" })}
      >
        Continue with GitHub
      </button>
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
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">
          {mode === "signIn" ? "Sign in" : "Sign up"}
        </button>
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
      >
        {mode === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
