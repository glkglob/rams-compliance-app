import { describe, expect, it } from 'vitest';

import { beforeSend, beforeSendTransaction } from '@/lib/sentry/scrub';

describe('Sentry scrub hooks', () => {
  it('redacts sensitive keys and common token/email patterns from error events', () => {
    const event = beforeSend(
      {
        type: undefined,
        message: 'Failed for operative@example.com with Bearer secret-token',
        extra: {
          ramsText: 'full RAMS document text',
          nested: {
            harmless: 'Contact site.manager@example.com',
            authorization: 'Bearer another-secret',
          },
        },
      },
      {},
    );

    expect(event.message).toBe('Failed for [Filtered] with Bearer [Filtered]');
    expect(event.extra).toEqual({
      ramsText: '[Filtered]',
      nested: {
        harmless: 'Contact [Filtered]',
        authorization: '[Filtered]',
      },
    });
  });

  it('redacts sensitive transaction contexts before performance events leave the app', () => {
    const event = beforeSendTransaction(
      {
        type: 'transaction',
        transaction: 'POST /api/projects',
        contexts: {
          request: {
            headers: { cookie: 'session=secret', accept: 'application/json' },
          },
        },
      },
      {},
    );

    expect(event.contexts?.request).toEqual({
      headers: '[Filtered]',
    });
  });
});
