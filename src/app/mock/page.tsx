import { Suspense } from 'react';
import Link from 'next/link';

import MockControlClient from '@/app/components/mock/MockControlClient';

export default function MockPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Mock Roblox</p>
            <h1 className="text-3xl font-semibold tracking-tight">Session bootstrap and simulator</h1>
          </div>
          <Link href="/" className="text-sm text-neutral-400 underline-offset-4 hover:underline">
            Back to entry
          </Link>
        </header>

        <Suspense
          fallback={
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4 text-sm text-neutral-400">
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
