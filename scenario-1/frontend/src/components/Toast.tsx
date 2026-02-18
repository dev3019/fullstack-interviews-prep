import { useState, useCallback, useEffect, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const TOAST_DURATION_MS = 4000;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: { type: ToastType; message: string }) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...toast, id }]);
      return id;
    },
    [],
  );

  return { toasts, addToast, removeToast };
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: number) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastMessage key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastMessage({
  toast,
  onRemove,
}: {
  toast: ToastItem;
  onRemove: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div className={`toast toast-${toast.type}`}>
      <span className="toast-message">{toast.message}</span>
      <button
        className="toast-close"
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
