import SessionMapClient from '@/app/components/map/SessionMapClient';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import {LocalizedText} from '@/lib/i18n/client';
import Link from 'next/link';
import { Suspense } from 'react';

export default function MapPage() {
  return (
    <main className="aero-tool flex min-h-screen flex-col bg-[var(--aero-panel-bg)] text-[var(--aero-text)]">
      <header className="flex items-center gap-3 border-b border-[var(--aero-window-border)] bg-gradient-to-b from-[var(--aero-caption-top)] to-[var(--aero-caption-bottom)] px-3 py-2 text-xs">
        <AeroIcon name="network" size={24} />
        <h1 className="mr-auto font-semibold">
          <LocalizedText text="DIS — Správa staníc" />
        </h1>
        <Link className="aero-btn" href="/dis">
          <AeroIcon name="back" /> <LocalizedText text="Späť do DIS" />{' '}
        </Link>
      </header>
      <Suspense
        fallback={
          <p className="p-4 text-xs" role="status">
            {' '}
            <LocalizedText text="Načítavam správcu staníc…" />{' '}
          </p>
        }
      >
        <SessionMapClient />
      </Suspense>
    </main>
  );
}
