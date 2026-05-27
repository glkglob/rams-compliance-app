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

export interface RequestContext {
  requestId: string;
  userId?: string;
  route?: string;
}

const store = new AsyncLocalStorage<RequestContext>();

/** Read the current request context. Returns a fallback if called outside a context. */
export function getRequestContext(): RequestContext {
  return store.getStore() ?? { requestId: 'no-context' };
}

/** Set the userId on the current request context (after auth). */
export function setRequestUserId(userId: string): void {
  const ctx = store.getStore();
  if (ctx) {
    ctx.userId = userId;
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
  const requestId =
    request.headers.get('x-request-id') ?? generateRequestId();

  const ctx: RequestContext = { requestId, route };
  return store.run(ctx, () => Promise.resolve(fn()));
}

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
