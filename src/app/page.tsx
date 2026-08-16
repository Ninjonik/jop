import StationEditorClient from '@/app/components/editor/StationEditorClient';
import tilesData, { stateGroups, tiles as namedTiles } from '@/app/data/tiles';

export default function Home() {
  return (
    <StationEditorClient
      tiles={namedTiles || tilesData || {}}
      stateGroups={stateGroups || {}}
    />
  );
}
