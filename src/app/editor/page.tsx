import StationEditorClient from '@/app/components/editor/StationEditorClient';
import tilesData, { tiles as namedTiles, stateGroups } from '@/app/data/tiles';
import {LocalizedText} from '@/lib/i18n/client';
import { Suspense } from 'react';

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <main className="aero-tool min-h-screen bg-[var(--aero-panel-bg)] p-4 text-xs text-[var(--aero-text)]">
          {' '}
          <LocalizedText text="Načítavam editor…" />{' '}
        </main>
      }
    >
      <StationEditorClient tiles={namedTiles || tilesData || {}} stateGroups={stateGroups || {}} />
    </Suspense>
  );
}
