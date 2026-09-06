const STATUS_COLORS = {
  Applied: 'bg-blue-100 text-blue-700',
  OA: 'bg-purple-100 text-purple-700',
  Interview: 'bg-amber-100 text-amber-700',
  Offer: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
};

export default function StatusBadge({ status }) {
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}
