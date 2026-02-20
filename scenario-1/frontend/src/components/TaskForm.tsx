import { memo, useState } from 'react';
import { createTask } from '../api';

interface TaskFormProps {
  onCreated: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

function TaskFormInner({ onCreated, onError, onSuccess }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      setTitle('');
      setDescription('');
      setPriority('medium');
      setIsOpen(false);
      onSuccess('Task created');
      onCreated();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setSubmitting(false);
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
      <input
        type="text"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
        <option value="high">High Priority</option>
        <option value="medium">Medium Priority</option>
        <option value="low">Low Priority</option>
      </select>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Task'}
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

export const TaskForm = memo(TaskFormInner);
