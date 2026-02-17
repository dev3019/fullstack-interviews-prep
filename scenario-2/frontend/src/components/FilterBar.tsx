import { ExpenseFilters } from '../types';

interface FilterBarProps {
  filters: ExpenseFilters;
  onChange: (filters: ExpenseFilters) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <select
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value })}
      >
        <option value="">All Categories</option>
        <option value="travel">Travel</option>
        <option value="meals">Meals</option>
        <option value="office">Office</option>
        <option value="software">Software</option>
        <option value="other">Other</option>
      </select>

      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
      >
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>

      <div className="date-range">
        <label>
          From
          <input
            type="date"
            value={filters.date_start}
            onChange={(e) =>
              onChange({ ...filters, date_start: e.target.value })
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.date_end}
            onChange={(e) => onChange({ ...filters, date_end: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
