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

  const handleMutation = useCallback(() => {
    refreshStats();
    loadTasks();
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

      try {
        await updateTask(taskId, { status: newStatus });
        refreshStats();
      } catch (error) {
        setTasks(previousTasks);
        refreshStats();
        addToast({ type: 'error', message: (error as Error).message });
      }
    },
    [refreshStats, addToast],
  );

  const handleDelete = useCallback(
    async (taskId: number) => {
      let previousTasks: Task[] = [];
      setTasks((prev) => {
        previousTasks = prev;
        return prev.filter((t) => t.id !== taskId);
      });

      try {
        await deleteTask(taskId);
        refreshStats();
        addToast({ type: 'success', message: 'Task deleted' });
      } catch (error) {
        setTasks(previousTasks);
        refreshStats();
        addToast({ type: 'error', message: (error as Error).message });
      }
    },
    [refreshStats, addToast],
  );

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTask(null);
  }, []);

  const handleUpdated = useCallback(() => {
    setEditingTask(null);
    handleMutation();
  }, [handleMutation]);

  const handleError = useCallback(
    (message: string) => addToast({ type: 'error', message }),
    [addToast],
  );

  const handleSuccess = useCallback(
    (message: string) => addToast({ type: 'success', message }),
    [addToast],
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
            editingTask={editingTask}
            onCreated={handleMutation}
            onUpdated={handleUpdated}
            onCancelEdit={handleCancelEdit}
            onError={handleError}
            onSuccess={handleSuccess}
          />
        </section>

        <TaskList
          tasks={tasks}
          isLoading={isLoading}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
