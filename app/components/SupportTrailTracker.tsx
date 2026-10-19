'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { readSupportTrail, safeSupportPath, SUPPORT_TRAIL_KEY } from '../../lib/supportShared';

export function SupportTrailTracker({ scope }: { scope: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const path = safeSupportPath(pathname);
    if (!path || path.startsWith('/support')) return;
    try {
      const trail = readSupportTrail(sessionStorage, scope);
      if (trail.at(-1)?.path !== path) trail.push({ path, at: new Date().toISOString() });
      sessionStorage.setItem(SUPPORT_TRAIL_KEY, JSON.stringify({ scope, trail: trail.slice(-10) }));
    } catch { /* Storage is optional; reporting still works when it is blocked. */ }
  }, [pathname, scope]);
  return null;
}
