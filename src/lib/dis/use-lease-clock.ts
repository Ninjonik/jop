'use client';
import { useEffect, useState } from 'react';
/** Expire the displayed claim even when the next network refresh is delayed. */
export function useLeaseClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  return now;
}
