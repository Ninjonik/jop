'use client';

import TileSvg from '@/app/components/tiles/TileSvg';
import { stateGroups, tiles } from '@/app/data/tiles';
import type { StationDocument } from '@/lib/station/domain';
import { getRenderablePieces, isLineblockPieceType } from '@/lib/station/layout';

type LineblockEndpoint = { stationId: string; pieceId: string };

interface Props {
  station: StationDocument;
  pendingEndpoint: LineblockEndpoint | null;
  onLineblockSelect: (endpoint: LineblockEndpoint) => void;
  disabled?: boolean;
  overview?: boolean;
}

export default function StationTopologyBoard({
  station,
  pendingEndpoint,
  onLineblockSelect,
  disabled = false,
  overview = false,
}: Props) {
  const tileSize = overview
    ? Math.min(18, 460 / station.layout.width, 230 / station.layout.height)
    : Math.max(
        6,
        Math.min(
          18,
          Math.floor(460 / station.layout.width),
          Math.floor(230 / station.layout.height),
        ),
      );
  const renderablePieces = getRenderablePieces(station.layout);

  return (
    <div className="overflow-auto bg-neutral-500 p-3">
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
          const isLineblock = isLineblockPieceType(piece.type);
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
                  disabled={disabled}
                  aria-label={`Vybrať traťový súhlas ${pieceId} v stanici ${station.stationId}`}
                  title="Vyberte traťový súhlas a potom súhlas v susednej stanici"
                  onClick={() => onLineblockSelect({ stationId: station.stationId, pieceId })}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onLineblockSelect({ stationId: station.stationId, pieceId });
                  }}
                  className={`absolute inset-0 border-2 ${
                    isPending
                      ? 'border-amber-300 bg-amber-300/25'
                      : 'border-transparent hover:border-sky-300 focus:border-sky-300'
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
