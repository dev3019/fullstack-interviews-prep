import { TaskStats } from '../types';

interface DashboardProps {
  stats: TaskStats;
}

export function Dashboard({ stats }: DashboardProps) {
  const total = stats.total;
  const completed = stats.completed;
  const inProgress = stats.in_progress;
  const pending = stats.pending;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section className="dashboard">
      <div className="stat-card">
        <span className="stat-value">{total}</span>
        <span className="stat-label">Total Tasks</span>
      </div>
      <div className="stat-card completed">
        <span className="stat-value">{completed}</span>
        <span className="stat-label">Completed</span>
      </div>
      <div className="stat-card in-progress">
        <span className="stat-value">{inProgress}</span>
        <span className="stat-label">In Progress</span>
      </div>
      <div className="stat-card pending">
        <span className="stat-value">{pending}</span>
        <span className="stat-label">Pending</span>
      </div>
      <div className="stat-card rate">
        <span className="stat-value">{completionRate}%</span>
        <span className="stat-label">Completion Rate</span>
      </div>
    </section>
  );
}
