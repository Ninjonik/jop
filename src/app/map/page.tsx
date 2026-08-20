import Link from 'next/link';
import { Suspense } from 'react';

import SessionMapClient from '@/app/components/map/SessionMapClient';

export default function MapPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Session Map</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Station and topology authoring
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="text-sm text-neutral-400 underline-offset-4 hover:underline">
              Back to entry
            </Link>
            <Link
              href="/editor"
              className="text-sm text-neutral-400 underline-offset-4 hover:underline"
            >
              Open station editor
            </Link>
          </div>
        </header>

        <Suspense
          fallback={
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4 text-sm text-neutral-400">
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
