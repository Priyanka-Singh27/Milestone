import React, { useEffect, useState } from "react";
import { DEFAULT_APPLICATION_STATUSES } from "../../config/constants";
import { Field, Modal, Notice } from "../ui";

const CUSTOM = "__custom__";
const today = () => new Date().toISOString().slice(0, 10);
const NOTES_MAX = 2000;

/** One modal for both add (empty) and edit (pre-filled). `onSubmit(values)` returns an error string or null. */
export default function ApplicationForm({ open, application, customStatuses, onClose, onSubmit }) {
  const editing = Boolean(application);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [statusChoice, setStatusChoice] = useState("Applied");
  const [customStatus, setCustomStatus] = useState("");
  const [appliedDate, setAppliedDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const options = [...DEFAULT_APPLICATION_STATUSES, ...customStatuses.filter((s) => !DEFAULT_APPLICATION_STATUSES.includes(s))];

  // (re)initialise whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setCompany(application?.company || "");
    setRole(application?.role || "");
    const st = application?.status || "Applied";
    setStatusChoice(options.includes(st) ? st : CUSTOM);
    setCustomStatus(options.includes(st) ? "" : st);
    setAppliedDate((application?.appliedDate || "").slice(0, 10) || today());
    setNotes(application?.notes || "");
    setErrors({});
    setFormError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, application]);

  async function submit(e) {
    e.preventDefault();
    const status = statusChoice === CUSTOM ? customStatus.trim() : statusChoice;
    const next = {};
    if (!company.trim()) next.company = "Enter the company.";
    if (!role.trim()) next.role = "Enter the role.";
    if (statusChoice === CUSTOM && !status) next.status = "Type your own status, or pick one from the list.";
    if (status.length > 40) next.status = "A status can be up to 40 characters.";
    if (notes.length > NOTES_MAX) next.notes = `Notes can be up to ${NOTES_MAX} characters.`;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFormError("");
    const message = await onSubmit({ company: company.trim(), role: role.trim(), status, appliedDate, notes: notes.trim() });
    setBusy(false);
    if (message) setFormError(message);
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={editing ? "Edit application" : "Add an application"}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="btn btn-cream" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="application-form" className="btn btn-gold" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add application"}
          </button>
        </>
      }
    >
      <form id="application-form" className="form" onSubmit={submit} noValidate>
        <Field label="Company" htmlFor="app-company" error={errors.company}>
          <input id="app-company" data-autofocus value={company} maxLength={120} onChange={(e) => setCompany(e.target.value)} aria-invalid={!!errors.company} />
        </Field>
        <Field label="Role" htmlFor="app-role" error={errors.role}>
          <input id="app-role" value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} aria-invalid={!!errors.role} />
        </Field>
        <Field label="Status" htmlFor="app-status" error={errors.status}>
          <select id="app-status" value={statusChoice} onChange={(e) => setStatusChoice(e.target.value)}>
            {options.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={CUSTOM}>Add your own…</option>
          </select>
          {statusChoice === CUSTOM && (
            <input aria-label="Your own status" placeholder="e.g. Waiting for referral" value={customStatus} maxLength={40}
              onChange={(e) => setCustomStatus(e.target.value)} />
          )}
        </Field>
        <Field label="Applied date" htmlFor="app-date">
          <input id="app-date" type="date" value={appliedDate} onChange={(e) => setAppliedDate(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="app-notes" error={errors.notes} hint={`${notes.length}/${NOTES_MAX}`}>
          <textarea id="app-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} aria-invalid={!!errors.notes} />
        </Field>
        {formError && <Notice>{formError}</Notice>}
      </form>
    </Modal>
  );
}
