import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { authApi, googleLoginUrl } from "../api";
import { useAuth } from "../context/AuthContext";
import { friendlyError } from "../config/errors";
import AuthLayout from "../components/AuthLayout";
import { Field, Notice, PasswordInput } from "../components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState(false);

  function validate() {
    const e = {};
    if (!name.trim()) e.name = "Enter your name.";
    else if (name.trim().length > 80) e.name = "Your name can be up to 80 characters.";
    if (!email.trim()) e.email = "Enter your email.";
    else if (!EMAIL_RE.test(email.trim())) e.email = "That email doesn't look right.";
    if (!password) e.password = "Choose a password.";
    else if (password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`;
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    setFormError("");
    setEmailTaken(false);
    if (!validate()) return;

    setBusy(true);
    try {
      const data = await authApi.signup({ name: name.trim(), email: email.trim(), password });
      if (!data.token) throw new Error("No token");
      login(data.token, data.user);
      navigate("/continue", { replace: true });
    } catch (err) {
      if (err.code === "EMAIL_TAKEN") {
        setEmailTaken(true);
        setFieldErrors({ email: friendlyError(err) });
      } else if (err.code === "WEAK_PASSWORD") {
        setFieldErrors({ password: friendlyError(err) });
      } else if (err.code === "INVALID_EMAIL") {
        setFieldErrors({ email: friendlyError(err) });
      } else {
        setFormError(friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={<>Join the <em>voyage.</em></>}
      footer={<>Already have an account? <Link to="/login">Log in</Link></>}
    >
      <form onSubmit={submit} className="form" noValidate>
        <Field label="Your name" htmlFor="name" error={fieldErrors.name}>
          <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Asha Rao" aria-invalid={!!fieldErrors.name} maxLength={80} />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <input id="email" type="email" autoComplete="email" inputMode="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
            aria-invalid={!!fieldErrors.email} />
          {emailTaken && <small><Link to="/login">Log in instead</Link></small>}
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password} hint={`At least ${MIN_PASSWORD} characters.`}>
          <PasswordInput id="password" value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} placeholder="Choose a password" invalid={!!fieldErrors.password} />
        </Field>

        {formError && <Notice>{formError}</Notice>}

        <button className="btn btn-gold btn-block" disabled={busy}>
          {busy ? "Please wait…" : "Create my account"} <ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>

      <div className="divider"><span>or</span></div>
      <a className="btn btn-cream btn-block" href={googleLoginUrl()}>Sign up with Google</a>
    </AuthLayout>
  );
}
