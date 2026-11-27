import type { RuntimeRouteType } from './domain';

/** Shared by server snapshots and provisional endpoint feedback. */
export function getButtonVisualState(
  pieceType: string,
  routeType: RuntimeRouteType,
  explicitControl: 'normal' | 'shunt' | null,
) {
  if (pieceType === 'departureButton') {
    return (explicitControl ?? routeType) === 'shunt' ? 'shunt' : 'departure';
  }
  if (pieceType === 'shuntButton' || pieceType === 'shuntButtonNoOcp') return 'shunt';
  return routeType === 'shunt' ? 'shunt' : 'departure';
}
