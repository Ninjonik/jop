import StationLinkerClient from '@/app/components/linker/StationLinkerClient';
import tilesData, { stateGroups, tiles as namedTiles } from '@/app/data/tiles';

export default function LinkerPage() {
  return (
    <StationLinkerClient
      tiles={namedTiles || tilesData || {}}
      stateGroups={stateGroups || {}}
    />
  );
}
