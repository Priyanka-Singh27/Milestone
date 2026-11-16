import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Trash2, Trophy, Upload } from "lucide-react";
import { certificatesApi } from "../api";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { friendlyError } from "../config/errors";
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorBanner, Frame, PageHead } from "../components/ui";
import UploadModal from "../components/vault/UploadModal";

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

// Only open real http(s) file links.
const safeFileUrl = (url) => {
  try { const u = new URL(url); return ["https:", "http:"].includes(u.protocol) ? u.href : null; } catch { return null; }
};

export default function Vault() {
  const toast = useToast();
  const { data, error, loading, retry, setData } = useApi(() => certificatesApi.list(), []);
  const items = data?.certificates || [];

  const [type, setType] = useState("all");
  const [tag, setTag] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Tag filter comes from the student's own uploaded certificates (badge tags are internal topic ids).
  const tags = useMemo(() => [...new Set(items.filter((c) => c.type === "uploaded").flatMap((c) => c.tags || []))].sort(), [items]);
  useEffect(() => { if (tag !== "all" && !tags.includes(tag)) setTag("all"); }, [tags, tag]);

  const shown = items.filter((c) => (type === "all" || c.type === type) && (tag === "all" || (c.tags || []).includes(tag)));
  const badges = items.filter((c) => c.type === "badge").length;

  async function upload(form) {
    try {
      const res = await certificatesApi.upload(form);
      setData((d) => ({ ...d, certificates: [res.certificate, ...(d?.certificates || [])] }));
      setUploadOpen(false);
      toast.success("Certificate uploaded.");
      retry(); // refresh the list from the server
      return null;
    } catch (err) {
      return friendlyError(err);
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      await certificatesApi.remove(deleting._id);
      setData((d) => ({ ...d, certificates: d.certificates.filter((c) => c._id !== deleting._id) }));
      toast.success("Certificate deleted.");
    } catch (err) {
      if (err.code === "NOT_FOUND") setData((d) => ({ ...d, certificates: d.certificates.filter((c) => c._id !== deleting._id) }));
      else toast.error(friendlyError(err));
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHead kicker="CERTIFICATES & BADGES" title="Everything you've" em="earned."
        text={`${badges} quiz badge${badges === 1 ? "" : "s"} and ${items.length - badges} uploaded certificate${items.length - badges === 1 ? "" : "s"}.`} who="miso" />

      <div className="toolbar">
        <button className="btn btn-gold" onClick={() => setUploadOpen(true)}><Upload size={16} aria-hidden="true" /> Upload a certificate</button>
        <div className="seg" role="group" aria-label="Filter by type">
          {[["all", "All"], ["badge", "Badges"], ["uploaded", "Uploaded"]].map(([id, label]) => (
            <button key={id} className={type === id ? "on" : ""} onClick={() => setType(id)} aria-pressed={type === id}>{label}</button>
          ))}
        </div>
        {tags.length > 0 && (
          <label className="inline-field">
            <span>Tag</span>
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="all">All tags</option>
              {tags.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && !data && <ErrorBanner message={friendlyError(error)} onRetry={retry} />}
      {loading && !data && <div className="vault-grid"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>}

      {data && items.length === 0 && (
        <EmptyState who="miso" title="Your vault is empty" text="Pass a topic quiz to earn a platform-verified badge, or upload a certificate you already have."
          onAction={() => setUploadOpen(true)} actionLabel="Upload a certificate" />
      )}
      {data && items.length > 0 && shown.length === 0 && <p className="muted center">Nothing matches those filters.</p>}

      <div className="vault-grid">
        {shown.map((c) => {
          const url = c.type === "uploaded" ? safeFileUrl(c.fileUrl) : null;
          return c.type === "badge" ? (
            <Frame className="cert cert-badge" as="article" key={c._id}>
              <span className="cert-icon" aria-hidden="true"><Trophy size={26} /></span>
              <strong>{c.title}</strong>
              {c.quizScore != null && <span className="cert-score">{c.quizScore}%</span>}
              <small className="muted">{fmt(c.dateIssued)}</small>
              <span className="pill pill-gold"><ShieldCheck size={12} aria-hidden="true" /> Platform-verified</span>
            </Frame>
          ) : (
            <Frame className="cert" as="article" key={c._id}>
              <strong>{c.title}</strong>
              <small className="muted">{c.issuer} · {fmt(c.dateIssued)}</small>
              <div className="tag-row">{(c.tags || []).map((t) => <span className="pill pill-plain" key={t}>{t}</span>)}</div>
              <div className="app-actions">
                {url ? (
                  <a className="btn btn-cream btn-sm" href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} aria-hidden="true" /> View
                  </a>
                ) : <span />}
                <button className="icon-btn icon-danger" onClick={() => setDeleting(c)} aria-label={`Delete ${c.title}`}><Trash2 size={15} /></button>
              </div>
            </Frame>
          );
        })}
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSubmit={upload} />
      <ConfirmDialog open={!!deleting} title="Delete this certificate?" confirmLabel="Delete" danger busy={deleteBusy}
        onCancel={() => setDeleting(null)} onConfirm={confirmDelete}>
        <p><strong>{deleting?.title}</strong> and its file will be removed. This can't be undone.</p>
      </ConfirmDialog>
    </>
  );
}
