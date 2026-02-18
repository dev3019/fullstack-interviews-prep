import { useEffect, useState } from 'react';
import { TaskFilters } from '../types';

interface FilterBarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search);

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (localSearch === filters.search) return;

    const timer = window.setTimeout(() => {
      onChange({ ...filters, search: localSearch });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [localSearch, filters, onChange]);

  return (
    <div className="filter-bar">
      <select
        value={filters.status}
        onChange={(e) =>
          onChange({
            ...filters,
            status: e.target.value,
            search: localSearch,
          })
        }
      >
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </select>

      <select
        value={filters.priority}
        onChange={(e) =>
          onChange({
            ...filters,
            priority: e.target.value,
            search: localSearch,
          })
        }
      >
        <option value="">All Priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <input
        type="text"
        placeholder="Search tasks..."
        value={localSearch}
        onChange={(e) => setLocalSearch(e.target.value)}
      />
    </div>
  );
}
