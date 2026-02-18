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

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => console.error('Failed to load stats:', err));
  }, [statsKey]);

  return (
    <section className="dashboard">
      <div className="stat-card">
        <span className="stat-value">{stats.total}</span>
        <span className="stat-label">Total Tasks</span>
      </div>
      <div className="stat-card completed">
        <span className="stat-value">{stats.completed}</span>
        <span className="stat-label">Completed</span>
      </div>
      <div className="stat-card in-progress">
        <span className="stat-value">{stats.in_progress}</span>
        <span className="stat-label">In Progress</span>
      </div>
      <div className="stat-card pending">
        <span className="stat-value">{stats.pending}</span>
        <span className="stat-label">Pending</span>
      </div>
      <div className="stat-card rate">
        <span className="stat-value">{stats.completion_rate}%</span>
        <span className="stat-label">Completion Rate</span>
      </div>
    </section>
  );
}

export const Dashboard = memo(DashboardInner);
