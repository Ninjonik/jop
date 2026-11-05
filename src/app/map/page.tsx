import Link from 'next/link';
import { Suspense } from 'react';

import SessionMapClient from '@/app/components/map/SessionMapClient';

export default function MapPage() {
  return (
    <main className="aero-tool min-h-screen bg-[var(--aero-bg)] px-4 py-4 text-[var(--aero-text)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--aero-text-muted)]">Správa staníc</p>
            <h1 className="text-lg font-semibold">Stanice a topológia</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="text-sm text-[var(--aero-text-muted)] underline-offset-4 hover:underline"
            >
              Back to entry
            </Link>
            <Link
              href="/editor"
              className="text-sm text-[var(--aero-text-muted)] underline-offset-4 hover:underline"
            >
              Open station editor
            </Link>
          </div>
        </header>

        <Suspense
          fallback={
            <div className="rounded-[3px] border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] p-4 text-sm text-[var(--aero-text-muted)]">
              Loading map session...
            </div>
          }
        >
          <SessionMapClient />
        </Suspense>
      </div>
    </main>
  );
}
