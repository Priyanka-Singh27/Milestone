import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { authApi, googleLoginUrl } from "../api";
import { flashStore, returnStore } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { friendlyError, GOOGLE_ERRORS } from "../config/errors";
import AuthLayout from "../components/AuthLayout";
import { Field, Notice, PasswordInput } from "../components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = location.state?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleHint, setGoogleHint] = useState(false);
  const [flash, setFlash] = useState("");

  // "Your session expired" notice + errors coming back from the Google redirect.
  useEffect(() => {
    const message = flashStore.take();
    if (message) setFlash(message);
    const code = params.get("error");
    if (code) setFormError(GOOGLE_ERRORS[code] || GOOGLE_ERRORS.GOOGLE_FAILED);
  }, [params]);

  function validate() {
    const e = {};
    if (!email.trim()) e.email = "Enter your email.";
    else if (!EMAIL_RE.test(email.trim())) e.email = "That email doesn't look right.";
    if (!password) e.password = "Enter your password.";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFormError("");
    setGoogleHint(false);
    if (!validate()) return;

    setBusy(true);
    try {
      const data = await authApi.login({ email: email.trim(), password });
      if (!data.token) throw new Error("No token");
      login(data.token, data.user);
      navigate("/continue", { replace: true, state: { from } });
    } catch (err) {
      if (err.code === "USE_GOOGLE_LOGIN") setGoogleHint(true);
      setFormError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={<>Welcome back, <em>traveller.</em></>}
      footer={<>New here? <Link to="/signup">Create an account</Link></>}
    >
      {flash && <Notice tone="info">{flash}</Notice>}

      <form onSubmit={submit} className="form" noValidate>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <input id="email" type="email" autoComplete="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
            aria-invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password}>
          <PasswordInput id="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} placeholder="Your password" invalid={!!fieldErrors.password} />
        </Field>

        {formError && <Notice>{formError}</Notice>}

        <button className="btn btn-gold btn-block" disabled={busy}>
          {busy ? "Please wait…" : "Log in"} <ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>

      <div className="divider"><span>or</span></div>
      <a
        className={`btn btn-cream btn-block ${googleHint ? "btn-highlight" : ""}`}
        href={googleLoginUrl()}
        onClick={() => from && returnStore.set(from)}
      >
        Continue with Google
      </a>
    </AuthLayout>
  );
}
