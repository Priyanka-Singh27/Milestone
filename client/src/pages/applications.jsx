import React, { useEffect, useMemo, useState } from "react";
import { Bell, LayoutGrid, Pencil, Plus, Rows3, Trash2 } from "lucide-react";
import { applicationsApi } from "../api";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { friendlyError } from "../config/errors";
import { APPLICATION_REMINDER_DAYS, DEFAULT_APPLICATION_STATUSES } from "../config/constants";
import { CardSkeleton, ConfirmDialog, EmptyState, ErrorBanner, Frame, PageHead } from "../components/ui";
import StatusBadge from "../components/tracker/StatusBadge";
import ApplicationForm from "../components/tracker/ApplicationForm";
import SheetsPanel from "../components/tracker/SheetsPanel";

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);
const truncate = (s, n = 70) => (s && s.length > n ? `${s.slice(0, n)}…` : s || "—");
const VIEW_KEY = "milestone_tracker_view";

/** Offers/rejections are finished, so only open applications get a "no update" reminder. */
const needsReminder = (a) =>
  !["Offer", "Rejected"].includes(a.status) && daysSince(a.lastUpdated || a.appliedDate) > APPLICATION_REMINDER_DAYS;

export default function Applications() {
  const toast = useToast();
  const { data, error, loading, retry, setData } = useApi(() => applicationsApi.list(), []);
  const items = data?.applications || [];

  const [filter, setFilter] = useState("all");
  const [view, setView] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || "table"; } catch { return "table"; } });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ } }, [view]);

  // Every status the student currently uses, defaults first, then their own.
  const statuses = useMemo(() => {
    const present = new Set(items.map((a) => a.status));
    const ordered = DEFAULT_APPLICATION_STATUSES.filter((s) => present.has(s));
    return [...ordered, ...[...present].filter((s) => !DEFAULT_APPLICATION_STATUSES.includes(s))];
  }, [items]);
  const customStatuses = statuses.filter((s) => !DEFAULT_APPLICATION_STATUSES.includes(s));

  // If the filtered status disappears (last one changed/deleted), fall back to "all".
  useEffect(() => { if (filter !== "all" && !statuses.includes(filter)) setFilter("all"); }, [statuses, filter]);

  const shown = filter === "all" ? items : items.filter((a) => a.status === filter);

  const patchList = (fn) => setData((d) => ({ ...d, applications: fn(d?.applications || []) }));

  async function save(values) {
    try {
      if (editing) {
        // PATCH only what changed
        const diff = {};
        ["company", "role", "status", "notes"].forEach((k) => { if (values[k] !== (editing[k] || "")) diff[k] = values[k]; });
        if (values.appliedDate !== (editing.appliedDate || "").slice(0, 10)) diff.appliedDate = values.appliedDate;
        if (Object.keys(diff).length === 0) { setFormOpen(false); return null; }
        const res = await applicationsApi.update(editing._id, diff);
        patchList((l) => l.map((a) => (a._id === editing._id ? res.application : a)));
        toast.success("Application updated.");
      } else {
        const res = await applicationsApi.create(values);
        patchList((l) => [res.application, ...l]);
        toast.success("Application added.");
      }
      setFormOpen(false);
      return null;
    } catch (err) {
      if (err.code === "NOT_FOUND" || err.code === "INVALID_ID") { setFormOpen(false); retry(); }
      return friendlyError(err);
    }
  }

  // The most common edit: change only the status, right from the row.
  async function quickStatus(app, status) {
    if (status === app.status) return;
    const prev = data;
    patchList((l) => l.map((a) => (a._id === app._id ? { ...a, status, lastUpdated: new Date().toISOString() } : a)));
    try {
      const res = await applicationsApi.update(app._id, { status });
      patchList((l) => l.map((a) => (a._id === app._id ? res.application : a)));
    } catch (err) {
      setData(prev);
      toast.error(friendlyError(err));
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      await applicationsApi.remove(deleting._id);
      patchList((l) => l.filter((a) => a._id !== deleting._id));
      toast.success("Application deleted.");
    } catch (err) {
      if (err.code === "NOT_FOUND") patchList((l) => l.filter((a) => a._id !== deleting._id));
      else toast.error(friendlyError(err));
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (a) => { setEditing(a); setFormOpen(true); };

  const StatusSelect = ({ a }) => (
    <select className="status-select" value={a.status} onChange={(e) => quickStatus(a, e.target.value)} aria-label={`Change status for ${a.company}`}>
      {[...new Set([...DEFAULT_APPLICATION_STATUSES, ...customStatuses])].map((s) => <option key={s}>{s}</option>)}
    </select>
  );
  const Actions = ({ a }) => (
    <div className="row-actions">
      <button className="icon-btn" onClick={() => openEdit(a)} aria-label={`Edit ${a.company}`}><Pencil size={15} /></button>
      <button className="icon-btn icon-danger" onClick={() => setDeleting(a)} aria-label={`Delete ${a.company}`}><Trash2 size={15} /></button>
    </div>
  );
  const Reminder = ({ a }) => needsReminder(a)
    ? <span className="pill pill-warn" title="No update for a while"><Bell size={11} aria-hidden="true" /> {daysSince(a.lastUpdated || a.appliedDate)} days quiet</span>
    : null;

  return (
    <>
      <PageHead kicker="OPPORTUNITIES" title="Every application," em="in one place."
        text="Track internships and jobs, and move them along as things progress." who="zed" />

      <div className="tracker-top">
        <div className="toolbar">
          <button className="btn btn-gold" onClick={openAdd}><Plus size={16} aria-hidden="true" /> Add application</button>
          <label className="inline-field">
            <span>Show</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} disabled={statuses.length === 0}>
              <option value="all">All statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="seg" role="group" aria-label="View">
            <button className={view === "table" ? "on" : ""} onClick={() => setView("table")} aria-pressed={view === "table"}><Rows3 size={15} aria-hidden="true" /> Table</button>
            <button className={view === "board" ? "on" : ""} onClick={() => setView("board")} aria-pressed={view === "board"}><LayoutGrid size={15} aria-hidden="true" /> Board</button>
          </div>
        </div>
        <SheetsPanel disabled={items.length === 0} />
      </div>

      {error && !data && <ErrorBanner message={friendlyError(error)} onRetry={retry} />}
      {loading && !data && <CardSkeleton lines={5} />}

      {data && items.length === 0 && (
        <EmptyState who="zed" title="No applications yet" text="Add the first one and it will appear here. Track every internship and job in one place." onAction={openAdd} actionLabel="Add your first application" />
      )}

      {items.length > 0 && view === "table" && (
        <Frame className="table-card">
          <table className="app-table">
            <thead>
              <tr>
                <th scope="col">Company</th><th scope="col">Role</th><th scope="col">Status</th>
                <th scope="col">Applied</th><th scope="col">Last updated</th><th scope="col">Notes</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a._id} className={needsReminder(a) ? "row-quiet" : ""}>
                  <td data-label="Company"><strong>{a.company}</strong></td>
                  <td data-label="Role">{a.role}</td>
                  <td data-label="Status"><div className="status-cell"><StatusBadge status={a.status} /><StatusSelect a={a} /><Reminder a={a} /></div></td>
                  <td data-label="Applied">{fmt(a.appliedDate)}</td>
                  <td data-label="Last updated">{fmt(a.lastUpdated)}</td>
                  <td data-label="Notes" className="notes-cell" title={a.notes}>{truncate(a.notes)}</td>
                  <td data-label="Actions"><Actions a={a} /></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="muted center">No applications with that status.</td></tr>}
            </tbody>
          </table>
        </Frame>
      )}

      {items.length > 0 && view === "board" && (
        <div className="board">
          {(filter === "all" ? statuses : [filter]).map((status) => (
            <section className="column" key={status} aria-label={`${status} applications`}>
              <h3><StatusBadge status={status} /> <span className="count">{items.filter((a) => a.status === status).length}</span></h3>
              {items.filter((a) => a.status === status).map((a) => (
                <Frame className="app-card" as="article" key={a._id}>
                  <strong>{a.company}</strong>
                  <span>{a.role}</span>
                  <small className="muted">Applied {fmt(a.appliedDate)}</small>
                  <Reminder a={a} />
                  {a.notes && <p className="muted">{truncate(a.notes, 90)}</p>}
                  <div className="app-actions"><StatusSelect a={a} /><Actions a={a} /></div>
                </Frame>
              ))}
            </section>
          ))}
        </div>
      )}

      <ApplicationForm open={formOpen} application={editing} customStatuses={customStatuses} onClose={() => setFormOpen(false)} onSubmit={save} />

      <ConfirmDialog open={!!deleting} title="Delete this application?" confirmLabel="Delete" danger busy={deleteBusy}
        onCancel={() => setDeleting(null)} onConfirm={confirmDelete}>
        <p>This removes <strong>{deleting?.company}</strong> ({deleting?.role}) from your tracker. This can't be undone.</p>
      </ConfirmDialog>
    </>
  );
}
