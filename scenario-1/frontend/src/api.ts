import { TaskFilters, TaskListResponse, TaskStats, Task } from './types';

const API_BASE = 'http://localhost:8000';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.detail) {
        message =
          typeof body.detail === 'string'
            ? body.detail
            : JSON.stringify(body.detail);
      }
    } catch {
      // response body wasn't JSON
    }
    throw new Error(message);
  }
  return response.json();
}

export async function fetchStats(): Promise<TaskStats> {
  const response = await fetch(`${API_BASE}/api/tasks/stats`);
  return handleResponse<TaskStats>(response);
}

export async function fetchTasks(
  filters: TaskFilters,
): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.search) params.set('search', filters.search);

  const response = await fetch(`${API_BASE}/api/tasks?${params.toString()}`);
  return handleResponse<TaskListResponse>(response);
}

export async function createTask(data: {
  title: string;
  description: string;
  priority: string;
}): Promise<Task> {
  const response = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Task>(response);
}

export async function updateTask(
  id: number,
  data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority'>>,
): Promise<Task> {
  const response = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Task>(response);
}

export async function deleteTask(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.detail) {
        message =
          typeof body.detail === 'string'
            ? body.detail
            : JSON.stringify(body.detail);
      }
    } catch {
      // response body wasn't JSON
    }
    throw new Error(message);
  }
}
