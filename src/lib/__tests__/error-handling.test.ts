import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError, handleAPIError } from '@/lib/error-handling';

describe('handleAPIError', () => {
  it('does not expose unexpected internal errors to clients', async () => {
    const response = handleAPIError(new Error('database password leaked in stack'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });

  it('keeps validation errors informative', async () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({});
    if (result.success) throw new Error('expected validation failure');

    const response = handleAPIError(result.error);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Validation failed');
    expect(body.details).toEqual([
      { field: 'name', message: 'Invalid input: expected string, received undefined' },
    ]);
  });

  it('hides 5xx AppError messages while preserving safe 4xx messages', async () => {
    const serverResponse = handleAPIError(new AppError('raw database failure', 500, 'DB_FAILURE'));
    expect(serverResponse.status).toBe(500);
    await expect(serverResponse.json()).resolves.toEqual({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });

    const clientResponse = handleAPIError(new AppError('Bad request', 400, 'BAD_REQUEST'));
    expect(clientResponse.status).toBe(400);
    await expect(clientResponse.json()).resolves.toEqual({
      error: 'Bad request',
      code: 'BAD_REQUEST',
    });
  });
});
