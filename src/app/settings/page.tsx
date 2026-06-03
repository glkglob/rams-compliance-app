'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Legacy redirect: /settings now lives at /organisation (new top-level nav)
export default function LegacySettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/organisation');
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Redirecting to Organisation…
    </div>
  );
}
