import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Check, CircleAlert, Eye, EyeOff, FileText, Lock, RefreshCw,
  ShieldCheck, Upload, X,
} from "lucide-react";
import { Mascot } from "../art/Mascots";
import { Ornament } from "../art/Scenery";
import Modal from "./Modal";
import { TRACKS } from "../../config/constants";

export { default as Modal } from "./Modal";

/* ---------- layout ---------- */

/** Cream "paper" card with a double frame. */
export const Frame = ({ className = "", children, as: Tag = "section", ...rest }) => (
  <Tag className={`frame ${className}`} {...rest}>
    {children}
  </Tag>
);

/** Page heading with a guide character. */
export function PageHead({ kicker, title, em, text, who, children }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <Ornament />
        {kicker && <span className="kicker">{kicker}</span>}
        <h1>
          {title} {em && <em>{em}</em>}
        </h1>
        {text && <p>{text}</p>}
        {children}
      </div>
      {who && <Mascot who={who} size={118} className="page-head-mascot" />}
    </header>
  );
}

/* ---------- loading ---------- */

export const Spinner = ({ label = "Loading", size = 20 }) => (
  <span className="spinner" role="status" aria-label={label} style={{ width: size, height: size }} />
);

export const Skeleton = ({ h = 16, w = "100%", r = 10, className = "" }) => (
  <span className={`skeleton ${className}`} style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />
);

export function CardSkeleton({ lines = 3 }) {
  return (
    <Frame className="card" aria-busy="true" aria-label="Loading">
      <Skeleton h={14} w="40%" />
      <Skeleton h={28} w="60%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={12} w={`${90 - i * 12}%`} />
      ))}
    </Frame>
  );
}

export const Loading = ({ who = "pearl", title = "Just a moment…", text }) => (
  <Frame className="state-card" role="status" aria-live="polite">
    <Mascot who={who} size={96} />
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    <Spinner size={18} label={title} />
  </Frame>
);

/**
 * Full-screen state for the long calls (resume read, roadmap generate).
 * `messages` rotate so the student can see something is happening.
 */
export function ProgressOverlay({ open, title, messages = [], who = "captain" }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!open || messages.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 3200);
    return () => clearInterval(t);
  }, [open, messages.length]);
  useEffect(() => { if (open) setI(0); }, [open]);
  if (!open) return null;
  return (
    <div className="overlay" role="alertdialog" aria-modal="true" aria-live="assertive" aria-label={title}>
      <Frame className="overlay-card">
        <Mascot who={who} size={120} />
        <h2>{title}</h2>
        <p className="overlay-msg">{messages[i] || "Working on it…"}</p>
        <div className="bar bar-indeterminate" aria-hidden="true"><span /></div>
        <small className="muted">Please keep this tab open. This can take up to a minute.</small>
      </Frame>
    </div>
  );
}

/* ---------- feedback ---------- */

