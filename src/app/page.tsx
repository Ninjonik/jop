'use client';

import { useRouter } from '@/lib/navigation';
import { useEffect } from 'react';

/** Keep one canonical entry point: DIS owns session restoration and login routing. */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dis');
  }, [router]);

  return null;
}
