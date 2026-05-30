/**
 * Request-scoped context using AsyncLocalStorage.
 *
 * Provides a requestId (and optional userId) that can be read anywhere
 * in the call stack without manually threading it through every function.
 *
 * Usage in API routes:
 *   import { runWithRequestContext, getRequestContext } from '@/lib/request-context';
 *
 *   return runWithRequestContext(request, async () => {
 *     const { requestId } = getRequestContext();
 *     // ...rest of handler
 *   });
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { generateRequestId, readRequestIdHeader, REQUEST_ID_HEADER } from '@/lib/request-id';

export interface RequestContext {
  requestId: string;
  userId?: string;
  route?: string;
}

const store = new AsyncLocalStorage<RequestContext>();
export const NO_REQUEST_CONTEXT_ID = 'no-context';
type HeaderCarrier = Pick<Headers, 'get'> | null | undefined;
type RequestHandler<TArgs extends unknown[] = []> = (
  request: Request,
  ...args: TArgs
) => Response | Promise<Response>;

function resolveRequestId(headers: HeaderCarrier): string {
  return readRequestIdHeader(headers) ?? generateRequestId();
}

/** Read the current request context. Returns a fallback if called outside a context. */
export function getRequestContext(): RequestContext {
  return store.getStore() ?? { requestId: NO_REQUEST_CONTEXT_ID };
}

/**
 * Ensure the current async call chain has request context set.
 * Useful in server helpers that don't have direct access to a Request object.
 */
export function ensureRequestContext(headers?: HeaderCarrier, route?: string): RequestContext {
  const existing = store.getStore();
  if (existing) {
    if (route && !existing.route) {
      existing.route = route;
    }
    return existing;
  }

  const ctx: RequestContext = {
    requestId: resolveRequestId(headers),
    ...(route ? { route } : {}),
  };
  store.enterWith(ctx);
  return ctx;
}

/** Set the userId on the current request context (after auth). */
export function setRequestUserId(userId: string): void {
  const ctx = store.getStore();
  if (ctx) {
    ctx.userId = userId;
  }
}

/** Set or update route metadata on the current request context. */
export function setRequestRoute(route: string): void {
  const ctx = store.getStore();
  if (ctx) {
    ctx.route = route;
  }
}

/**
 * Run `fn` inside a request-scoped context.
 * Reads `x-request-id` from the incoming request (set by middleware)
 * or generates one on the fly.
 */
export function runWithRequestContext<T>(
  request: Request,
  fn: () => T | Promise<T>,
  route?: string,
): Promise<T> {
  const ctx: RequestContext = {
    requestId: resolveRequestId(request.headers),
    ...(route ? { route } : {}),
  };
  return store.run(ctx, () => Promise.resolve(fn()));
}

/**
 * Run `fn` inside context created from raw headers (for internal/background usage
 * where there is no full Request object).
 */
export function runWithRequestContextFromHeaders<T>(
  headers: HeaderCarrier,
  fn: () => T | Promise<T>,
  route?: string,
): Promise<T> {
  const ctx: RequestContext = {
    requestId: resolveRequestId(headers),
    ...(route ? { route } : {}),
  };
  return store.run(ctx, () => Promise.resolve(fn()));
}

/**
 * Run a non-HTTP task in a synthetic context for consistent logging/Sentry tags.
 */
export function runWithBackgroundContext<T>(
  fn: () => T | Promise<T>,
  options?: { requestId?: string; route?: string; userId?: string },
): Promise<T> {
  const ctx: RequestContext = {
    requestId: options?.requestId?.trim() || generateRequestId(),
    ...(options?.route ? { route: options.route } : {}),
    ...(options?.userId ? { userId: options.userId } : {}),
  };
  return store.run(ctx, () => Promise.resolve(fn()));
}

/**
 * Ensure an outgoing response has x-request-id attached from current context.
 * Middleware already does this globally; this is a safe in-handler fallback.
 */
export function attachRequestIdHeader<T extends Response>(response: T): T {
  const ctx = store.getStore();
  if (!ctx || !ctx.requestId || ctx.requestId === NO_REQUEST_CONTEXT_ID) {
    return response;
  }

  if (!response.headers.has(REQUEST_ID_HEADER)) {
    response.headers.set(REQUEST_ID_HEADER, ctx.requestId);
  }
  return response;
}

/**
 * Convenience wrapper for Route Handlers.
 * It initializes request context, runs the handler, and guarantees x-request-id
 * is present on the response.
 */
export function withRequestContext<TArgs extends unknown[] = []>(
  handler: RequestHandler<TArgs>,
  route?: string,
): RequestHandler<TArgs> {
  return async (request: Request, ...args: TArgs) => {
    const response = await runWithRequestContext(
      request,
      () => handler(request, ...args),
      route,
    );

    return attachRequestIdHeader(response);
  };
}
