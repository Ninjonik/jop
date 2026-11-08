import TileCatalogViewerClient from '@/app/components/test/bounds/TileCatalogViewerClient';
import type { TileCatalog } from '@/app/components/tiles/tile-catalog';
import {LocalizedText} from '@/lib/i18n/client';
import type { Metadata } from 'next';
// Try both import methods
import tilesData, { tiles as namedTiles, stateGroups } from '@/app/data/tiles';
import { getCurrentAppTitle } from '@/lib/server/git-version';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getCurrentAppTitle(),
    description: 'Relay Railway Dispatcher Controller Tile Catalog Inspector',
  };
}

export default async function TileCatalogPage() {
  // Try named import first, fallback to default
  const tileCatalog: TileCatalog = namedTiles || tilesData || {};

  return (
    <main className="min-h-screen bg-slate-900 p-6 font-sans text-slate-100">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-lime-400">
          <LocalizedText text="Relay Railway Dispatcher — Component Inspector" />
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          <LocalizedText text="Loaded via Next.js Server Component from" />{' '}
          <code className="text-sky-300">tiles.ts</code>
        </p>
      </header>

      <TileCatalogViewerClient tiles={tileCatalog} tileSize={75} stateGroups={stateGroups || {}} />
    </main>
  );
}
