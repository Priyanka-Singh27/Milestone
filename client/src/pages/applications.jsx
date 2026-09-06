import { useEffect, useState } from 'react';
import ApplicationTable from '../components/tracker/ApplicationTable';
import ApplicationFormModal from '../components/tracker/ApplicationFormModal';
import {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  syncApplicationsToSheets,
} from '../api/applications';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getApplications(statusFilter || undefined);
      setApplications(data.applications);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleSave = async (form) => {
    try {
      if (editingApp) {
        await updateApplication(editingApp.id || editingApp._id, form);
      } else {
        await createApplication(form);
      }
      setModalOpen(false);
      setEditingApp(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this application?')) return;
    try {
      await deleteApplication(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      // TODO: pass a real Google access token once Person D's OAuth token
      // storage/incremental-consent flow is wired up (CONTRACTS.md 7.1).
      const data = await syncApplicationsToSheets(null);
      window.open(data.sheetUrl, '_blank');
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const customStatuses = [...new Set(applications.map((a) => a.status))];

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 text-sm rounded border hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync to Sheets'}
          </button>
          <button
            onClick={() => { setEditingApp(null); setModalOpen(true); }}
            className="px-4 py-2 text-sm rounded bg-gray-900 text-white"
          >
            + Add Application
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {customStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <ApplicationTable
          applications={applications}
          onEdit={(app) => { setEditingApp(app); setModalOpen(true); }}
          onDelete={handleDelete}
        />
      )}

      <ApplicationFormModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingApp(null); }}
        onSave={handleSave}
        initialData={editingApp}
        customStatuses={customStatuses}
      />
    </div>
  );
}
