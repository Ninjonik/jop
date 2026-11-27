import type { ActiveTrainRoute, StationDocument } from './domain';

/** Validate the complete suffix before changing any persisted route fields. */
export function truncateReservedRoute(
  station: StationDocument,
  route: ActiveTrainRoute,
  pieceId: string,
  occupiedPieceIds: Set<string>,
) {
  const piece = station.layout.pieces[pieceId];
  if (piece?.type !== 'shuntButton' && piece?.type !== 'shuntButtonNoOcp') {
    throw new Error('Partial cancellation requires a white shunt button.');
  }
  const indices = route.path.flatMap((step, index) => (step.pieceId === pieceId ? [index] : []));
  const index = indices[0];
  if (
    indices.length !== 1 ||
    index <= 0 ||
    pieceId === route.sourcePieceId ||
    pieceId === route.targetPieceId
  ) {
    throw new Error('Select an unambiguous interior shunt button on the route.');
  }
  const suffix = route.path.slice(index);
  const pathIds = new Set(route.path.map((step) => step.pieceId));
  if (route.reservedOccupations.some((reservation) => !pathIds.has(reservation.pieceId))) {
    throw new Error('The route has an incompatible ordered path. Rebuild the route.');
  }
  const reservations = new Map(
    route.reservedOccupations.map((reservation) => [reservation.pieceId, reservation]),
  );
  for (const step of suffix) {
    const occupation = station.layout.pieces[step.pieceId]?.state.groups.occupation;
    if (
      occupiedPieceIds.has(step.pieceId) ||
      occupation?.variant === 'occupied' ||
      occupation?.state === 'occupied'
    ) {
      throw new Error('The route suffix is occupied and cannot be cancelled.');
    }
    if (
      step.occupationState !== null &&
      reservations.get(step.pieceId)?.state !== step.occupationState
    ) {
      throw new Error('The route suffix is no longer fully reserved.');
    }
  }
  // A white button that has already been released cannot act as a cancellation boundary.
  if (!reservations.has(pieceId)) throw new Error('The selected shunt button is not reserved.');
  const suffixIds = new Set(suffix.map((step) => step.pieceId));
  const prefix = route.path.slice(0, index);
  if (prefix.some((step) => suffixIds.has(step.pieceId)))
    throw new Error('The route path overlaps its cancelled suffix.');
  return {
    ...route,
    targetPieceId: pieceId,
    targetControl: 'shunt' as const,
    cancelledSuffixFromPieceId: pieceId,
    path: prefix,
    reservedOccupations: route.reservedOccupations.filter(
      (reservation) => !suffixIds.has(reservation.pieceId),
    ),
    signalPieceIds: route.signalPieceIds.filter((id) => !suffixIds.has(id)),
    targetPlatformDepartureSignalPieceId: null,
    passedSignalPieceIds: route.passedSignalPieceIds.filter((id) => !suffixIds.has(id)),
  };
}
