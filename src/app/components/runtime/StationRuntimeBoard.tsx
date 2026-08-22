'use client';

import { useState } from 'react';

import TileSvg from '@/app/components/tiles/TileSvg';
import { stateGroups, tiles } from '@/app/data/tiles';
import type { LineblockActionType, StationDocument, SwitchPosition } from '@/lib/station/domain';
import { getRenderablePieces } from '@/lib/station/layout';

interface StationRuntimeBoardProps {
  station: StationDocument;
  onErrorChange: (message: string | null) => void;
}

function getActionButtonSide(mirrored: boolean, side: 'left' | 'right') {
  if (!mirrored) {
    return side;
  }

  return side === 'left' ? 'right' : 'left';
}

function getOrientedSide(rotation: 0 | 180, mirrored: boolean, side: 'left' | 'right') {
  const horizontallyFlipped = mirrored !== (rotation === 180);
  return horizontallyFlipped ? (side === 'left' ? 'right' : 'left') : side;
}

export default function StationRuntimeBoard({ station, onErrorChange }: StationRuntimeBoardProps) {
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
        },
      );

      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to submit lineblock action.');
      }
    } catch (submitError) {
      onErrorChange(
        submitError instanceof Error ? submitError.message : 'Failed to submit lineblock action.',
      );
    } finally {
      setPendingActionKey(null);
    }
  }

  async function submitRouteInteract(
    pieceId: string,
    button: 'left' | 'right',
    control: 'normal' | 'shunt',
  ) {
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
              control,
            },
          }),
        },
      );

      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to submit route interaction.');
      }
    } catch (submitError) {
      onErrorChange(
        submitError instanceof Error ? submitError.message : 'Failed to submit route interaction.',
      );
    } finally {
      setPendingActionKey(null);
    }
  }

  async function submitSwitchPosition(pieceId: string, position: SwitchPosition) {
    try {
      setPendingActionKey(`${pieceId}:switch`);
      onErrorChange(null);

      const response = await fetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/switch-set-position`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            sessionId: station.sessionId,
            stationId: station.stationId,
            type: 'switch:set-position',
            issuedAt: new Date().toISOString(),
            actor: {
              type: 'user',
              id: 'runtime-ui',
            },
            payload: {
              pieceId,
              position,
            },
          }),
        },
      );

      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to operate switch.');
      }
    } catch (submitError) {
      onErrorChange(
        submitError instanceof Error ? submitError.message : 'Failed to operate switch.',
      );
    } finally {
      setPendingActionKey(null);
    }
  }

  async function submitPrivolavaciaInteract(pieceId: string, button: 'middle' | 'right') {
    try {
      setPendingActionKey(`${pieceId}:pn:${button}`);
      onErrorChange(null);

      const response = await fetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/privolavacia-interact`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            sessionId: station.sessionId,
            stationId: station.stationId,
            type: 'privolavacia:interact',
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
        },
      );

      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to operate PN.');
      }
    } catch (submitError) {
      onErrorChange(submitError instanceof Error ? submitError.message : 'Failed to operate PN.');
    } finally {
      setPendingActionKey(null);
    }
  }

  function operateSwitchButton(pieceId: string, click: 'left' | 'right') {
    const state = layout.pieces[pieceId]?.state.groups.switch?.state ?? 'default';
    const neutral = state === 'default' || state === 'middleSet';
    if (neutral) {
      void submitSwitchPosition(pieceId, click === 'left' ? 'leftSet' : 'rightSet');
      return;
    }

    if ((state === 'leftSet' && click === 'right') || (state === 'rightSet' && click === 'left')) {
      void submitSwitchPosition(pieceId, 'middleSet');
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
          const normalControlSide = getOrientedSide(piece.rotation, piece.mirrored, 'left');
          const shuntControlSide = getOrientedSide(piece.rotation, piece.mirrored, 'right');
          const bufferControlSide = getOrientedSide(piece.rotation, piece.mirrored, 'left');
          const hasServerPendingAction = Object.values(station.runtime.pendingActions).some(
            (action) => action.payload.pieceId === pieceId,
          );
          const isPiecePending =
            (pendingActionKey?.startsWith(`${pieceId}:`) ?? false) || hasServerPendingAction;

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

              {piece.type === 'switchButton' ? (
                <button
                  type="button"
                  aria-label={`Operate switch button ${pieceId}`}
                  disabled={isPiecePending}
                  onClick={() => operateSwitchButton(pieceId, 'left')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    operateSwitchButton(pieceId, 'right');
                  }}
                  className="pointer-events-auto absolute inset-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'signButtonSealedCounter' ? (
                <button
                  type="button"
                  aria-label={`Operate PN counter ${pieceId}`}
                  disabled={isPiecePending}
                  onMouseDown={(event) => {
                    if (event.button !== 1) {
                      return;
                    }
                    event.preventDefault();
                    void submitPrivolavaciaInteract(pieceId, 'middle');
                  }}
                  className="pointer-events-auto absolute inset-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'premainSignal' || piece.type === 'premainSignalNoOcp' ? (
                <button
                  type="button"
                  aria-label={`Interact with normal route endpoint ${pieceId}`}
                  disabled={isPiecePending}
                  onClick={() => void submitRouteInteract(pieceId, 'left', 'normal')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void submitRouteInteract(pieceId, 'right', 'normal');
                  }}
                  className="pointer-events-auto absolute inset-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'departureButton' ? (
                <>
                  <button
                    type="button"
                    aria-label={`Interact with normal route endpoint ${pieceId}`}
                    disabled={isPiecePending}
                    onClick={() => void submitRouteInteract(pieceId, 'left', 'normal')}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void submitRouteInteract(pieceId, 'right', 'normal');
                    }}
                    className="pointer-events-auto absolute inset-y-0 w-1/2 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                    style={{ [normalControlSide]: 0 }}
                  />
                  <button
                    type="button"
                    aria-label={`Interact with shunting route endpoint ${pieceId}`}
                    disabled={isPiecePending}
                    onClick={() => void submitRouteInteract(pieceId, 'left', 'shunt')}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void submitRouteInteract(pieceId, 'right', 'shunt');
                    }}
                    className="pointer-events-auto absolute inset-y-0 w-1/2 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                    style={{ [shuntControlSide]: 0 }}
                  />
                </>
              ) : null}

              {piece.type === 'entrySignal' ||
              piece.type === 'entrySignalNoOcp' ||
              piece.type === 'departureSignal' ||
              piece.type === 'departureSignalNoOcp' ? (
                <button
                  type="button"
                  aria-label={`Operate PN signal ${pieceId}`}
                  disabled={isPiecePending}
                  onMouseDown={(event) => {
                    if (event.button !== 1) {
                      return;
                    }
                    event.preventDefault();
                    void submitPrivolavaciaInteract(pieceId, 'middle');
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void submitPrivolavaciaInteract(pieceId, 'right');
                  }}
                  className="pointer-events-auto absolute inset-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'shuntButton' || piece.type === 'shuntButtonNoOcp' ? (
                <button
                  type="button"
                  aria-label={`Interact with shunting route endpoint ${pieceId}`}
                  disabled={isPiecePending}
                  onClick={() => void submitRouteInteract(pieceId, 'left', 'shunt')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void submitRouteInteract(pieceId, 'right', 'shunt');
                  }}
                  className="pointer-events-auto absolute inset-0 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'shuntSignalButtonBuffer' ? (
                <button
                  type="button"
                  aria-label={`Interact with buffer shunting route endpoint ${pieceId}`}
                  disabled={isPiecePending}
                  onClick={() => void submitRouteInteract(pieceId, 'left', 'shunt')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void submitRouteInteract(pieceId, 'right', 'shunt');
                  }}
                  className="pointer-events-auto absolute inset-y-0 w-1/2 rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                  style={{ [bufferControlSide]: 0 }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
