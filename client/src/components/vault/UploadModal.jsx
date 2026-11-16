import React, { useEffect, useState } from "react";
import { CERTIFICATE_RULES } from "../../config/constants";
import { FileDropzone, Field, Modal, Notice } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);

/** Certificate upload: files are checked in the browser (type + size) before anything is sent. */
export default function UploadModal({ open, onClose, onSubmit }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [dateIssued, setDateIssued] = useState(today());
  const [tags, setTags] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null); setTitle(""); setIssuer(""); setDateIssued(today()); setTags("");
      setErrors({}); setFormError("");
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!file) next.file = "Choose a certificate file first.";
    if (!title.trim()) next.title = "Enter a title.";
    if (!issuer.trim()) next.issuer = "Enter who issued it.";
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 10 || tagList.some((t) => t.length > 30)) next.tags = "Use up to 10 tags of 30 characters each.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    form.append("issuer", issuer.trim());
    form.append("dateIssued", dateIssued);
    form.append("tags", tagList.join(","));

    setBusy(true);
    setFormError("");
    const message = await onSubmit(form);
    setBusy(false);
    if (message) setFormError(message);
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title="Upload a certificate"
      footer={
        <>
          <button type="button" className="btn btn-cream" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="upload-form" className="btn btn-gold" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
        </>
      }
    >
      <form id="upload-form" className="form" onSubmit={submit} noValidate>
        <FileDropzone file={file} onFile={setFile} rules={CERTIFICATE_RULES} label="PDF, JPG or PNG, up to 10 MB"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy} error={errors.file} />
        <Field label="Title" htmlFor="cert-title" error={errors.title}>
          <input id="cert-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
        </Field>
        <Field label="Issuer" htmlFor="cert-issuer" error={errors.issuer}>
          <input id="cert-issuer" value={issuer} maxLength={120} onChange={(e) => setIssuer(e.target.value)} aria-invalid={!!errors.issuer} />
        </Field>
        <Field label="Date issued" htmlFor="cert-date">
          <input id="cert-date" type="date" value={dateIssued} onChange={(e) => setDateIssued(e.target.value)} />
        </Field>
        <Field label="Tags" htmlFor="cert-tags" error={errors.tags} hint="Comma separated, e.g. python, cloud">
          <input id="cert-tags" value={tags} onChange={(e) => setTags(e.target.value)} aria-invalid={!!errors.tags} />
        </Field>
        {busy && <div className="bar bar-indeterminate" aria-hidden="true"><span /></div>}
        {formError && <Notice>{formError}</Notice>}
      </form>
    </Modal>
  );
}
