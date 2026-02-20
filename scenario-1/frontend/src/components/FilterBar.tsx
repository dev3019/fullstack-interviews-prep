import { memo } from 'react';
import { TaskFilters } from '../types';

interface FilterBarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

function FilterBarInner({ filters, onChange }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as TaskFilters['status'] })}
      >
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </select>

      <select
        value={filters.priority}
        onChange={(e) => onChange({ ...filters, priority: e.target.value as TaskFilters['priority'] })}
      >
        <option value="">All Priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <input
        type="text"
        placeholder="Search tasks..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />
    </div>
  );
}

export const FilterBar = memo(FilterBarInner);
