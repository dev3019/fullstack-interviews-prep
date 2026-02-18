import { memo } from 'react';
import { Task } from '../types';

interface TaskListProps {
  tasks: Task[];
  onStatusChange: (taskId: number, newStatus: string) => void;
  onDelete: (taskId: number) => void;
}

function TaskListInner({ tasks, onStatusChange, onDelete }: TaskListProps) {
  const handleDelete = (id: number) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    onDelete(id);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'badge badge-completed';
      case 'in_progress':
        return 'badge badge-in-progress';
      default:
        return 'badge badge-pending';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'badge badge-high';
      case 'medium':
        return 'badge badge-medium';
      default:
        return 'badge badge-low';
    }
  };

  const getNextStatus = (current: string): string => {
    switch (current) {
      case 'pending':
        return 'in_progress';
      case 'in_progress':
        return 'completed';
      case 'completed':
        return 'pending';
      default:
        return 'pending';
    }
  };

  const getActionLabel = (status: string): string => {
    switch (status) {
      case 'completed':
        return '↩ Reopen';
      case 'in_progress':
        return '✓ Complete';
      default:
        return '▶ Start';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (tasks.length === 0) {
    return <div className="empty-state">No tasks found</div>;
  }

  return (
    <section className="task-list">
      {tasks.map((task) => (
        <div key={task.id} className={`task-card ${task.status}`}>
          <div className="task-header">
            <h3 className="task-title">{task.title}</h3>
            <div className="task-badges">
              <span className={getStatusBadgeClass(task.status)}>
                {task.status.replace('_', ' ')}
              </span>
              <span className={getPriorityBadgeClass(task.priority)}>
                {task.priority}
              </span>
            </div>
          </div>
          {task.description && (
            <p className="task-description">{task.description}</p>
          )}
          <div className="task-footer">
            <span className="task-date">
              Created {formatDate(task.created_at)}
            </span>
            <div className="task-actions">
              <button
                className="btn btn-sm"
                onClick={() =>
                  onStatusChange(task.id, getNextStatus(task.status))
                }
                title={`Move to ${getNextStatus(task.status).replace('_', ' ')}`}
              >
                {getActionLabel(task.status)}
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => handleDelete(task.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

export const TaskList = memo(TaskListInner);
