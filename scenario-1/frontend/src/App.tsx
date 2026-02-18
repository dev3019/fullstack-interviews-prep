import { useState, useEffect, useCallback } from 'react';
import { fetchTasks } from './api';
import { Task, TaskFilters } from './types';
import { Dashboard } from './components/Dashboard';
import { FilterBar } from './components/FilterBar';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import './App.css';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [filters, setFilters] = useState<TaskFilters>({
    status: '',
    priority: '',
    search: '',
  });

  const loadTasks = useCallback(async () => {
    try {
      const data = await fetchTasks(filters);
      setTasks(data.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }, [filters]);

  const handleTaskMutation = useCallback(() => {
    loadTasks();
    setStatsRefreshKey((k) => k + 1);
  }, [loadTasks]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Tracker</h1>
        <p>Manage your team&apos;s tasks efficiently</p>
      </header>

      <main className="app-main">
        <Dashboard statsRefreshKey={statsRefreshKey} />

        <section className="controls">
          <FilterBar filters={filters} onChange={setFilters} />
          <TaskForm onCreated={handleTaskMutation} />
        </section>

        <TaskList tasks={tasks} onUpdate={handleTaskMutation} />
      </main>
    </div>
  );
}

export default App;
