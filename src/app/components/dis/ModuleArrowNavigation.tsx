'use client';
import { useEffect } from 'react';
export function ModuleArrowNavigation<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: T[];
  active: T;
  onSelect: (tab: T) => void;
}) {
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
        event.isComposing
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]',
        )
      )
        return;
      if (!tabs.length) return;
      event.preventDefault();
      const index = tabs.indexOf(active);
      onSelect(tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]);
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [tabs, active, onSelect]);
  return null;
}
