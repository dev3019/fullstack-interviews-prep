import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTasks, updateTask, deleteTask } from './api';
import { Task, TaskFilters } from './types';
import { Dashboard } from './components/Dashboard';
import { FilterBar } from './components/FilterBar';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
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
  const [statsKey, setStatsKey] = useState(0);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>({
    status: '',
    priority: '',
    search: '',
  });

  const debouncedSearch = useDebouncedValue(filters.search, 400);

  const debouncedFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters.status, filters.priority, debouncedSearch],
  );

  const refreshStats = useCallback(() => setStatsKey((k) => k + 1), []);

  const getErrorMessage = useCallback(
    (error: unknown, fallback: string): string =>
      error instanceof Error ? error.message : fallback,
    [],
  );

  const loadTasks = useCallback(async () => {
    setIsTasksLoading(true);
    setTaskError(null);
    try {
      const data = await fetchTasks(debouncedFilters);
      setTasks(data.tasks);
    } catch (error) {
      setTaskError(getErrorMessage(error, 'Failed to load tasks'));
    } finally {
      setIsTasksLoading(false);
    }
  }, [debouncedFilters, getErrorMessage]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleMutation = useCallback(async () => {
    setTaskError(null);
    refreshStats();
    await loadTasks();
  }, [refreshStats, loadTasks]);

  const handleStatusChange = useCallback(
    async (taskId: number, newStatus: Task['status']) => {
      let previousTasks: Task[] = [];
      setTaskError(null);
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
      } catch (error) {
        setTasks(previousTasks);
        refreshStats();
        setTaskError(getErrorMessage(error, 'Failed to update task status'));
      }
    },
    [refreshStats, getErrorMessage],
  );

  const handleDelete = useCallback(
    async (taskId: number) => {
      let previousTasks: Task[] = [];
      setTaskError(null);
      setTasks((prev) => {
        previousTasks = prev;
        return prev.filter((t) => t.id !== taskId);
      });
      refreshStats();

      try {
        await deleteTask(taskId);
      } catch (error) {
        setTasks(previousTasks);
        refreshStats();
        setTaskError(getErrorMessage(error, 'Failed to delete task'));
      }
    },
    [refreshStats, getErrorMessage],
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
          <TaskForm onCreated={handleMutation} />
        </section>

        {taskError && (
          <div className="inline-error" role="alert">
            {taskError}
          </div>
        )}
        {isTasksLoading ? (
          <div className="loading-state">Loading tasks...</div>
        ) : (
          <TaskList
            tasks={tasks}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        )}
      </main>
    </div>
  );
}

export default App;
