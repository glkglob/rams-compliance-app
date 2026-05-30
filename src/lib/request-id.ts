export const REQUEST_ID_HEADER = 'x-request-id';

export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function readRequestIdHeader(
  headers: Pick<Headers, 'get'> | null | undefined,
): string | null {
  const requestId = headers?.get(REQUEST_ID_HEADER)?.trim();
  return requestId || null;
}
