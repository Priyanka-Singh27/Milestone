import { useState } from 'react';

export default function CustomStatusInput({ onAdd }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add custom status..."
        className="border rounded px-2 py-1 text-sm flex-1"
      />
      <button type="submit" className="px-3 py-1 text-sm rounded bg-gray-900 text-white">
        Add
      </button>
    </form>
  );
}
