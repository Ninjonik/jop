'use client';
import { apiFetch } from '@/lib/api-client';

import { StationReminders } from '@/app/components/dis/StationReminders';
import { getDisToken } from '@/lib/dis/api-client';
import { useBrowserSettings } from '@/lib/dis/browser-settings';
import { useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';

import { useEffect, useRef, useState } from 'react';

import TileSvg from '@/app/components/tiles/TileSvg';
import { boardColors } from '@/app/data/_tiles/shared-styles';
import { stateGroups, tiles } from '@/app/data/tiles';
import type { LineblockActionType, StationDocument, SwitchPosition } from '@/lib/station/domain';
import {
  getPieceAnchor,
  getRenderablePieces,
  isAhLineblockPieceType,
  isLineblockPieceType,
  parseCellRef,
} from '@/lib/station/layout';
import { getButtonVisualState } from '@/lib/station/route-button-state';
import { buildRouteFromSelection } from '@/lib/station/routes';
import {
  getConnectedSwitchControl,
  getDefaultSwitchMotorPositions,
  getTraversableStateForMotorPositions,
} from '@/lib/station/switches';

interface StationRuntimeBoardProps {
  station: StationDocument;
  onErrorChange: (message: string | null) => void;
  onLineblockSnapshots: (localStation: StationDocument, remoteStation: StationDocument) => void;
  onStationSnapshot: (station: StationDocument) => void;
}

function getLineblockActionOffset(tileWidth: number, mirrored: boolean, side: 'left' | 'right') {
  const unmirroredColumn = side === 'left' ? 0 : 2;
  return mirrored ? tileWidth - 1 - unmirroredColumn : unmirroredColumn;
}

function getOrientedSide(rotation: 0 | 180, mirrored: boolean, side: 'left' | 'right') {
  const horizontallyFlipped = mirrored !== (rotation === 180);
  return horizontallyFlipped ? (side === 'left' ? 'right' : 'left') : side;
}

function getDepartureSignalPieceIdForButton(
  station: StationDocument,
  departureButtonPieceId: string,
) {
  const anchor = getPieceAnchor(station.layout, departureButtonPieceId);

  for (const directionX of [-1, 1]) {
    const signalCell = {
      x: anchor.x + directionX,
      y: anchor.y,
    };
    if (
      signalCell.x < 0 ||
      signalCell.y < 0 ||
      signalCell.y >= station.layout.height ||
      signalCell.x >= station.layout.width
    ) {
      continue;
    }

    const ref = parseCellRef(station.layout.map[signalCell.y][signalCell.x]);
    const piece = station.layout.pieces[ref.pieceId];
    if (piece?.type === 'departureSignal' || piece?.type === 'departureSignalNoOcp') {
      return ref.pieceId;
    }
  }

  return null;
}

function getEntrySignalPieceIdForPremain(station: StationDocument, premainSignalPieceId: string) {
  const departureButtonPieceIds = Object.entries(station.layout.pieces)
    .filter(([, piece]) => piece.type === 'departureButton')
    .map(([pieceId]) => pieceId);

  for (const departureButtonPieceId of departureButtonPieceIds) {
    try {
      const route = buildRouteFromSelection(
        station,
        premainSignalPieceId,
        departureButtonPieceId,
        tiles,
        'normal',
        false,
      );
      const entrySignalPieceId = route.signalPieceIds.find((pieceId) => {
        const type = station.layout.pieces[pieceId]?.type;
        return type === 'entrySignal' || type === 'entrySignalNoOcp';
      });
      if (entrySignalPieceId) {
        return entrySignalPieceId;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export default function StationRuntimeBoard({
  station,
  onErrorChange,
  onLineblockSnapshots,
  onStationSnapshot,
}: StationRuntimeBoardProps) {
  const t = useTranslation();
  const renderablePieces = getRenderablePieces(station.layout);
  const layout = station.layout;
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const boardViewportRef = useRef<HTMLDivElement>(null);
  const { trainTooltips } = useBrowserSettings();
  const [fitWidth, setFitWidth] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [manualTileSize, setManualTileSize] = useState(75);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [optimisticSwitch, setOptimisticSwitch] = useState<Record<string, SwitchPosition>>({});
  const [optimisticRoutes, setOptimisticRoutes] = useState<
    Record<
      string,
      {
        commandId: string;
        state: string;
        confirmedRevision?: number;
      }
    >
  >({});
  const routeRequestInFlight = useRef<{
    id: string;
    sourcePieceId: string;
    control: 'normal' | 'shunt';
    targetSubmitted: boolean;
  } | null>(null);
  useEffect(() => {
    const pending = routeRequestInFlight.current;
    if (
      pending &&
      !pending.targetSubmitted &&
      station.runtime.routeSelection?.commandId === pending.id
    ) {
      routeRequestInFlight.current = null;
    }
  }, [station.runtime.routeSelection]);
  const partialCancelClick = useRef<{ pieceId: string; routeId: string; at: number } | null>(null);
  const [heldInspectionButtonId, setHeldInspectionButtonId] = useState<string | null>(null);
  const [hoveredTrainPieceId, setHoveredTrainPieceId] = useState<string | null>(null);
  const fittedTileSize = viewportWidth > 0 ? viewportWidth / layout.width : 75;
  const tileSize = fitWidth ? fittedTileSize : manualTileSize;

  useEffect(() => {
    const boardViewport = boardViewportRef.current;
    if (!boardViewport) {
      return;
    }

    const updateViewportWidth = () => setViewportWidth(boardViewport.clientWidth);
    updateViewportWidth();

    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(boardViewport);
    return () => observer.disconnect();
  }, []);

  function disableFitWidth() {
    setManualTileSize(fittedTileSize);
    setFitWidth(false);
  }

  function changeManualZoom(factor: number) {
    setManualTileSize(
      Math.max(8, Math.min(180, (fitWidth ? fittedTileSize : manualTileSize) * factor)),
    );
    setFitWidth(false);
  }

  function startAhBlockReset(pieceId: string) {
    void submitLineblockAction(pieceId, 'ah:reset-block-condition');
  }

  function cancelAhBlockReset(pieceId: string) {
    void submitLineblockAction(pieceId, 'ah:cancel-block-reset');
  }

  async function submitLineblockAction(pieceId: string, type: LineblockActionType) {
    try {
      setPendingActionKey(`${pieceId}:${type}`);
      onErrorChange(null);

      const response = await apiFetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/lineblock-action`,
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getDisToken().catch(() => '')}`,
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

      const payload = (await response.json()) as
        | { localStation: StationDocument; remoteStation: StationDocument; error?: never }
        | { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to submit lineblock action.');
      }

      if ('localStation' in payload && 'remoteStation' in payload) {
        // The command result is the authoritative persisted snapshot. Applying
        // it here avoids leaving either open station board stale while its
        // Socket.IO update is in flight.
        onLineblockSnapshots(payload.localStation, payload.remoteStation);
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
    emergencyCancel = false,
    partialCancelRouteId?: string,
  ) {
    const pending = routeRequestInFlight.current;
    if (pending?.targetSubmitted) {
      onErrorChange('Počkajte na potvrdenie predchádzajúceho povelu.');
      return;
    }
    const commandId = crypto.randomUUID();
    const piece = station.layout.pieces[pieceId];
    const canStart =
      control === 'normal'
        ? ['premainSignal', 'premainSignalNoOcp', 'departureButton'].includes(piece?.type)
        : [
            'departureButton',
            'shuntButton',
            'shuntButtonNoOcp',
            'shuntSignalButtonBuffer',
          ].includes(piece?.type);
    const startsSelection =
      !pending && button === 'left' && !station.runtime.routeSelection && canStart;
    if (startsSelection) {
      routeRequestInFlight.current = {
        id: commandId,
        sourcePieceId: pieceId,
        control,
        targetSubmitted: false,
      };
    } else if (pending) {
      pending.targetSubmitted = true;
    }
    const selection = station.runtime.routeSelection;
    const sourcePieceId = pending?.sourcePieceId ?? selection?.sourcePieceId;
    const routeType = pending?.control ?? selection?.routeType ?? control;
    // Own both previews with the second command so the first response cannot clear them.
    if (startsSelection || sourcePieceId) {
      setOptimisticRoutes((current) => {
        const next = { ...current };
        const endpoints = [
          {
            id: sourcePieceId ?? pieceId,
            control: pending?.control ?? selection?.sourceControl ?? control,
          },
          { id: pieceId, control },
        ];
        for (const endpoint of endpoints) {
          const endpointPiece = station.layout.pieces[endpoint.id];
          if (!endpointPiece?.state.groups.button) continue;
          next[endpoint.id] = {
            commandId,
            state: getButtonVisualState(endpointPiece.type, routeType, endpoint.control),
          };
        }
        return next;
      });
    }
    try {
      setPendingActionKey(`${pieceId}:route:${button}`);
      onErrorChange(null);

      const response = await apiFetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/route-interact`,
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getDisToken().catch(() => '')}`,
          },
          body: JSON.stringify({
            commandId,
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
              emergencyCancel,
              partialCancelRouteId,
              ...(pending ? { expectedSelectionId: pending.id } : {}),
            },
          }),
        },
      );

      const payload = (await response.json()) as {
        error?: { message?: string };
        station?: StationDocument | null;
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to submit route interaction.');
      }
      if (payload.station) {
        const confirmedRevision = payload.station.revision;
        setOptimisticRoutes((current) =>
          Object.fromEntries(
            Object.entries(current).map(([id, preview]) => [
              id,
              preview.commandId === commandId ? { ...preview, confirmedRevision } : preview,
            ]),
          ),
        );
        onStationSnapshot(payload.station);
      } else {
        setOptimisticRoutes((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([, preview]) => preview.commandId !== commandId),
          ),
        );
      }
    } catch (submitError) {
      setOptimisticRoutes((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, preview]) => preview.commandId !== commandId),
        ),
      );
      if (startsSelection && routeRequestInFlight.current?.id === commandId)
        routeRequestInFlight.current = null;
      onErrorChange(
        submitError instanceof Error ? submitError.message : 'Failed to submit route interaction.',
      );
    } finally {
      if (pending && routeRequestInFlight.current === pending) routeRequestInFlight.current = null;
      setPendingActionKey(null);
    }
  }

  async function submitSwitchPosition(pieceId: string, position: SwitchPosition) {
    setOptimisticSwitch((current) => ({ ...current, [pieceId]: position }));
    try {
      setPendingActionKey(`${pieceId}:switch`);
      onErrorChange(null);

      const response = await apiFetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/switch-set-position`,
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getDisToken().catch(() => '')}`,
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

      const payload = (await response.json()) as {
        error?: { message?: string };
        station?: StationDocument | null;
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to operate switch.');
      }
      if (payload.station) onStationSnapshot(payload.station);
    } catch (submitError) {
      onErrorChange(
        submitError instanceof Error ? submitError.message : 'Failed to operate switch.',
      );
    } finally {
      setPendingActionKey(null);
      setOptimisticSwitch((current) => {
        const next = { ...current };
        delete next[pieceId];
        return next;
      });
    }
  }

  async function submitPrivolavaciaInteract(pieceId: string, button: 'left' | 'middle' | 'right') {
    try {
      setPendingActionKey(`${pieceId}:pn:${button}`);
      onErrorChange(null);

      const response = await apiFetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/privolavacia-interact`,
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getDisToken().catch(() => '')}`,
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

      const payload = (await response.json()) as {
        error?: { message?: string };
        station?: StationDocument | null;
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to operate PN.');
      }
      if (payload.station) {
        onStationSnapshot(payload.station);
      }
    } catch (submitError) {
      onErrorChange(submitError instanceof Error ? submitError.message : 'Failed to operate PN.');
    } finally {
      setPendingActionKey(null);
    }
  }

  async function resetReservations() {
    if (
      !window.confirm(
        t('Reset all route reservations? Actual occupied sensors will remain occupied.'),
      )
    ) {
      return;
    }

    try {
      setPendingActionKey('station:reset-reservations');
      onErrorChange(null);
      const response = await apiFetch(
        `/api/stations/${station.sessionId}/${station.stationId}/commands/reset-reservations`,
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getDisToken().catch(() => '')}`,
          },
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            sessionId: station.sessionId,
            stationId: station.stationId,
            type: 'route:reset-reservations',
            issuedAt: new Date().toISOString(),
            actor: { type: 'user', id: 'runtime-ui' },
            payload: {},
          }),
        },
      );
      const payload = (await response.json()) as {
        error?: { message?: string };
        station?: StationDocument;
      };
      if (!response.ok || !payload.station) {
        throw new Error(payload.error?.message ?? 'Failed to reset route reservations.');
      }
      onStationSnapshot(payload.station);
    } catch (resetError) {
      onErrorChange(
        resetError instanceof Error ? resetError.message : 'Failed to reset route reservations.',
      );
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

  async function clearSelectedRoute() {
    const selection = station.runtime.routeSelection;
    if (!selection) {
      return;
    }

    await submitRouteInteract(
      selection.sourcePieceId,
      selection.mode === 'cancel' ? 'right' : 'left',
      selection.sourceControl,
    );
  }

  function hasActivePrivolavaciaSignal(signalPieceId: string | null) {
    return !!(signalPieceId && station.runtime.activePrivolavaciaSignals[signalPieceId]);
  }

  function handleRouteContextMenu(pieceId: string, control: 'normal' | 'shunt', clickedAt = 0) {
    const piece = station.layout.pieces[pieceId];
    if (piece?.type === 'shuntButton' || piece?.type === 'shuntButtonNoOcp') {
      const interiorRoutes = Object.values(station.runtime.activeTrainRoutes).filter(
        (route) =>
          route.sourcePieceId !== pieceId &&
          route.targetPieceId !== pieceId &&
          route.path.some((step) => step.pieceId === pieceId) &&
          route.reservedOccupations.some((reservation) => reservation.pieceId === pieceId),
      );
      if (interiorRoutes.length === 1) {
        const route = interiorRoutes[0];
        const previous = partialCancelClick.current;
        partialCancelClick.current = { pieceId, routeId: route.id, at: clickedAt };
        if (
          previous?.pieceId === pieceId &&
          previous.routeId === route.id &&
          clickedAt - previous.at <= 1000
        ) {
          partialCancelClick.current = null;
          if (
            window.confirm(
              t(
                'Núdzovo zrušiť cestu od tohto tlačidla po cieľ? Predchádzajúca časť zostane nezmenená.',
              ),
            )
          ) {
            void submitRouteInteract(pieceId, 'right', route.routeType, true, route.id);
          }
        }
        return;
      }
    }
    partialCancelClick.current = null;

    const pendingCancellation = Object.values(station.runtime.pendingActions).find(
      (action) =>
        action.type === (control === 'shunt' ? 'route:cancel-shunt' : 'route:cancel-normal') &&
        action.payload.sourcePieceId === pieceId &&
        action.payload.routeType === control,
    );
    if (pendingCancellation) {
      const confirmed = window.confirm(
        t('Cancel this route immediately? This bypasses the normal route-cancellation delay.'),
      );
      if (confirmed) {
        void submitRouteInteract(pieceId, 'right', control, true);
      }
      return;
    }

    void submitRouteInteract(pieceId, 'right', control);
  }

  function handlePremainContextMenu(pieceId: string) {
    // Finding the entry signal uses route search. Keep that work on the PN
    // interaction path instead of repeating it for every premain on every
    // server snapshot (including ordinary route-selection snapshots).
    if (Object.keys(station.runtime.activePrivolavaciaSignals).length === 0) {
      handleRouteContextMenu(pieceId, 'normal');
      return;
    }

    const entrySignalPieceId = getEntrySignalPieceIdForPremain(station, pieceId);
    if (hasActivePrivolavaciaSignal(entrySignalPieceId)) {
      void submitPrivolavaciaInteract(pieceId, 'right');
      return;
    }
    handleRouteContextMenu(pieceId, 'normal');
  }

  function isManualSwitchButtonState(state: string) {
    return (
      state === 'leftSet' ||
      state === 'rightSet' ||
      state === 'leftSetting' ||
      state === 'rightSetting'
    );
  }

  function getHeldInspectionSelections(pieceId: string) {
    if (!heldInspectionButtonId) {
      return null;
    }

    const heldPiece = layout.pieces[heldInspectionButtonId];
    if (heldPiece?.type !== 'signButton') {
      return null;
    }

    const heldButtonText = heldPiece.state.texts.text;
    const piece = layout.pieces[pieceId];
    if (!piece) {
      return null;
    }

    if (heldButtonText === 'kont. KÚ') {
      if (!piece.state.groups.occupation || piece.state.groups.occupation.state !== 'default') {
        return null;
      }

      const alignment = station.runtime.switchAlignments[pieceId];

      return {
        ...piece.state.groups,
        occupation: {
          state: alignment?.traversableState ?? 'reserved',
          variant: 'reserved',
        },
      };
    }

    if (heldButtonText !== 'kont. pol. výh.') {
      return null;
    }

    if (piece.type === 'switchButton') {
      const currentState = piece.state.groups.switch?.state ?? 'default';
      if (isManualSwitchButtonState(currentState)) {
        return null;
      }

      const control = getConnectedSwitchControl(layout, pieceId);
      const switchPiece = control ? layout.pieces[control.switchPieceId] : null;
      if (!control || !switchPiece) {
        return null;
      }

      const alignment = station.runtime.switchAlignments[control.switchPieceId];
      const motorPositions = {
        ...getDefaultSwitchMotorPositions(switchPiece.type),
        ...(alignment?.motorPositions ?? {}),
      };
      const motorPosition = motorPositions[control.slot];
      if (motorPosition !== 'left' && motorPosition !== 'right') {
        return null;
      }

      return {
        ...piece.state.groups,
        switch: {
          state: motorPosition,
          variant: 'normal',
        },
      };
    }

    if (!piece.state.groups.occupation) {
      return null;
    }

    const alignment = station.runtime.switchAlignments[pieceId];
    if (
      piece.state.groups.occupation.state !== 'default' ||
      piece.state.groups.occupation.variant === 'occupied'
    ) {
      return null;
    }

    const overlayState =
      alignment?.traversableState ??
      getTraversableStateForMotorPositions(piece.type, getDefaultSwitchMotorPositions(piece.type));
    if (!overlayState) {
      return null;
    }

    return {
      ...piece.state.groups,
      occupation: {
        state: overlayState,
        variant: 'reserved',
      },
    };
  }

  return (
    <div
      ref={boardViewportRef}
      className={`relative flex flex-1 items-start overflow-auto bg-neutral-400 ${fitWidth ? 'justify-center' : 'justify-start'}`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pan.current = {
          x: event.clientX,
          y: event.clientY,
          left: event.currentTarget.scrollLeft,
          top: event.currentTarget.scrollTop,
        };
      }}
      onPointerMove={(event) => {
        if (!pan.current) return;
        event.currentTarget.scrollLeft = pan.current.left - event.clientX + pan.current.x;
        event.currentTarget.scrollTop = pan.current.top - event.clientY + pan.current.y;
      }}
      onPointerUp={(event) => {
        if (pan.current) {
          pan.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        pan.current = null;
      }}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
    >
      <div className="pointer-events-auto absolute top-2 left-2 z-10 flex max-w-[calc(100%_-_1rem)] flex-wrap gap-1 rounded border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] text-[var(--aero-text)] p-1 shadow">
        <button
          type="button"
          aria-pressed={fitWidth}
          onClick={() => (fitWidth ? disableFitWidth() : setFitWidth(true))}
          className="aero-btn"
        >
          <AeroIcon name="zoomReset" /> {t('Fit width')}{' '}
        </button>
        <button
          type="button"
          aria-label={t('Zoom out')}
          onClick={() => changeManualZoom(1 / 1.2)}
          className="aero-btn size-7"
        >
          <AeroIcon name="zoomOut" />
        </button>
        <button
          type="button"
          aria-label={t('Zoom in')}
          onClick={() => changeManualZoom(1.2)}
          className="aero-btn size-7"
        >
          <AeroIcon name="zoomIn" />
        </button>
        <button
          type="button"
          disabled={pendingActionKey === 'station:reset-reservations'}
          onClick={() => void resetReservations()}
          className="aero-btn disabled:cursor-wait"
        >
          {t('Reset reservations')}
        </button>
      </div>
      <div
        className="relative shrink-0"
        style={{
          // Fractional SVG edges must blend into the tile background, not a debug grid.
          backgroundColor: boardColors['--bg-color'],
          width: layout.width * tileSize,
          height: layout.height * tileSize,
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        {renderablePieces.map(({ pieceId, anchorX, anchorY }) => {
          const piece = layout.pieces[pieceId];
          const tile = tiles[piece.type];
          const leftLineblockActionOffset = getLineblockActionOffset(
            tile.space.x,
            piece.mirrored,
            'left',
          );
          const rightLineblockActionOffset = getLineblockActionOffset(
            tile.space.x,
            piece.mirrored,
            'right',
          );
          const normalControlSide = getOrientedSide(piece.rotation, piece.mirrored, 'left');
          const shuntControlSide = getOrientedSide(piece.rotation, piece.mirrored, 'right');
          const bufferControlSide = getOrientedSide(piece.rotation, piece.mirrored, 'left');
          const departureSignalPieceId =
            piece.type === 'departureButton'
              ? getDepartureSignalPieceIdForButton(station, pieceId)
              : null;
          const hasServerPendingAction = Object.values(station.runtime.pendingActions).some(
            (action) => action.payload.pieceId === pieceId,
          );
          const isPiecePending =
            (pendingActionKey?.startsWith(`${pieceId}:`) ?? false) || hasServerPendingAction;
          const routePreview = optimisticRoutes[pieceId];
          const previewObserved =
            routePreview &&
            (station.runtime.routeSelection?.commandId === routePreview.commandId ||
              !!station.runtime.pendingActions[routePreview.commandId] ||
              !!station.runtime.activeTrainRoutes[routePreview.commandId]);
          const showRoutePreview =
            routePreview &&
            !previewObserved &&
            (routePreview.confirmedRevision === undefined ||
              station.revision < routePreview.confirmedRevision);
          const trainLabel = trainTooltips
            ? station.runtime.physicalTrainLabels?.[pieceId]?.text
            : undefined;

          return (
            <div
              key={pieceId}
              className="pointer-events-none absolute"
              onPointerEnter={() => {
                if (trainLabel) setHoveredTrainPieceId(pieceId);
              }}
              onPointerLeave={() => {
                setHoveredTrainPieceId((current) => (current === pieceId ? null : current));
              }}
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
                selections={
                  getHeldInspectionSelections(pieceId) ??
                  (showRoutePreview
                    ? {
                        ...piece.state.groups,
                        button: { state: routePreview.state, variant: 'blinking' },
                      }
                    : optimisticSwitch[pieceId]
                      ? {
                          ...piece.state.groups,
                          switch: {
                            state:
                              optimisticSwitch[pieceId] === 'middleSet'
                                ? 'middleSet'
                                : optimisticSwitch[pieceId] === 'leftSet'
                                  ? 'leftSetting'
                                  : 'rightSetting',
                            variant: 'normal',
                          },
                        }
                      : piece.state.groups)
                }
                textValues={piece.state.texts}
                orientation={{
                  rotation: piece.rotation,
                  mirrored: piece.mirrored,
                }}
                className="pointer-events-auto h-full w-full object-contain"
              />

              {hoveredTrainPieceId === pieceId && trainLabel ? (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 max-w-[calc(100%+4rem)] -translate-x-1/2 whitespace-nowrap rounded border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] px-2 py-1 text-xs font-semibold text-[var(--aero-text)] shadow"
                >
                  {trainLabel}
                </div>
              ) : null}

              {isLineblockPieceType(piece.type) ? (
                <>
                  {!isAhLineblockPieceType(piece.type) ? (
                    <button
                      type="button"
                      aria-label={t('Mark train arrived on {0}', pieceId)}
                      disabled={isPiecePending}
                      onClick={() => void submitLineblockAction(pieceId, 'lineblock:mark-arrived')}
                      className="pointer-events-auto absolute bottom-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                      style={{
                        width: tileSize * 0.8,
                        height: tileSize * 0.5,
                        left: leftLineblockActionOffset * tileSize,
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label={t('Request or accept AH consent on {0}', pieceId)}
                      disabled={isPiecePending}
                      onClick={() => void submitLineblockAction(pieceId, 'ah:request-consent')}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void submitLineblockAction(pieceId, 'ah:cancel-consent');
                      }}
                      onMouseDown={(event) => {
                        if (event.button === 1) {
                          event.preventDefault();
                          startAhBlockReset(pieceId);
                        }
                      }}
                      onMouseUp={() => cancelAhBlockReset(pieceId)}
                      onMouseLeave={() => cancelAhBlockReset(pieceId)}
                      className="pointer-events-auto absolute bottom-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                      style={{
                        width: tileSize * 0.8,
                        height: tileSize * 0.5,
                        left: leftLineblockActionOffset * tileSize,
                      }}
                    />
                  )}
                  {!isAhLineblockPieceType(piece.type) ? (
                    <button
                      type="button"
                      aria-label={t('Grant or revoke lineblock consent on {0}', pieceId)}
                      disabled={isPiecePending}
                      onClick={() => void submitLineblockAction(pieceId, 'lineblock:grant-consent')}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void submitLineblockAction(pieceId, 'lineblock:revoke-consent');
                      }}
                      className="pointer-events-auto absolute bottom-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                      style={{
                        width: tileSize * 0.8,
                        height: tileSize * 0.5,
                        left: rightLineblockActionOffset * tileSize,
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              {piece.type === 'switchButton' ? (
                <button
                  type="button"
                  aria-label={t('Operate switch button {0}', pieceId)}
                  disabled={isPiecePending}
                  onClick={() => operateSwitchButton(pieceId, 'left')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    operateSwitchButton(pieceId, 'right');
                  }}
                  className="pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'signButtonSealedCounter' ? (
                <button
                  type="button"
                  aria-label={t('Operate PN counter {0}', pieceId)}
                  disabled={isPiecePending}
                  onPointerDown={(event) => {
                    // The board uses the middle pointer button for panning. Handle
                    // this control at pointer level so the counter owns that click
                    // before the board can capture it. A primary click is accepted
                    // as well; selecting a sealed PN counter has no left/right
                    // distinction.
                    if (event.button !== 0 && event.button !== 1) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    void submitPrivolavaciaInteract(pieceId, 'middle');
                  }}
                  className="pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'signButton' && piece.state.texts.text === 'kont. pol. výh.' ? (
                <button
                  type="button"
                  aria-label={t('Hold switch inspection button {0}', pieceId)}
                  disabled={isPiecePending}
                  onMouseDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    setHeldInspectionButtonId(pieceId);
                  }}
                  onMouseUp={() => {
                    setHeldInspectionButtonId((current) => (current === pieceId ? null : current));
                  }}
                  onMouseLeave={() => {
                    setHeldInspectionButtonId((current) => (current === pieceId ? null : current));
                  }}
                  className="pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'signButton' && piece.state.texts.text === 'kont. KÚ' ? (
                <button
                  type="button"
                  aria-label={t('Hold occupation inspection button {0}', pieceId)}
                  disabled={isPiecePending}
                  onMouseDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    setHeldInspectionButtonId(pieceId);
                  }}
                  onMouseUp={() => {
                    setHeldInspectionButtonId((current) => (current === pieceId ? null : current));
                  }}
                  onMouseLeave={() => {
                    setHeldInspectionButtonId((current) => (current === pieceId ? null : current));
                  }}
                  className="pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'signButton' && piece.state.texts.text === 'ruš. voľ. VC' ? (
                <button
                  type="button"
                  aria-label={t('Clear selected route with {0}', pieceId)}
                  disabled={isPiecePending || !station.runtime.routeSelection}
                  onClick={() => void clearSelectedRoute()}
                  className={`pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border border-transparent bg-transparent ${isPiecePending ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'}`}
                />
              ) : null}

              {piece.type === 'premainSignal' || piece.type === 'premainSignalNoOcp' ? (
                <button
                  type="button"
                  aria-label={t('Interact with normal route endpoint {0}', pieceId)}
                  disabled={isPiecePending}
                  onClick={() => void submitRouteInteract(pieceId, 'left', 'normal')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    handlePremainContextMenu(pieceId);
                  }}
                  className="pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'departureButton' ? (
                <>
                  <button
                    type="button"
                    aria-label={t('Interact with normal route endpoint {0}', pieceId)}
                    disabled={isPiecePending}
                    onClick={() => {
                      if (station.runtime.privolavaciaSelection && departureSignalPieceId) {
                        void submitPrivolavaciaInteract(pieceId, 'left');
                        return;
                      }
                      void submitRouteInteract(pieceId, 'left', 'normal');
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (hasActivePrivolavaciaSignal(departureSignalPieceId)) {
                        void submitPrivolavaciaInteract(pieceId, 'right');
                        return;
                      }
                      handleRouteContextMenu(pieceId, 'normal');
                    }}
                    className="pointer-events-auto absolute inset-y-0 w-1/2 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                    style={{ [normalControlSide]: 0 }}
                  />
                  <button
                    type="button"
                    aria-label={t('Interact with shunting route endpoint {0}', pieceId)}
                    disabled={isPiecePending}
                    onClick={() => void submitRouteInteract(pieceId, 'left', 'shunt')}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      handleRouteContextMenu(pieceId, 'shunt');
                    }}
                    className="pointer-events-auto absolute inset-y-0 w-1/2 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                    style={{ [shuntControlSide]: 0 }}
                  />
                </>
              ) : null}

              {piece.type === 'shuntButton' || piece.type === 'shuntButtonNoOcp' ? (
                <button
                  type="button"
                  aria-label={t('Interact with route endpoint {0}', pieceId)}
                  disabled={isPiecePending}
                  onClick={() =>
                    void submitRouteInteract(
                      pieceId,
                      'left',
                      (station.runtime.routeSelection?.routeType ??
                        routeRequestInFlight.current?.control) === 'normal'
                        ? 'normal'
                        : 'shunt',
                    )
                  }
                  onContextMenu={(event) => {
                    event.preventDefault();
                    handleRouteContextMenu(
                      pieceId,
                      (station.runtime.routeSelection?.routeType ??
                        routeRequestInFlight.current?.control) === 'normal'
                        ? 'normal'
                        : 'shunt',
                      event.timeStamp,
                    );
                  }}
                  className="pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                />
              ) : null}

              {piece.type === 'shuntSignalButtonBuffer' ? (
                <button
                  type="button"
                  aria-label={t('Interact with buffer shunting route endpoint {0}', pieceId)}
                  disabled={isPiecePending}
                  onClick={() => void submitRouteInteract(pieceId, 'left', 'shunt')}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    handleRouteContextMenu(pieceId, 'shunt');
                  }}
                  className="pointer-events-auto absolute inset-y-0 w-1/2 cursor-pointer rounded-sm border border-transparent bg-transparent disabled:cursor-wait"
                  style={{ [bufferControlSide]: 0 }}
                />
              ) : null}
            </div>
          );
        })}
        <StationReminders
          sessionId={station.sessionId}
          stationId={station.stationId}
          width={layout.width}
          height={layout.height}
          tileSize={tileSize}
        />
      </div>
    </div>
  );
}
