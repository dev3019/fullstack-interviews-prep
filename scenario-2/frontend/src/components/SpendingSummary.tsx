import { ExpenseSummary } from '../types';

interface SpendingSummaryProps {
  summary: ExpenseSummary | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  travel: '#4299e1',
  meals: '#48bb78',
  office: '#ed8936',
  software: '#9f7aea',
  other: '#a0aec0',
};

export function SpendingSummary({ summary }: SpendingSummaryProps) {
  if (!summary) {
    return <div className="summary-loading">Loading summary...</div>;
  }

  const maxAmount = Math.max(...Object.values(summary.by_category), 1);

  return (
    <section className="spending-summary">
      <div className="summary-header">
        <div className="summary-total">
          <span className="total-label">Total Spending</span>
          <span className="total-value">${summary.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="summary-count">
          <span className="count-value">{summary.count}</span>
          <span className="count-label">Expenses</span>
        </div>
      </div>

      <div className="category-breakdown">
        <h3>By Category</h3>
        {Object.entries(summary.by_category).map(([category, amount]) => (
          <div key={category} className="category-row">
            <div className="category-info">
              <span className="category-name">{category}</span>
              <span className="category-amount">
                ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="category-bar-bg">
              <div
                className="category-bar"
                style={{
                  width: `${(amount / maxAmount) * 100}%`,
                  backgroundColor: CATEGORY_COLORS[category] || '#a0aec0',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
