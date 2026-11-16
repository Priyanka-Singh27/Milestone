import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { googleLoginUrl, login, signup } from "../api";
import { useAuth } from "../context/Auth";
import { Mascot } from "../components/art/Mascots";
import { Notice } from "../components/ui";
import { Cloud, Px, useScrollVar } from "../components/art/Scenery";

const AUTH_ERRORS = {
  INVALID_CREDENTIALS: "That email and password don't match. Try again?",
  EMAIL_TAKEN: "That email already has an account. Try signing in instead.",
  PASSWORD_TOO_SHORT: "Pick a password with at least 8 characters.",
  INVALID_EMAIL: "That email doesn't look quite right.",
  MISSING_FIELDS: "Please fill in every field.",
  USE_GOOGLE_LOGIN: "This account was created with Google. Use “Continue with Google”.",
  SERVER_ERROR: "Something went wrong on our side. Please try again in a moment.",
};

export default function Auth() {
  useScrollVar();
  const { authenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") || "");

  if (authenticated) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data =
        mode === "login"
          ? await login({ email, password })
          : await signup({ name, email, password });
      if (!data?.token) throw new Error("The server did not return a login token.");
      signIn(data.token, data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-sky" aria-hidden="true">
        <Px p={0.3} style={{ left: "8%", top: "12%", width: 220 }} className="abs"><Cloud /></Px>
        <Px p={0.2} style={{ right: "6%", top: "22%", width: 280 }} className="abs"><Cloud /></Px>
      </div>

      <div className="auth-wrap">
        <div className="auth-cast" aria-hidden="true">
          <Mascot who="captain" size={120} />
          <Mascot who="poppy" size={104} />
        </div>

        <div className="frame auth-card">
          <Link to="/welcome" className="brand auth-brand">
            <span className="brand-mark"><Compass size={20} /></span>
            <span className="brand-name">milestone</span>
          </Link>

          <h1>
            {mode === "login" ? "Welcome back, " : "Join the "}
            <em>{mode === "login" ? "traveller." : "voyage."}</em>
          </h1>

          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "login"}
              className={mode === "login" ? "tab-on" : ""} onClick={() => setMode("login")}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === "signup"}
              className={mode === "signup" ? "tab-on" : ""} onClick={() => setMode("signup")}>
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="form">
            {mode === "signup" && (
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Asha Rao" />
              </label>
            )}
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" />
            </label>

            {error && <Notice>{error}</Notice>}

            <button className="btn btn-gold" disabled={busy}>
              {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create my account"}
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="divider"><span>or</span></div>
          <a className="btn btn-cream btn-block" href={googleLoginUrl}>Continue with Google</a>
        </div>
      </div>
    </div>
  );
}

/** Google redirects here as /auth/callback#token=... */
export function AuthCallback() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    if (token) {
      signIn(token);
      navigate("/", { replace: true });
    } else {
      navigate("/login?error=Google sign-in did not complete.", { replace: true });
    }
  }, [signIn, navigate]);

  return null;
}