'use client';

import { useId, useState, type ReactNode } from 'react';

export default function AuthoringTools({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  return (
    <section className="shrink-0 border-b border-[var(--aero-panel-border)]">
      <button
        type="button"
        className="aero-btn w-full justify-between rounded-none! px-3!"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{title}</span>
        <span>{expanded ? 'Zbaliť ▲' : 'Rozbaliť ▼'}</span>
      </button>
      <div id={contentId} hidden={!expanded} className="max-h-[55vh] overflow-auto">
        {children}
      </div>
    </section>
  );
}
