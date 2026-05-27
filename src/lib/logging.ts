/**
 * Simple structured logger for production use.
 * Outputs JSON in production, pretty console in development.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context: LogContext = {}) {
  const timestamp = new Date().toISOString();

  const logObject = {
    timestamp,
    level,
    message,
    ...context,
  };

  if (process.env.NODE_ENV === 'production') {
    // Structured JSON logging (ideal for log aggregation tools)
    console.log(JSON.stringify(logObject));
  } else {
    // Human-friendly logging in development
    const prefix = `[${level.toUpperCase()}]`;
    console.log(prefix, message, context);
  }
}

export const logger = {
  info(message: string, context?: LogContext) {
    formatLog('info', message, context);
  },

  warn(message: string, context?: LogContext) {
    formatLog('warn', message, context);
  },

  error(message: string, context?: LogContext) {
    formatLog('error', message, context);
  },

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      formatLog('debug', message, context);
    }
  },
};

/**
 * Helper to generate a simple request ID.
 * In production you may want to use a more robust ID from headers (e.g. from a load balancer).
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
