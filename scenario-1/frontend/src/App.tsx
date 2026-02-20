import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTasks, updateTask, deleteTask } from './api';
import { Task, TaskFilters } from './types';
import { Dashboard } from './components/Dashboard';
import { FilterBar } from './components/FilterBar';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import { useToast, ToastContainer } from './components/Toast';
import './App.css';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statsKey, setStatsKey] = useState(0);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filters, setFilters] = useState<TaskFilters>({
    status: '',
    priority: '',
    search: '',
  });

  const { toasts, addToast, removeToast } = useToast();

  const debouncedSearch = useDebouncedValue(filters.search, 400);

  const debouncedFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters.status, filters.priority, debouncedSearch],
  );

  const refreshStats = useCallback(() => setStatsKey((k) => k + 1), []);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchTasks(debouncedFilters);
      setTasks(data.tasks);
    } catch (error) {
      addToast({ type: 'error', message: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [debouncedFilters, addToast]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleMutation = useCallback(async () => {
    refreshStats();
    await loadTasks();
  }, [refreshStats, loadTasks]);

  const handleStatusChange = useCallback(
    async (taskId: number, newStatus: Task['status']) => {
      let previousTasks: Task[] = [];
      setTasks((prev) => {
        previousTasks = prev;
        return prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: newStatus,
                completed_at:
                  newStatus === 'completed' ? new Date().toISOString() : null,
              }
            : t,
        );
      });
      refreshStats();

      try {
        await updateTask(taskId, { status: newStatus });
        await handleMutation();
      } catch (error) {
        setTasks(previousTasks);
        refreshStats();
        addToast({ type: 'error', message: (error as Error).message });
      }
    },
    [refreshStats, addToast, handleMutation],
  );

  const handleDelete = useCallback(
    async (taskId: number) => {
      let previousTasks: Task[] = [];
      setTasks((prev) => {
        previousTasks = prev;
        return prev.filter((t) => t.id !== taskId);
      });
      refreshStats();

      try {
        await deleteTask(taskId);
        await handleMutation();
        if (editingTask?.id === taskId) {
          setEditingTask(null);
        }
        addToast({ type: 'success', message: 'Task deleted' });
      } catch (error) {
        setTasks(previousTasks);
        refreshStats();
        addToast({ type: 'error', message: (error as Error).message });
      }
    },
    [refreshStats, addToast, handleMutation, editingTask],
  );

  const handleEditStart = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingTask(null);
  }, []);

  const handleEditSubmit = useCallback(
    async (data: {
      id: number;
      title: string;
      description: string;
      priority: Task['priority'];
    }) => {
      let previousTasks: Task[] = [];
      setTasks((prev) => {
        previousTasks = prev;
        return prev.map((task) =>
          task.id === data.id
            ? {
                ...task,
                title: data.title,
                description: data.description,
                priority: data.priority,
              }
            : task,
        );
      });

      try {
        await updateTask(data.id, {
          title: data.title,
          description: data.description,
          priority: data.priority,
        });
        setEditingTask(null);
        await handleMutation();
      } catch (error) {
        setTasks(previousTasks);
        throw error;
      }
    },
    [handleMutation],
  );

  const handleError = useCallback(
    (message: string) => addToast({ type: 'error', message }),
    [addToast],
  );

  const handleSuccess = useCallback(
    (message: string) => addToast({ type: 'success', message }),
    [addToast],
  );

  const hasActiveFilters = Boolean(
    filters.status || filters.priority || filters.search.trim(),
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Tracker</h1>
        <p>Manage your team&apos;s tasks efficiently</p>
      </header>

      <main className="app-main">
        <Dashboard statsKey={statsKey} />

        <section className="controls">
          <FilterBar filters={filters} onChange={setFilters} />
          <TaskForm
            mode={editingTask ? 'edit' : 'create'}
            initialTask={editingTask}
            onCreated={handleMutation}
            onEdited={handleEditSubmit}
            onCancelEdit={handleEditCancel}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        </section>

        <TaskList
          tasks={tasks}
          isLoading={isLoading}
          hasActiveFilters={hasActiveFilters}
          onStatusChange={handleStatusChange}
          onEdit={handleEditStart}
          onDelete={handleDelete}
        />
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
