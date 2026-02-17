import { useState, useEffect, useCallback } from 'react';
import { fetchTasks, fetchTaskStats } from './api';
import { Task, TaskFilters, TaskStats } from './types';
import { Dashboard } from './components/Dashboard';
import { FilterBar } from './components/FilterBar';
import { TaskForm } from './components/TaskForm';
import { TaskList } from './components/TaskList';
import './App.css';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    completed: 0,
    in_progress: 0,
    pending: 0,
  });
  const [filters, setFilters] = useState<TaskFilters>({
    status: '',
    priority: '',
    search: '',
  });

  const loadTasks = useCallback(async () => {
    try {
      const [taskData, statsData] = await Promise.all([
        fetchTasks(filters),
        fetchTaskStats(),
      ]);
      setTasks(taskData.tasks);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }, [filters]);

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
        <Dashboard stats={stats} />

        <section className="controls">
          <FilterBar filters={filters} onChange={setFilters} />
          <TaskForm onCreated={loadTasks} />
        </section>

        <TaskList tasks={tasks} onUpdate={loadTasks} />
      </main>
    </div>
  );
}

export default App;
