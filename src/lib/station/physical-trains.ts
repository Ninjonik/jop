import { tiles } from '@/app/data/tiles';
import type { GsmRVehicle } from '@/lib/roblox/gsm-r';
import type { PhysicalOccupation, SessionDocument } from './domain';
import { isPublicStation } from './visibility';

export type PhysicalTrainLabel = { text: string };
export type PhysicalTrainLabels = Record<string, PhysicalTrainLabel>;
export type PhysicalVehicleContact = { sensorId: string; distanceToFront: number | null };

/** Only standard, single-cell occupation indicators support train text. */
export function supportsPhysicalTrainLabel(pieceType: string) {
  const tile = tiles[pieceType];
  return !!tile?.groups?.occupation && tile.space.x === 1 && tile.space.y === 1;
}
export function physicalVehicleContacts(session: SessionDocument, sensorId: string) {
  return Object.values(session.runtime?.physicalOccupations ?? {}).flatMap((occupation) => {
    if (!occupation.occupied) return [];
    const contact = occupation.vehicles?.find((vehicle) => vehicle.sensorId === sensorId);
    return contact ? [{ ...occupation, distanceToFront: contact.distanceToFront }] : [];
  });
}
export function frontmostContact<T extends PhysicalOccupation & { distanceToFront: number | null }>(
  contacts: T[],
): T | null {
  if (
    contacts.length &&
    contacts.every(
      (contact) =>
        contact.stationId === contacts[0].stationId && contact.pieceId === contacts[0].pieceId,
    )
  )
    return contacts[0];
  const ordered = contacts
    .filter((contact) => contact.distanceToFront !== null)
    .sort(
      (a, b) =>
        a.distanceToFront! - b.distanceToFront! ||
        a.stationId.localeCompare(b.stationId) ||
        a.pieceId.localeCompare(b.pieceId),
    );
  // A stationary legacy sensor without a measured travel direction is ambiguous.
  // Never infer train order from board X coordinates or unordered reservations.
  return ordered[0] ?? null;
}
/** Resolve overlapping public stations using measured travel, never internal inter. */
export function physicalVehicleStation(session: SessionDocument, sensorId: string): string | null {
  const contacts = physicalVehicleContacts(session, sensorId).filter((contact) =>
    isPublicStation(contact.stationId),
  );
  const stationIds = [...new Set(contacts.map((contact) => contact.stationId))];
  if (stationIds.length === 1) return stationIds[0];
  if (!stationIds.length) return null;
  // Each candidate station needs a measured contact; missing direction cannot
  // justify selecting another station just because its report arrived first.
  if (
    stationIds.some(
      (id) =>
        !contacts.some((contact) => contact.stationId === id && contact.distanceToFront !== null),
    )
  )
    return null;
  const front = frontmostContact(contacts);
  if (!front || front.distanceToFront === null) return null;
  const tiedStation = contacts.some(
    (contact) =>
      contact.stationId !== front.stationId &&
      contact.distanceToFront !== null &&
      Math.abs(contact.distanceToFront - front.distanceToFront!) <= 0.000001,
  );
  return tiedStation ? null : front.stationId;
}
export function physicalVehicleRadioZone(
  session: SessionDocument,
  sensorId: string,
  zones: ReadonlyMap<string, string>,
): string {
  const stationId = physicalVehicleStation(session, sensorId);
  if (stationId) return zones.get(stationId) ?? '--';
  const contacts = physicalVehicleContacts(session, sensorId);
  // 00 is the existing out-of-station display, not an inter dispatcher zone.
  return contacts.length && contacts.every((contact) => !isPublicStation(contact.stationId))
    ? '00'
    : '--';
}
export function projectPhysicalTrainLabels(
  session: SessionDocument,
  vehicles: GsmRVehicle[],
  pieceTypes: Record<string, Record<string, string>>,
): Record<string, PhysicalTrainLabels> {
  const labels: Record<string, PhysicalTrainLabels> = {};
  for (const vehicle of vehicles) {
    if (!vehicle.binding) continue;
    const eligible = physicalVehicleContacts(session, vehicle.sensorId).filter(
      (contact) =>
        isPublicStation(contact.stationId) &&
        supportsPhysicalTrainLabel(pieceTypes[contact.stationId]?.[contact.pieceId] ?? ''),
    );
    const front = frontmostContact(eligible);
    if (!front) continue;
    const stationLabels = (labels[front.stationId] ??= {});
    const text = `${vehicle.binding.trainType} ${vehicle.binding.trainNumber}`;
    const label = (stationLabels[front.pieceId] ??= { text: '' });
    const texts = label.text ? label.text.split(', ') : [];
    if (!texts.includes(text)) texts.push(text);
    label.text = texts.sort().join(', ');
  }
  return labels;
}
