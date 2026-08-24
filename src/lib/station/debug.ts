import type {
  PendingAction,
  RobloxPhysicalPieceState,
  StationActionLogDocument,
  StationDocument,
} from './domain';
import { getPieceAnchor } from './layout';

function getPieceLocation(station: StationDocument, pieceId: string) {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    return null;
  }

  const anchor = getPieceAnchor(station.layout, pieceId);
  return {
    piece,
    anchor,
  };
}

function getPieceLabel(station: StationDocument, pieceId: string) {
  const located = getPieceLocation(station, pieceId);
  if (!located) {
    return `${pieceId} (unknown) (${station.stationId})`;
  }

  return `${pieceId} (${located.anchor.x},${located.anchor.y}) (${station.stationId})`;
}

function formatSwitchTarget(position: string) {
  if (position === 'leftSet' || position === 'left') {
    return 'left';
  }
  if (position === 'rightSet' || position === 'right') {
    return 'right';
  }
  if (position === 'middleSet') {
    return 'neutral';
  }
  return position;
}

function formatSignalAspect(aspect: string | null | undefined) {
  return aspect ?? 'unchanged';
}

export function formatDebugBulletLines(lines: string[]) {
  return lines.map((line) => `- ${line}`).join('\n');
}

export function buildSwitchActionDebugLines(station: StationDocument, action: PendingAction) {
  const buttonPieceId = typeof action.payload.pieceId === 'string' ? action.payload.pieceId : null;
  const position = typeof action.payload.position === 'string' ? action.payload.position : null;
  if (!buttonPieceId || !position) {
    return [];
  }

  const resultSwitchPieceId =
    typeof action.result?.switchPieceId === 'string' ? action.result.switchPieceId : null;
  const resultControlSlot =
    typeof action.result?.controlSlot === 'string' ? action.result.controlSlot : null;
  const traversableState =
    typeof action.result?.traversableState === 'string' ? action.result.traversableState : null;

  const lines = [
    `Setting Switch Button ${getPieceLabel(station, buttonPieceId)} to ${formatSwitchTarget(position)}`,
  ];

  if (resultSwitchPieceId) {
    lines.push(
      `Setting Switch ${getPieceLabel(station, resultSwitchPieceId)}${
        resultControlSlot ? ` slot ${resultControlSlot}` : ''
      } to ${formatSwitchTarget(position)}${traversableState ? ` (${traversableState})` : ''}`,
    );
  }

  return lines;
}

export function buildRouteActionDebugLines(station: StationDocument, action: PendingAction) {
  const lines: string[] = [];
  const signalPieceIds = Array.isArray(action.payload.signalPieceIds)
    ? action.payload.signalPieceIds.filter((pieceId): pieceId is string => typeof pieceId === 'string')
    : [];
  const sourcePieceId =
    typeof action.payload.sourcePieceId === 'string' ? action.payload.sourcePieceId : null;
  const targetPieceId =
    typeof action.payload.targetPieceId === 'string' ? action.payload.targetPieceId : null;

  if (sourcePieceId && targetPieceId) {
    lines.push(
      `Route ${action.type} from ${getPieceLabel(station, sourcePieceId)} to ${getPieceLabel(station, targetPieceId)}`,
    );
  }

  signalPieceIds.forEach((pieceId) => {
    const piece = station.layout.pieces[pieceId];
    const signalState = piece?.state.groups.signal?.state ?? 'unknown';
    lines.push(
      `Setting Signal ${getPieceLabel(station, pieceId)} to board=${signalState}`,
    );
  });

  if (action.status === 'completed') {
    Object.entries(station.runtime.switchAlignments).forEach(([pieceId, alignment]) => {
      const slots = Object.entries(alignment.motorPositions)
        .map(([slot, position]) => `${slot}=${position}`)
        .join(', ');
      if (!slots) {
        return;
      }
      lines.push(
        `Setting Switch ${getPieceLabel(station, pieceId)} to ${alignment.traversableState} [${slots}]`,
      );
    });
  }

  return lines;
}

export function buildActionDebugLines(station: StationDocument, action: PendingAction) {
  if (action.type === 'switch:set-position') {
    return buildSwitchActionDebugLines(station, action);
  }
  if (action.type.startsWith('route:')) {
    return buildRouteActionDebugLines(station, action);
  }
  return [];
}

export function buildRobloxUpdateDebugLine(
  stationId: string,
  pieceId: string,
  piece: RobloxPhysicalPieceState,
) {
  if (piece.type.includes('Signal')) {
    return `Updating Signal ${pieceId} (${stationId}) to ${formatSignalAspect(piece.resolvedSignalAspect)} (${piece.resolvedSignalFamily ?? 'unknown'})`;
  }

  if (piece.switchAlignment) {
    const slots = Object.entries(piece.switchAlignment.motorPositions)
      .map(([slot, position]) => `${slot}=${position}`)
      .join(', ');
    return `Updating Switch ${pieceId} (${stationId}) to ${piece.switchAlignment.traversableState}${slots ? ` [${slots}]` : ''}`;
  }

  return `Updating Piece ${pieceId} (${stationId})`;
}

export function getActionLogDebugLines(action: StationActionLogDocument) {
  return Array.isArray(action.debugLines)
    ? action.debugLines.filter((line): line is string => typeof line === 'string')
    : [];
}
