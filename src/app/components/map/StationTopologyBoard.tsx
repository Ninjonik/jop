'use client';

import TileSvg from '@/app/components/tiles/TileSvg';
import { stateGroups, tiles } from '@/app/data/tiles';
import type { StationDocument } from '@/lib/station/domain';
import { getRenderablePieces } from '@/lib/station/layout';

type LineblockEndpoint = { stationId: string; pieceId: string };

interface Props {
  station: StationDocument;
  pendingEndpoint: LineblockEndpoint | null;
  onLineblockContextMenu: (endpoint: LineblockEndpoint) => void;
}

export default function StationTopologyBoard({
  station,
  pendingEndpoint,
  onLineblockContextMenu,
}: Props) {
  const tileSize = Math.max(
    6,
    Math.min(18, Math.floor(460 / station.layout.width), Math.floor(230 / station.layout.height)),
  );
  const renderablePieces = getRenderablePieces(station.layout);

  return (
    <div className="overflow-auto rounded-xl bg-neutral-500 p-2">
      <div
        className="relative shrink-0"
        style={{
          width: station.layout.width * tileSize,
          height: station.layout.height * tileSize,
          backgroundImage:
            'linear-gradient(to right, rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.2) 1px, transparent 1px)',
          backgroundSize: `${tileSize}px ${tileSize}px`,
        }}
      >
        {renderablePieces.map(({ pieceId, anchorX, anchorY }) => {
          const piece = station.layout.pieces[pieceId];
          const tile = tiles[piece.type];
          if (!tile) {
            return null;
          }
          const isLineblock = piece.type === 'lineblock';
          const isPending =
            pendingEndpoint?.stationId === station.stationId && pendingEndpoint.pieceId === pieceId;

          return (
            <div
              key={pieceId}
              className="absolute"
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
                orientation={{ rotation: piece.rotation, mirrored: piece.mirrored }}
                className="h-full w-full object-contain"
              />
              {isLineblock ? (
                <button
                  type="button"
                  aria-label={`Connect lineblock in ${station.stationId}`}
                  title="Right-click to select or connect this lineblock"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onLineblockContextMenu({ stationId: station.stationId, pieceId });
                  }}
                  className={`absolute inset-0 border-2 ${
                    isPending
                      ? 'border-amber-300 bg-amber-300/25'
                      : 'border-transparent hover:border-sky-300'
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
