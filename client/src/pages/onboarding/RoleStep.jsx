import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";
import { useRoles } from "../../context/RolesContext";
import { useAuth } from "../../context/AuthContext";
import { friendlyError } from "../../config/errors";
import { TRACKS } from "../../config/constants";
import { CardSkeleton, ConfirmDialog, ErrorBanner, Frame } from "../../components/ui";

/** Shared with Settings: the role picker cards. */
export function RoleCards({ roles, idOf, value, onChange, disabled }) {
  return (
    <div className="role-grid" role="radiogroup" aria-label="Target role">
      {roles.map((role) => {
        const id = idOf(role);
        const topics = role.topics || [];
        const split = topics.reduce((m, t) => ({ ...m, [t.track]: (m[t.track] || 0) + 1 }), {});
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={`role-card ${selected ? "role-card-on" : ""}`}
            onClick={() => onChange(id)}
          >
            <span className="role-check" aria-hidden="true">{selected && <Check size={16} />}</span>
            <strong>{role.name}</strong>
            {role.description && <span className="muted">{role.description}</span>}
            <span className="role-count">{topics.length} topics</span>
            <span className="role-split">
              {Object.entries(split).map(([track, n]) => (
                <span key={track} className={`pill ${TRACKS[track]?.cls || "pill-plain"}`}>
                  {TRACKS[track]?.label || track} · {n}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function RoleStep() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles, status, error, reload, idOf } = useRoles();
  const { roleId, setRoleId, skills, gapTopicIds } = useOnboarding();
  const [pending, setPending] = useState(null);

  // Pre-select the role saved on the profile (the student can change it).
  useEffect(() => {
    if (!roleId && status === "ready" && user?.targetRoleId && roles.some((r) => idOf(r) === user.targetRoleId)) {
      setRoleId(user.targetRoleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);

  const hasProgress = Object.keys(skills).length > 0 || gapTopicIds !== null;

  function choose(id) {
    if (id === roleId) return;
    if (roleId && hasProgress) setPending(id); // changing role throws away the skills + gap
    else setRoleId(id);
  }

  return (
    <Frame className="card step-card">
      <h2>Which role are you aiming for?</h2>
      <p className="muted">We'll build your topics and daily plan around it. You can change this later in Settings.</p>

      {status === "loading" || status === "idle" ? (
        <div className="role-grid">{[1, 2, 3].map((i) => <CardSkeleton key={i} lines={4} />)}</div>
      ) : status === "error" ? (
        <ErrorBanner message={friendlyError(error)} onRetry={reload} />
      ) : roles.length === 0 ? (
        <p className="muted">No roles are available yet. Please try again later.</p>
      ) : (
        <RoleCards roles={roles} idOf={idOf} value={roleId} onChange={choose} />
      )}

      <div className="step-actions">
        <span />
        <button className="btn btn-gold" disabled={!roleId} onClick={() => navigate("/onboarding/skills")}>
          Next: your skills <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <ConfirmDialog
        open={!!pending}
        title="Change your role?"
        confirmLabel="Change role"
        onCancel={() => setPending(null)}
        onConfirm={() => { setRoleId(pending); setPending(null); }}
      >
        <p>Changing the role clears the skills you ticked and the gap we calculated, because they belong to the current role.</p>
      </ConfirmDialog>
    </Frame>
  );
}
