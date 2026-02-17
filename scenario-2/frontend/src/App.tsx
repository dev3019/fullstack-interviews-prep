import { useState, useEffect, useCallback } from 'react';
import { fetchExpenses, fetchSummary } from './api';
import { Expense, ExpenseFilters, ExpenseSummary } from './types';
import { SpendingSummary } from './components/SpendingSummary';
import { FilterBar } from './components/FilterBar';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseTable } from './components/ExpenseTable';
import './App.css';

function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [filters, setFilters] = useState<ExpenseFilters>({
    category: '',
    status: '',
    date_start: '',
    date_end: '',
  });

  const loadExpenses = useCallback(async () => {
    try {
      const data = await fetchExpenses(filters);
      setExpenses(data.expenses);
    } catch (error) {
      console.error('Failed to load expenses:', error);
    }
  }, [filters]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await fetchSummary();
      setSummary(data);
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleUpdate = () => {
    loadExpenses();
    loadSummary();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Expense Report</h1>
        <p>Track and manage team expenses</p>
      </header>

      <main className="app-main">
        <SpendingSummary summary={summary} />

        <section className="controls">
          <FilterBar filters={filters} onChange={setFilters} />
          <ExpenseForm onCreated={handleUpdate} />
        </section>

        <ExpenseTable expenses={expenses} onUpdate={handleUpdate} />
      </main>
    </div>
  );
}

export default App;
