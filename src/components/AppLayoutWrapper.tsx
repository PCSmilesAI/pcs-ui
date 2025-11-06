'use client';

import { useEffect, useState } from 'react';
import AppLayout from './AppLayout';

/**
 * Wrapper component that ensures AppLayout only renders on the client.
 * This prevents SSR/hydration mismatches caused by usePathname() and useSearchParams()
 */
export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Always render AppLayout, but it will handle the mounted state internally
  return <AppLayout>{children}</AppLayout>;
}

