import { useState, useMemo } from 'react';
import { Expense } from '../types';
import { updateExpense, deleteExpense } from '../api';

interface ExpenseTableProps {
  expenses: Expense[];
  onUpdate: () => void;
}

type SortField = 'expense_date' | 'title' | 'amount' | 'category' | 'status';

export function ExpenseTable({ expenses, onUpdate }: ExpenseTableProps) {
  const [sortBy, setSortBy] = useState<SortField>('expense_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const aVal = String(a[sortBy] ?? '');
      const bVal = String(b[sortBy] ?? '');
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [expenses, sortBy, sortDir]);

  const handleApprove = async (id: number) => {
    try {
      await updateExpense(id, { status: 'approved' });
      onUpdate();
    } catch (error) {
      console.error('Failed to approve expense:', error);
    }
  };

  const handleReject = async (id: number) => {
    try {
      await updateExpense(id, { status: 'rejected' });
      onUpdate();
    } catch (error) {
      console.error('Failed to reject expense:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await deleteExpense(id);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete expense:', error);
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'approved':
        return 'status-approved';
      case 'rejected':
        return 'status-rejected';
      default:
        return 'status-pending';
    }
  };

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const formatDate = (dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const sortIndicator = (field: SortField) => {
    if (sortBy !== field) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  if (expenses.length === 0) {
    return <div className="empty-state">No expenses found</div>;
  }

  return (
    <div className="table-wrapper">
      <table className="expense-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('expense_date')}>
              Date{sortIndicator('expense_date')}
            </th>
            <th onClick={() => handleSort('title')}>
              Title{sortIndicator('title')}
            </th>
            <th onClick={() => handleSort('category')}>
              Category{sortIndicator('category')}
            </th>
            <th onClick={() => handleSort('amount')}>
              Amount{sortIndicator('amount')}
            </th>
            <th onClick={() => handleSort('status')}>
              Status{sortIndicator('status')}
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((expense) => (
            <tr key={expense.id}>
              <td>{formatDate(expense.expense_date)}</td>
              <td>
                <div className="cell-title">{expense.title}</div>
                {expense.description && (
                  <div className="cell-desc">{expense.description}</div>
                )}
              </td>
              <td>
                <span className={`category-tag category-${expense.category}`}>
                  {expense.category}
                </span>
              </td>
              <td className="cell-amount">{formatCurrency(expense.amount)}</td>
              <td>
                <span className={`status-badge ${getStatusClass(expense.status)}`}>
                  {expense.status}
                </span>
              </td>
              <td>
                <div className="row-actions">
                  {expense.status === 'pending' && (
                    <>
                      <button
                        className="btn btn-xs btn-approve"
                        onClick={() => handleApprove(expense.id)}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-xs btn-reject"
                        onClick={() => handleReject(expense.id)}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-xs btn-delete"
                    onClick={() => handleDelete(expense.id)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
