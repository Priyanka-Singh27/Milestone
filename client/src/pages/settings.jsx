import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { profileApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { useRoadmap } from "../context/RoadmapContext";
import { useRoles } from "../context/RolesContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { friendlyError } from "../config/errors";
import { AUTO_THEME } from "../theme/themes";
import { ConfirmDialog, ErrorBanner, Field, Frame, Notice, PageHead } from "../components/ui";
import { RoleCards } from "./onboarding/RoleStep";

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const { roles, status, error, reload, idOf } = useRoles();
  const { status: roadmapStatus } = useRoadmap();
  const { setting, choose, themes } = useTheme();
  const toast = useToast();

  const [name, setName] = useState(user?.name || "");
  const [roleId, setRoleId] = useState(user?.targetRoleId || "");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [confirmRole, setConfirmRole] = useState(false);
  const [roleChanged, setRoleChanged] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setRoleId(user?.targetRoleId || "");
  }, [user]);

  // Only send what changed.
  const changes = useMemo(() => {
    const c = {};
    if (name.trim() !== (user?.name || "")) c.name = name.trim();
    if (roleId && roleId !== (user?.targetRoleId || "")) c.targetRoleId = roleId;
    return c;
  }, [name, roleId, user]);
  const dirty = Object.keys(changes).length > 0;
  const hasRoadmap = roadmapStatus === "ready";

  async function save() {
    setConfirmRole(false);
    setBusy(true);
    setFormError("");
    setFieldError("");
    try {
      const data = await profileApi.update(changes);
      setUser(data.user || data.profile || data);
      toast.success("Your settings were saved.");
      if (changes.targetRoleId) setRoleChanged(true);
    } catch (err) {
      if (err.code === "INVALID_NAME") setFieldError(friendlyError(err));
      else setFormError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!dirty || busy) return;
    if (changes.name !== undefined && !changes.name) return setFieldError("Please enter a name.");
    if (changes.targetRoleId && hasRoadmap) setConfirmRole(true); // explain what a role change does NOT do
    else save();
  }

  return (
    <>
      <PageHead kicker="SETTINGS" title="Your space," em="your way." text="Your profile, your target role and how Milestone looks." who="wren" />

      <div className="two-col">
        <Frame className="card" as="form" onSubmit={onSubmit} noValidate>
          <h2>Profile</h2>
          <Field label="Name" htmlFor="name" error={fieldError}>
            <input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldError} />
          </Field>
          <Field label="Email" htmlFor="email" hint="Your email can't be changed.">
            <input id="email" value={user?.email || ""} readOnly disabled />
          </Field>
          <Field label="Sign-in method" htmlFor="provider">
            <input id="provider" value={user?.authProvider === "google" ? "Google" : "Email and password"} readOnly disabled />
          </Field>

          <h3>Target role</h3>
          {status === "error" ? (
            <ErrorBanner message={friendlyError(error)} onRetry={reload} />
          ) : (
            <RoleCards roles={roles} idOf={idOf} value={roleId} onChange={setRoleId} disabled={status !== "ready"} />
          )}

          {formError && <Notice>{formError}</Notice>}
          {roleChanged && (
            <Notice tone="info" action={<Link to="/onboarding/role" className="btn btn-sm btn-gold">Create a new roadmap</Link>}>
              Role updated. Your existing roadmap was <strong>not</strong> rebuilt. Create a new one to plan for this role.
            </Notice>
          )}

          <div className="form-actions">
            <button className="btn btn-gold" disabled={!dirty || busy}>
              {busy ? "Saving…" : <>Save changes <Check size={16} aria-hidden="true" /></>}
            </button>
            {!dirty && <small className="muted">Nothing to save yet.</small>}
          </div>
        </Frame>

        <div className="stack">
          <Frame className="card">
            <h2>Appearance</h2>
            <p className="muted">Pick a look. Dark themes are easier on the eyes at night.</p>
            <div className="theme-options" role="radiogroup" aria-label="Theme">
              <button role="radio" aria-checked={setting === AUTO_THEME} className={`theme-choice ${setting === AUTO_THEME ? "theme-on" : ""}`} onClick={() => choose(AUTO_THEME)}>
                <span className="swatch swatch-auto" aria-hidden="true"><Monitor size={13} /></span>
                <span>Match my device<small>Light by day, dark at night</small></span>
                {setting === AUTO_THEME && <Check size={16} aria-hidden="true" />}
              </button>
              {themes.map((t) => (
                <button key={t.id} role="radio" aria-checked={setting === t.id} className={`theme-choice ${setting === t.id ? "theme-on" : ""}`} onClick={() => choose(t.id)}>
                  <span className="swatch" style={{ background: t.swatch }} aria-hidden="true" />
                  <span>{t.name}<small>{t.mode === "dark" ? <><Moon size={11} aria-hidden="true" /> Dark</> : <><Sun size={11} aria-hidden="true" /> Light</>}</small></span>
                  {setting === t.id && <Check size={16} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </Frame>

          <Frame className="card">
            <h2>Session</h2>
            <button className="btn btn-cream" onClick={logout}><LogOut size={16} aria-hidden="true" /> Log out</button>
          </Frame>
        </div>
      </div>

      <ConfirmDialog open={confirmRole} title="Change your target role?" confirmLabel="Change role" onCancel={() => setConfirmRole(false)} onConfirm={save} busy={busy}>
        <p>Changing the role updates your profile, but it <strong>does not rebuild your roadmap</strong>. You'll keep your current plan until you create a new roadmap.</p>
      </ConfirmDialog>
    </>
  );
}
