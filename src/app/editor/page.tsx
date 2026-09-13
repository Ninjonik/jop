import StationEditorClient from '@/app/components/editor/StationEditorClient';
import tilesData, { stateGroups, tiles as namedTiles } from '@/app/data/tiles';
import { Suspense } from 'react';

export default function EditorPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-neutral-300 p-4 text-black">Loading editor…</main>}>
      <StationEditorClient
        tiles={namedTiles || tilesData || {}}
        stateGroups={stateGroups || {}}
      />
    </Suspense>
  );
}
