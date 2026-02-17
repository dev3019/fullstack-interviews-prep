import { Expense, ExpenseFilters, ExpenseSummary } from './types';

const API_BASE = 'http://localhost:8000';

export async function fetchExpenses(
  filters: ExpenseFilters
): Promise<{ expenses: Expense[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (filters.date_start) params.set('date_start', filters.date_start);
  if (filters.date_end) params.set('date_end', filters.date_end);

  const response = await fetch(`${API_BASE}/api/expenses?${params.toString()}`);
  if (!response.ok) throw new Error('Failed to fetch expenses');
  return response.json();
}

export async function fetchSummary(): Promise<ExpenseSummary> {
  const response = await fetch(`${API_BASE}/api/expenses/summary`);
  if (!response.ok) throw new Error('Failed to fetch summary');
  return response.json();
}

export async function createExpense(data: {
  title: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
}): Promise<Expense> {
  const response = await fetch(`${API_BASE}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create expense');
  return response.json();
}

export async function updateExpense(
  id: number,
  data: Partial<Pick<Expense, 'title' | 'description' | 'amount' | 'category' | 'status'>>
): Promise<Expense> {
  const response = await fetch(`${API_BASE}/api/expenses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update expense');
  return response.json();
}

export async function deleteExpense(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/expenses/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete expense');
}
