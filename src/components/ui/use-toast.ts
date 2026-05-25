'use client';

import { useState, useEffect, useCallback } from 'react';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
}

let toastState: ToastState = { toasts: [] };
let listeners: ((state: ToastState) => void)[] = [];

function emitChange() {
  listeners.forEach(listener => listener(toastState));
}

function dismissToast(id: string) {
  toastState = { toasts: toastState.toasts.filter(t => t.id !== id) };
  emitChange();
}

export function useToast() {
  const [state, setState] = useState<ToastState>(toastState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter(l => l !== setState);
    };
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    toastState = { toasts: [...toastState.toasts, { ...toast, id }] };
    emitChange();
    setTimeout(() => dismissToast(id), toast.duration ?? 5000);
  }, []);

  const dismiss = useCallback((id: string) => dismissToast(id), []);

  return { toasts: state.toasts, addToast, dismissToast: dismiss };
}
