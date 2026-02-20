import { memo, useEffect, useState } from 'react';
import { createTask } from '../api';
import { Task } from '../types';

interface TaskFormProps {
  mode?: 'create' | 'edit';
  initialTask?: Pick<Task, 'id' | 'title' | 'description' | 'priority'> | null;
  onCreated: () => Promise<void>;
  onEdited?: (data: {
    id: number;
    title: string;
    description: string;
    priority: Task['priority'];
  }) => Promise<void>;
  onCancelEdit?: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

function TaskFormInner({
  mode = 'create',
  initialTask = null,
  onCreated,
  onEdited,
  onCancelEdit,
  onError,
  onSuccess,
}: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || !initialTask) return;
    setTitle(initialTask.title);
    setDescription(initialTask.description);
    setPriority(initialTask.priority);
  }, [mode, initialTask]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        priority,
      };

      if (mode === 'edit') {
        if (!initialTask || !onEdited) {
          throw new Error('Edit mode is not properly configured');
        }
        await onEdited({ id: initialTask.id, ...payload });
        onSuccess('Task updated');
        onCancelEdit?.();
      } else {
        await createTask(payload);
        setTitle('');
        setDescription('');
        setPriority('medium');
        setIsOpen(false);
        onSuccess('Task created');
        await onCreated();
      }
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'edit' && !initialTask) {
    return null;
  }

  if (mode === 'create' && !isOpen) {
    return (
      <button className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + New Task
      </button>
    );
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      {mode === 'edit' && (
        <p className="task-form-mode">Editing task #{initialTask?.id}</p>
      )}
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
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as Task['priority'])}
      >
        <option value="high">High Priority</option>
        <option value="medium">Medium Priority</option>
        <option value="low">Low Priority</option>
      </select>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting
            ? mode === 'edit'
              ? 'Saving...'
              : 'Creating...'
            : mode === 'edit'
              ? 'Save Changes'
              : 'Create Task'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (mode === 'edit') {
              onCancelEdit?.();
              return;
            }
            setIsOpen(false);
          }}
        >
          {mode === 'edit' ? 'Cancel Edit' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}

export const TaskForm = memo(TaskFormInner);
