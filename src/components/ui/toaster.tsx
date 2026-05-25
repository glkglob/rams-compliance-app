'use client';

import { useToast } from './use-toast';
import { X, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center justify-between p-4 rounded-lg shadow-lg min-w-[300px] max-w-[400px]',
            {
              'bg-white border border-gray-200': !toast.variant || toast.variant === 'default',
              'bg-red-50 border border-red-200': toast.variant === 'destructive',
              'bg-green-50 border border-green-200': toast.variant === 'success',
            }
          )}
        >
          <div className="flex items-center space-x-3">
            {toast.variant === 'success' && <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />}
            {toast.variant === 'destructive' && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
            {(!toast.variant || toast.variant === 'default') && (
              <AlertTriangle className="h-5 w-5 text-blue-500 shrink-0" />
            )}
            <div>
              <p className="font-medium text-sm">{toast.title}</p>
              {toast.description && (
                <p className="text-sm text-muted-foreground">{toast.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="text-muted-foreground hover:text-foreground ml-4"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
