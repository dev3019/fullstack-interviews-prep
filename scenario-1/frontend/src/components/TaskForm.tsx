import { memo, useState } from 'react';
import { createTask } from '../api';

interface TaskFormProps {
  onCreated: () => Promise<void> | void;
}

function TaskFormInner({ onCreated }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (!normalizedTitle) {
      setError('Title is required');
      return;
    }
    if (normalizedTitle.length > 200) {
      setError('Title must be 200 characters or less');
      return;
    }
    if (normalizedDescription.length > 5000) {
      setError('Description must be 5000 characters or less');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      await createTask({
        title: normalizedTitle,
        description: normalizedDescription,
        priority,
      });
      setTitle('');
      setDescription('');
      setPriority('medium');
      setIsOpen(false);
      await onCreated();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + New Task
      </button>
    );
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <input
        type="text"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        maxLength={200}
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={5000}
      />
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option value="high">High Priority</option>
        <option value="medium">Medium Priority</option>
        <option value="low">Low Priority</option>
      </select>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Task'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setIsOpen(false)}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export const TaskForm = memo(TaskFormInner);
