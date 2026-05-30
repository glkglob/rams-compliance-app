'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface Props {
  userId?: string;
}

// Rendered inside RootLayout (server) so it receives fresh user data on every
// navigation. Sets Sentry user context so every error includes who triggered it.
// Only the opaque userId is sent — no PII (email, IP, username).
export function SentryUserContext({ userId }: Props) {
  useEffect(() => {
    if (userId) {
      Sentry.setUser({ id: userId });
    } else {
      Sentry.setUser(null);
    }
  }, [userId]);

  return null;
}
