'use client';

import TileSvg from '@/app/components/tiles/TileSvg';
import { stateGroups, tiles } from '@/app/data/tiles';
import { getRenderablePieces } from '@/lib/station/layout';
import type { StationDocument } from '@/lib/station/domain';

interface StationRuntimeBoardProps {
  station: StationDocument;
}

export default function StationRuntimeBoard({ station }: StationRuntimeBoardProps) {
  const renderablePieces = getRenderablePieces(station.layout);
  const tileSize = 75;
  const layout = station.layout;

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-auto rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div
          className="relative mx-auto bg-neutral-500"
          style={{
            width: layout.width * tileSize,
            height: layout.height * tileSize,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.2) 1px, transparent 1px)',
              backgroundSize: `${tileSize}px ${tileSize}px`,
            }}
          />

          {renderablePieces.map(({ pieceId, anchorX, anchorY }) => {
            const piece = layout.pieces[pieceId];
            const tile = tiles[piece.type];

            return (
              <div
                key={pieceId}
                className="pointer-events-none absolute"
                style={{
                  left: anchorX * tileSize,
                  top: anchorY * tileSize,
                  width: tile.space.x * tileSize,
                  height: tile.space.y * tileSize,
                }}
              >
                <TileSvg
                  tileKey={piece.type}
                  tile={tile}
                  stateGroups={stateGroups}
                  selections={piece.state.groups}
                  textValues={piece.state.texts}
                  orientation={{
                    rotation: piece.rotation,
                    mirrored: piece.mirrored,
                  }}
                  className="h-full w-full object-contain"
                />
              </div>
            );
          })}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">Pending Actions</h2>
          <div className="mt-4 space-y-3">
            {Object.values(station.runtime.pendingActions).length === 0 ? (
              <p className="text-sm text-neutral-500">No active actions.</p>
            ) : (
              Object.values(station.runtime.pendingActions).map((action) => (
                <div key={action.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3">
                  <div className="text-sm font-medium text-neutral-100">{action.type}</div>
                  <div className="text-xs text-neutral-500">{action.status}</div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">Runtime Controls</h2>
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 text-sm text-neutral-500">
            Direct frontend control actions are disabled for now. Pending actions remain visible here as the
            backend-owned control model evolves.
          </div>
        </section>
      </aside>
    </section>
  );
}
