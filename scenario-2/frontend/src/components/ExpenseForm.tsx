import { useState } from 'react';
import { createExpense } from '../api';

interface ExpenseFormProps {
  onCreated: () => void;
}

export function ExpenseForm({ onCreated }: ExpenseFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('office');
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amount) return;

    try {
      await createExpense({
        title: title.trim(),
        description: description.trim(),
        amount: parseFloat(amount),
        category,
        expense_date: expenseDate,
      });
      setTitle('');
      setDescription('');
      setAmount('');
      setCategory('office');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setIsOpen(false);
      onCreated();
    } catch (error) {
      console.error('Failed to create expense:', error);
    }
  };

  if (!isOpen) {
    return (
      <button className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + New Expense
      </button>
    );
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <input
          type="text"
          placeholder="Expense title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <input
          type="number"
          placeholder="Amount"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="form-row">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="travel">Travel</option>
          <option value="meals">Meals</option>
          <option value="office">Office</option>
          <option value="software">Software</option>
          <option value="other">Other</option>
        </select>
        <input
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Submit Expense
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setIsOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
