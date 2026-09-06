import { useState } from 'react';

const DEFAULT_STATUSES = ['Applied', 'OA', 'Interview', 'Offer', 'Rejected'];

export default function ApplicationFormModal({ isOpen, onClose, onSave, initialData, customStatuses = [] }) {
  const [form, setForm] = useState(
    initialData || { company: '', role: '', status: 'Applied', appliedDate: '', notes: '' }
  );

  if (!isOpen) return null;

  const statuses = [...DEFAULT_STATUSES, ...customStatuses.filter((s) => !DEFAULT_STATUSES.includes(s))];

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
        <h2 className="text-lg font-semibold mb-4">
          {initialData ? 'Edit Application' : 'Add Application'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Company</label>
            <input
              value={form.company}
              onChange={handleChange('company')}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <input
              value={form.role}
              onChange={handleChange('role')}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={form.status}
              onChange={handleChange('status')}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Applied Date</label>
            <input
              type="date"
              value={form.appliedDate}
              onChange={handleChange('appliedDate')}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={handleChange('notes')}
              rows={3}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm rounded bg-gray-900 text-white">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