export const Notice = ({ children, tone = "error", action }) => (
  <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
    {tone === "warn" ? <AlertTriangle size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
    <span>{children}</span>
    {action}
  </div>
);

/** Failed load: shows the friendly message with a Retry button. */
export function ErrorBanner({ message, onRetry, retryLabel = "Try again" }) {
  return (
    <div className="notice notice-error banner" role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-sm btn-cream" onClick={onRetry}>
          <RefreshCw size={14} /> {retryLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ who = "wren", title, text, action, to, actionLabel, onAction }) {
  return (
    <Frame className="state-card">
      <Mascot who={who} size={96} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
      {to && (
        <Link to={to} className="btn btn-gold">
          {actionLabel} <ArrowRight size={16} />
        </Link>
      )}
      {onAction && (
        <button className="btn btn-gold" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </Frame>
  );
}

export function ConfirmDialog({
  open, title, children, confirmLabel = "Confirm", cancelLabel = "Cancel",
  onConfirm, onCancel, danger = false, busy = false,
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      dismissible={!busy}
      footer={
        <>
          <button className="btn btn-cream" onClick={onCancel} disabled={busy} data-autofocus>
            {cancelLabel}
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-gold"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/* ---------- progress ---------- */

export function ProgressBar({ value, max = 100, label, showText = false }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress">
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {showText && <small>{label || `${pct}%`}</small>}
    </div>
  );
}

export function ProgressRing({ value, max = 100, size = 96, stroke = 10, label, children }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }} role="img" aria-label={label || `${pct} percent complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} className="ring-value" strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children ?? <strong>{pct}%</strong>}</div>
    </div>
  );
}

/* ---------- badges & tags: one colour map per concept ---------- */

export const TrackBadge = ({ track }) => {
  const t = TRACKS[track];
  return <span className={`pill ${t?.cls || "pill-plain"}`}>{t?.label || track || "Learning"}</span>;
};

export const PriorityTag = ({ priority }) => (
  <span className={`pill ${priority === "core" ? "pill-core" : "pill-plain"}`}>
    {priority === "core" ? "Core" : "Supplementary"}
  </span>
);

const STATUS_PILLS = {
  not_started: { cls: "pill-plain", text: "Not started" },
  in_progress: { cls: "pill-warn", text: "In progress" },
  completed: { cls: "pill-ok", text: "Done" },
  verified: { cls: "pill-gold", text: "Verified" },
};
export function StatusPill({ status }) {
  const s = STATUS_PILLS[status] || STATUS_PILLS.not_started;
  return (
    <span className={`pill ${s.cls}`}>
      {status === "verified" && <ShieldCheck size={12} aria-hidden="true" />}
      {s.text}
    </span>
  );
}

export const VerifiedBadge = ({ compact = false }) => (
  <span className="pill pill-gold" title="Verified by passing the topic quiz">
    <ShieldCheck size={12} aria-hidden="true" /> {compact ? "Verified" : "Verified by quiz"}
  </span>
);

/* ---------- forms ---------- */

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && (
        <small className="error-text" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function PasswordInput({ id, value, onChange, autoComplete, placeholder, invalid, describedBy }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

/** Validates type + size in the browser BEFORE anything is sent. Returns an error string or null. */
export function validateFile(file, { maxBytes, extensions, label }) {
  if (!file) return "Please choose a file.";
  const name = file.name.toLowerCase();
  if (!extensions.some((ext) => name.endsWith(ext))) {
    return `That file type isn't supported. Allowed: ${label}.`;
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > maxBytes) {
    return `That file is ${(file.size / 1048576).toFixed(1)} MB. The maximum is ${Math.round(maxBytes / 1048576)} MB.`;
  }
  return null;
}

export function FileDropzone({ file, onFile, rules, label, accept, disabled, error, hint }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState(null);
  const id = useId();

  const take = useCallback(
    (f) => {
      const problem = validateFile(f, { ...rules, label });
      setLocalError(problem);
      onFile(problem ? null : f);
    },
    [rules, label, onFile]
  );

  const shown = localError || error;

  return (
    <div className="dropzone-wrap">
      <div
        className={`dropzone ${drag ? "dropzone-drag" : ""} ${shown ? "dropzone-bad" : ""} ${disabled ? "is-disabled" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled && e.dataTransfer.files?.[0]) take(e.dataTransfer.files[0]);
        }}
      >
        {file ? (
          <div className="dropzone-file">
            <FileText size={22} aria-hidden="true" />
            <div>
              <strong>{file.name}</strong>
              <small>{(file.size / 1024).toFixed(0)} KB</small>
            </div>
            <button type="button" className="icon-btn" disabled={disabled} aria-label="Remove file"
              onClick={() => { onFile(null); setLocalError(null); if (input.current) input.current.value = ""; }}>
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={26} aria-hidden="true" />
            <p>
              Drag a file here, or{" "}
              <button type="button" className="link-btn" onClick={() => input.current?.click()} disabled={disabled}>
                browse
              </button>
            </p>
            <small className="muted">{hint || label}</small>
          </>
        )}
        <input
          id={id}
          ref={input}
          type="file"
          accept={accept}
          hidden
          disabled={disabled}
          onChange={(e) => e.target.files?.[0] && take(e.target.files[0])}
        />
      </div>
      {shown && (
        <small className="error-text" role="alert">
          {shown}
        </small>
      )}
    </div>
  );
}

/* ---------- stepper ---------- */

export function Stepper({ steps, current, onGo, locked = false }) {
  return (
    <ol className="stepper" aria-label="Setup progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const canGo = !locked && done && onGo;
        const inner = (
          <>
            <span className="step-dot">{done ? <Check size={14} aria-hidden="true" /> : i + 1}</span>
            <span className="step-label">{s}</span>
          </>
        );
        return (
          <li key={s} className={`step ${done ? "step-done" : ""} ${active ? "step-active" : ""}`} aria-current={active ? "step" : undefined}>
            {canGo ? (
              <button type="button" className="step-btn" onClick={() => onGo(i)}>{inner}</button>
            ) : (
              <span className="step-btn">{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export const LockedNote = ({ children }) => (
  <span className="locked-note">
    <Lock size={12} aria-hidden="true" /> {children}
  </span>
);
