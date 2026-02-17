export interface Expense {
  id: number;
  title: string;
  description: string;
  amount: number;
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  expense_date: string;
  created_at: string;
}

export interface ExpenseFilters {
  category: string;
  status: string;
  date_start: string;
  date_end: string;
}

export interface ExpenseSummary {
  total: number;
  by_category: Record<string, number>;
  count: number;
}
