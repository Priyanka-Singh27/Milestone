import StatusBadge from './StatusBadge';

export default function ApplicationTable({ applications, onEdit, onDelete }) {
  if (!applications.length) {
    return <p className="text-sm text-gray-500 py-8 text-center">No applications yet — add your first one.</p>;
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left border-b text-gray-500">
          <th className="py-2 pr-4">Company</th>
          <th className="py-2 pr-4">Role</th>
          <th className="py-2 pr-4">Status</th>
          <th className="py-2 pr-4">Applied</th>
          <th className="py-2 pr-4">Notes</th>
          <th className="py-2 pr-4"></th>
        </tr>
      </thead>
      <tbody>
        {applications.map((app) => (
          <tr key={app.id || app._id} className="border-b hover:bg-gray-50">
            <td className="py-2 pr-4 font-medium">{app.company}</td>
            <td className="py-2 pr-4">{app.role}</td>
            <td className="py-2 pr-4"><StatusBadge status={app.status} /></td>
            <td className="py-2 pr-4 text-gray-500">
              {app.appliedDate ? new Date(app.appliedDate).toLocaleDateString() : '—'}
            </td>
            <td className="py-2 pr-4 text-gray-500 max-w-xs truncate">{app.notes}</td>
            <td className="py-2 pr-4 text-right whitespace-nowrap">
              <button onClick={() => onEdit(app)} className="text-blue-600 hover:underline mr-3">
                Edit
              </button>
              <button onClick={() => onDelete(app.id || app._id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
