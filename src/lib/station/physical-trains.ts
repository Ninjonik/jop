import { tiles } from '@/app/data/tiles';
import type { GsmRVehicle } from '@/lib/roblox/gsm-r';
import type { PhysicalOccupation, SessionDocument } from './domain';

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
/** Current station is knowable even when a stopped train spans several sections. */
export function physicalVehicleStation(session: SessionDocument, sensorId: string): string | null {
  const contacts = physicalVehicleContacts(session, sensorId);
  const front = frontmostContact(contacts);
  const stationIds = [...new Set(contacts.map((contact) => contact.stationId))];
  return front?.stationId ?? (stationIds.length === 1 ? stationIds[0] : null);
}
export function projectPhysicalTrainLabels(
  session: SessionDocument,
  vehicles: GsmRVehicle[],
  pieceTypes: Record<string, Record<string, string>>,
): Record<string, PhysicalTrainLabels> {
  const labels: Record<string, PhysicalTrainLabels> = {};
  for (const vehicle of vehicles) {
    if (!vehicle.binding) continue;
    const eligible = physicalVehicleContacts(session, vehicle.sensorId).filter((contact) =>
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
