'use client';

import { useState } from 'react';

import TileSvg from '@/app/components/tiles/TileSvg';
import { stateGroups, tiles } from '@/app/data/tiles';
import type { LineblockActionType, StationDocument } from '@/lib/station/domain';
import { getRenderablePieces } from '@/lib/station/layout';

interface StationRuntimeBoardProps {
  station: StationDocument;
  error: string | null;
  onErrorChange: (message: string | null) => void;
}

function getActionButtonSide(mirrored: boolean, side: 'left' | 'right') {
  if (!mirrored) {
    return side;
  }

  return side === 'left' ? 'right' : 'left';
}

export default function StationRuntimeBoard({
  station,
  error,
  onErrorChange,
}: StationRuntimeBoardProps) {
  const renderablePieces = getRenderablePieces(station.layout);
  const tileSize = 75;
  const layout = station.layout;
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  async function submitLineblockAction(pieceId: string, type: LineblockActionType) {
    try {
      setPendingActionKey(`${pieceId}:${type}`);
      onErrorChange(null);

      const response = await fetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/lineblock-action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            sessionId: station.sessionId,
            stationId: station.stationId,
            type,
            issuedAt: new Date().toISOString(),
            actor: {
              type: 'user',
              id: 'runtime-ui',
            },
            payload: {
              pieceId,
            },
          }),
        }
      );

      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to submit lineblock action.');
      }
    } catch (submitError) {
      onErrorChange(
        submitError instanceof Error ? submitError.message : 'Failed to submit lineblock action.'
      );
    } finally {
      setPendingActionKey(null);
    }
  }

  async function submitRouteInteract(pieceId: string, button: 'left' | 'right') {
    try {
      setPendingActionKey(`${pieceId}:route:${button}`);
      onErrorChange(null);

      const response = await fetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/route-interact`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            sessionId: station.sessionId,
            stationId: station.stationId,
            type: 'route:interact',
            issuedAt: new Date().toISOString(),
            actor: {
              type: 'user',
              id: 'runtime-ui',
            },
            payload: {
              pieceId,
              button,
            },
          }),
        }
      );

      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to submit route interaction.');
      }
    } catch (submitError) {
      onErrorChange(
        submitError instanceof Error ? submitError.message : 'Failed to submit route interaction.'
      );
    } finally {
      setPendingActionKey(null);
    }
  }

  return (
    <div
      className="relative flex flex-1 items-start justify-center overflow-auto bg-neutral-400"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="relative shrink-0 bg-neutral-500"
        style={{
          width: layout.width * tileSize,
          height: layout.height * tileSize,
          marginTop: 'auto',
          marginBottom: 'auto',
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
          const leftButtonSide = getActionButtonSide(piece.mirrored, 'left');
          const rightButtonSide = getActionButtonSide(piece.mirrored, 'right');
          const isPiecePending = pendingActionKey?.startsWith(`${pieceId}:`) ?? false;

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

              {piece.type === 'lineblock' ? (
                <>
                  <button
                    type="button"
                    aria-label={`Mark train arrived on ${pieceId}`}
                    disabled={isPiecePending}
                    onClick={() => void submitLineblockAction(pieceId, 'lineblock:mark-arrived')}
                    className="pointer-events-auto absolute bottom-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                    style={{
                      width: tileSize * 0.8,
                      height: tileSize * 0.5,
                      [leftButtonSide]: 0,
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Grant or revoke lineblock consent on ${pieceId}`}
                    disabled={isPiecePending}
                    onClick={() => void submitLineblockAction(pieceId, 'lineblock:grant-consent')}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void submitLineblockAction(pieceId, 'lineblock:revoke-consent');
                    }}
                    className="pointer-events-auto absolute bottom-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                    style={{
                      width: tileSize * 0.8,
                      height: tileSize * 0.5,
                      [rightButtonSide]: 0,
                    }}
                  />
                </>
              ) : null}

              {(piece.type === 'premainSignal' ||
                piece.type === 'departureButton' ||
                piece.type === 'shuntButton') ? (
                <button
                  type="button"
                  aria-label={`Interact with route endpoint ${pieceId}`}
                  disabled={isPiecePending}
                  onClick={() => void submitRouteInteract(pieceId, 'left')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void submitRouteInteract(pieceId, 'right');
                  }}
                  className="pointer-events-auto absolute inset-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="pointer-events-none absolute left-4 top-4 border border-red-700 bg-red-100 px-3 py-1 text-sm text-red-900">
          {error}
        </div>
      ) : null}
    </div>
  );
}
