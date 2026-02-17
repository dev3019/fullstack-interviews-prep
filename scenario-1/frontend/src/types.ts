export interface Task {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  completed_at: string | null;
}

export interface TaskFilters {
  status: string;
  priority: string;
  search: string;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
}

export interface TaskStats {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  completion_rate: number;
}
