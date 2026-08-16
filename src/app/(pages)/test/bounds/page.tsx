import TileCatalogViewerClient, {
} from '@/app/components/test/bounds/TileCatalogViewerClient';
import type { TileCatalog } from '@/app/components/tiles/tile-catalog';
// Try both import methods
import tilesData, { stateGroups, tiles as namedTiles } from '@/app/data/tiles';

export const metadata = {
    title: 'Tile Catalog Inspector',
    description: 'Relay Railway Dispatcher Controller Tile Catalog Inspector',
};

export default async function TileCatalogPage() {
    // Try named import first, fallback to default
    const tileCatalog: TileCatalog = namedTiles || tilesData || {};

    return (
        <main className="min-h-screen bg-slate-900 p-6 font-sans text-slate-100">
            <header className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-lime-400">
                    Relay Railway Dispatcher — Component Inspector
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                    Loaded via Next.js Server Component from <code className="text-sky-300">tiles.ts</code>
                </p>
            </header>

            <TileCatalogViewerClient
                tiles={tileCatalog}
                tileSize={75}
                stateGroups={stateGroups || {}}
            />
        </main>
    );
}
