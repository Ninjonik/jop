import Link from 'next/link';
import { Suspense } from 'react';

import MockControlClient from '@/app/components/mock/MockControlClient';

export default function MockPage() {
  return (
    <main className="aero-tool min-h-screen bg-[var(--aero-bg)] px-4 py-4 text-[var(--aero-text)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--aero-text-muted)]">Mock Roblox</p>
            <h1 className="text-lg font-semibold">Simulátor relácie</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="text-sm text-[var(--aero-text-muted)] underline-offset-4 hover:underline"
            >
              Back to entry
            </Link>
            <Link
              href="/map"
              className="text-sm text-[var(--aero-text-muted)] underline-offset-4 hover:underline"
            >
              Open map editor
            </Link>
          </div>
        </header>

        <Suspense
          fallback={
            <div className="rounded-[3px] border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] p-4 text-sm text-[var(--aero-text-muted)]">
              Loading mock session…
            </div>
          }
        >
          <MockControlClient />
        </Suspense>
      </div>
    </main>
  );
}
