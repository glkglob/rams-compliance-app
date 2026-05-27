/**
 * Structured logger for production use.
 * Outputs JSON in production, pretty console in development.
 *
 * Automatically includes requestId and userId from the request context
 * (AsyncLocalStorage) when available — no need to pass them manually.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function getAutoContext(): Partial<LogContext> {
  // Lazy import to avoid circular deps — request-context.ts imports nothing
  // heavy, so the dynamic import is cheap and only resolved once per process.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRequestContext } = require('@/lib/request-context') as {
      getRequestContext: () => { requestId?: string; userId?: string; route?: string };
    };
    const ctx = getRequestContext();
    if (ctx.requestId === 'no-context') return {};
    return {
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.userId ? { userId: ctx.userId } : {}),
      ...(ctx.route ? { route: ctx.route } : {}),
    };
  } catch {
    return {};
  }
}

function formatLog(level: LogLevel, message: string, context: LogContext = {}) {
  const timestamp = new Date().toISOString();

  // Merge automatic context (requestId, userId) with explicit context.
  // Explicit values take precedence.
  const autoCtx = getAutoContext();
  const merged = { ...autoCtx, ...context };

  const logObject = {
    timestamp,
    level,
    message,
    ...merged,
  };

  if (process.env.NODE_ENV === 'production') {
    // Structured JSON — ideal for Railway log drain / Datadog / etc.
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(JSON.stringify(logObject));
  } else {
    // Human-friendly logging in development
    const prefix = `[${level.toUpperCase()}]`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(prefix, message, Object.keys(merged).length > 0 ? merged : '');
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
