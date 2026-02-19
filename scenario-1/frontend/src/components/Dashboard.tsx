import { memo, useState, useEffect } from 'react';
import { TaskStats } from '../types';
import { fetchStats } from '../api';

interface DashboardProps {
  statsKey: number;
}

function DashboardInner({ statsKey }: DashboardProps) {
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    completed: 0,
    in_progress: 0,
    pending: 0,
    completion_rate: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchStats()
      .then(setStats)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      })
      .finally(() => setIsLoading(false));
  }, [statsKey]);

  return (
    <section className="dashboard">
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <div className="stat-card">
        <span className="stat-value">{isLoading ? '...' : stats.total}</span>
        <span className="stat-label">Total Tasks</span>
      </div>
      <div className="stat-card completed">
        <span className="stat-value">{isLoading ? '...' : stats.completed}</span>
        <span className="stat-label">Completed</span>
      </div>
      <div className="stat-card in-progress">
        <span className="stat-value">{isLoading ? '...' : stats.in_progress}</span>
        <span className="stat-label">In Progress</span>
      </div>
      <div className="stat-card pending">
        <span className="stat-value">{isLoading ? '...' : stats.pending}</span>
        <span className="stat-label">Pending</span>
      </div>
      <div className="stat-card rate">
        <span className="stat-value">
          {isLoading ? '...' : `${stats.completion_rate}%`}
        </span>
        <span className="stat-label">Completion Rate</span>
      </div>
    </section>
  );
}

export const Dashboard = memo(DashboardInner);
