import React, { useEffect, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { getRoles, updateProfile } from "../api";
import { useAuth } from "../context/Auth";
import { Frame, Notice, PageHead } from "../components/ui";

export const THEMES = [
  { id: "ocean", name: "Mystic Sea", color: "#2f8f8a" },
  { id: "sky", name: "Arctic Bloom", color: "#4a8fc7" },
  { id: "grove", name: "Enchanted Garden", color: "#5b9a63" },
];

export const applyTheme = (id) => {
  document.documentElement.dataset.theme = id;
  localStorage.setItem("milestone_theme", id);
};

export default function Profile() {
  const { profile, setProfile, logout } = useAuth();
  const [name, setName] = useState(profile?.name || "");
  const [roleId, setRoleId] = useState(profile?.targetRoleId || "");
  const [roles, setRoles] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem("milestone_theme") || "ocean");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    setName(profile?.name || "");
    setRoleId(profile?.targetRoleId || "");
  }, [profile]);

  useEffect(() => {
    getRoles().then((r) => setRoles(r?.roles || r || [])).catch(() => {});
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const r = await updateProfile({ name, targetRoleId: roleId || null });
      setProfile(r?.user || r?.profile || r);
      setMsg({ type: "success", text: "Profile saved." });
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead kicker="YOUR SPACE" title="A little about" em="you." text="Your goals, your direction, your look." who="wren" />

      <div className="two-col">
        <Frame className="card" as="form" onSubmit={save}>
          <h2>Profile</h2>
          <div className="form">
            <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>Email<input value={profile?.email || ""} disabled /></label>
            <label>Target role
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">Choose your career goal</option>
                {roles.map((r) => <option key={r.id || r._id} value={r.id || r._id}>{r.name}</option>)}
              </select>
            </label>
            {msg.text && <Notice tone={msg.type === "success" ? "success" : "error"}>{msg.text}</Notice>}
            <button className="btn btn-gold" disabled={busy}>{busy ? "Saving…" : "Save changes"} <Check size={16} /></button>
          </div>
        </Frame>

        <Frame className="card">
          <h2>Appearance</h2>
          <div className="theme-options">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-choice ${theme === t.id ? "theme-on" : ""}`}
                onClick={() => { setTheme(t.id); applyTheme(t.id); }}>
                <span className="swatch" style={{ background: t.color }} /> {t.name}
                {theme === t.id && <Check size={16} />}
              </button>
            ))}
          </div>
          <h2 className="mt">Session</h2>
          <button className="btn btn-cream" onClick={logout}><LogOut size={16} /> Sign out</button>
        </Frame>
      </div>
    </>
  );
}