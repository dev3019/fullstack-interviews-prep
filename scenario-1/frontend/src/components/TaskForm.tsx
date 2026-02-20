import { memo, useState, useEffect } from 'react';
import { createTask, updateTask } from '../api';
import { Task } from '../types';

interface TaskFormProps {
  editingTask: Task | null;
  onCreated: () => void;
  onUpdated: () => void;
  onCancelEdit: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

function TaskFormInner({
  editingTask,
  onCreated,
  onUpdated,
  onCancelEdit,
  onError,
  onSuccess,
}: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setPriority(editingTask.priority);
      setIsOpen(true);
    }
  }, [editingTask]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, {
          title: title.trim(),
          description: description.trim(),
          priority: priority as Task['priority'],
        });
        onSuccess('Task updated');
        onUpdated();
      } else {
        await createTask({
          title: title.trim(),
          description: description.trim(),
          priority,
        });
        onSuccess('Task created');
        onCreated();
      }
      resetForm();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    if (editingTask) onCancelEdit();
  };

  if (!isOpen) {
    return (
      <button className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + New Task
      </button>
    );
  }

  return (
    <form
      className={`task-form${editingTask ? ' editing' : ''}`}
      onSubmit={handleSubmit}
    >
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
          {submitting
            ? editingTask
              ? 'Saving...'
              : 'Creating...'
            : editingTask
              ? 'Save Changes'
              : 'Create Task'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export const TaskForm = memo(TaskFormInner);
