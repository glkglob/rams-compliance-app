'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface Props {
  userId?: string;
  userEmail?: string;
}

// Rendered inside RootLayout (server) so it receives fresh user data on every
// navigation. Sets Sentry user context so every error includes who triggered it.
export function SentryUserContext({ userId, userEmail }: Props) {
  useEffect(() => {
    if (userId) {
      Sentry.setUser({ id: userId, email: userEmail });
    } else {
      Sentry.setUser(null);
    }
  }, [userId, userEmail]);

  return null;
}
