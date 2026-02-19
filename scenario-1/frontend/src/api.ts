import { TaskFilters, TaskListResponse, TaskStats, Task } from './types';

const API_BASE = 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 8000;
const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function normalizeText(value: string): string {
  return value.trim();
}

function validateFilters(filters: TaskFilters): void {
  if (filters.status && !VALID_STATUSES.has(filters.status)) {
    throw new ApiError('Invalid status filter');
  }
  if (filters.priority && !VALID_PRIORITIES.has(filters.priority)) {
    throw new ApiError('Invalid priority filter');
  }
  if (filters.search.length > 200) {
    throw new ApiError('Search text must be 200 characters or less');
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.detail === 'string') {
    return body.detail;
  }
  return `Request failed with status ${response.status}`;
}

function logApiError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>,
): void {
  console.error(`[api] ${context}`, {
    error,
    ...(metadata ?? {}),
  });
}

async function request<T>(
  path: string,
  init?: RequestInit,
  expectJson: boolean = true,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = init?.method ?? 'GET';
  const url = `${API_BASE}${path}`;
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = await readErrorMessage(response);
      const apiError = new ApiError(message, response.status);
      logApiError('non-2xx response', apiError, {
        method,
        path,
        status: response.status,
      });
      throw apiError;
    }
    if (!expectJson) {
      return undefined as T;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      // Already has context from API parsing above, or caller validation.
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      logApiError('request timeout', error, { method, path });
      throw new ApiError('Request timed out');
    }
    if (error instanceof TypeError) {
      logApiError('network error', error, { method, path });
      throw new ApiError('Network error: unable to reach API');
    }
    logApiError('unexpected request error', error, { method, path, url });
    throw new ApiError('Unexpected API error');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init, true);
}

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  await request<void>(path, init, false);
}

export async function fetchStats(): Promise<TaskStats> {
  return requestJson<TaskStats>('/api/tasks/stats');
}

export async function fetchTasks(filters: TaskFilters): Promise<TaskListResponse> {
  validateFilters(filters);
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  const search = normalizeText(filters.search);
  if (search) params.set('search', search);
  return requestJson<TaskListResponse>(`/api/tasks?${params.toString()}`);
}

export async function createTask(data: {
  title: string;
  description: string;
  priority: string;
}): Promise<Task> {
  const title = normalizeText(data.title);
  const description = normalizeText(data.description);
  if (!title) {
    throw new ApiError('Title is required');
  }
  if (title.length > 200) {
    throw new ApiError('Title must be 200 characters or less');
  }
  if (description.length > 5000) {
    throw new ApiError('Description must be 5000 characters or less');
  }
  if (!VALID_PRIORITIES.has(data.priority)) {
    throw new ApiError('Priority must be low, medium, or high');
  }

  return requestJson<Task>('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description, priority: data.priority }),
  });
}

export async function updateTask(
  id: number,
  data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority'>>
): Promise<Task> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError('Task id must be a positive integer');
  }

  const payload: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority'>> =
    {};

  if (data.title !== undefined) {
    const title = normalizeText(data.title);
    if (!title) throw new ApiError('Title cannot be empty');
    if (title.length > 200) {
      throw new ApiError('Title must be 200 characters or less');
    }
    payload.title = title;
  }

  if (data.description !== undefined) {
    const description = normalizeText(data.description);
    if (description.length > 5000) {
      throw new ApiError('Description must be 5000 characters or less');
    }
    payload.description = description;
  }

  if (data.status !== undefined) {
    if (!VALID_STATUSES.has(data.status)) {
      throw new ApiError('Status must be pending, in_progress, or completed');
    }
    payload.status = data.status;
  }

  if (data.priority !== undefined) {
    if (!VALID_PRIORITIES.has(data.priority)) {
      throw new ApiError('Priority must be low, medium, or high');
    }
    payload.priority = data.priority;
  }

  if (Object.keys(payload).length === 0) {
    throw new ApiError('At least one field is required for update');
  }

  return requestJson<Task>(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError('Task id must be a positive integer');
  }
  return requestVoid(`/api/tasks/${id}`, {
    method: 'DELETE',
  });
}
