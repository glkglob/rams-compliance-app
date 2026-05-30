import type { ErrorEvent, Event, EventHint, TransactionEvent } from '@sentry/core';
import { REQUEST_ID_HEADER } from '@/lib/request-id';

const REDACTED = '[Filtered]';
const MAX_DEPTH = 6;

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key|access[-_]?token|refresh[-_]?token|email|subcontractor|rams|extracted[-_]?text|document[-_]?text|body|headers)/i;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export function beforeSend(event: ErrorEvent, hint: EventHint): ErrorEvent {
  void hint;
  return scrubSentryEvent(enrichObservabilityContext(event as unknown as Event)) as unknown as ErrorEvent;
}

export function beforeSendTransaction(
  event: TransactionEvent,
  hint: EventHint,
): TransactionEvent {
  void hint;
  return scrubSentryEvent(
    enrichObservabilityContext(event as unknown as Event),
  ) as unknown as TransactionEvent;
}

function enrichObservabilityContext(event: Event): Event {
  const runtimeCtx = readRuntimeRequestContext();
  const ctx = runtimeCtx?.ctx;
  const noContextId = runtimeCtx?.noContextId;
  const requestId =
    (ctx?.requestId && ctx.requestId !== noContextId ? ctx.requestId : undefined) ??
    readRequestIdFromEvent(event);

  if (!requestId && !ctx?.userId && !ctx?.route) {
    return event;
  }

  const nextEvent: Event = { ...event };

  if (requestId || ctx?.route) {
    nextEvent.tags = {
      ...(event.tags ?? {}),
      ...(requestId ? { request_id: requestId } : {}),
      ...(ctx?.route ? { route: ctx.route } : {}),
    };
  }

  if (ctx?.userId && !event.user?.id) {
    nextEvent.user = {
      ...(event.user ?? {}),
      id: ctx.userId,
    };
  }

  if (requestId) {
    nextEvent.extra = {
      ...(event.extra ?? {}),
      requestId,
    };
  }

  return nextEvent;
}

function readRuntimeRequestContext():
  | { ctx: { requestId?: string; userId?: string; route?: string }; noContextId: string }
  | null {
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const requestContextModule = require('@/lib/request-context') as {
      getRequestContext: () => { requestId?: string; userId?: string; route?: string };
      NO_REQUEST_CONTEXT_ID: string;
    };

    return {
      ctx: requestContextModule.getRequestContext(),
      noContextId: requestContextModule.NO_REQUEST_CONTEXT_ID,
    };
  } catch {
    return null;
  }
}

function readRequestIdFromEvent(event: Event): string | undefined {
  const headers = event.request?.headers;
  if (!headers) {
    return undefined;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === REQUEST_ID_HEADER && typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  if (typeof headers !== 'object') {
    return undefined;
  }

  const record = headers as Record<string, unknown>;
  const rawValue = record[REQUEST_ID_HEADER] ?? record[REQUEST_ID_HEADER.toUpperCase()];
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : undefined;
}

function scrubSentryEvent<T>(event: T): T {
  const scrubbed = scrubValue(event);
  return (scrubbed ?? event) as T;
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;

  if (typeof value === 'string') {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : scrubValue(nestedValue, depth + 1);
  }
  return output;
}

function scrubString(value: string): string {
  return value
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
