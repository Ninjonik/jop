import type { UserProfile } from '@/lib/dis/appwrite-client';
import { canAssignShiftRole, shiftPlanSchema, type ShiftPlan } from '@/lib/dis/shift-plan';
import { z } from 'zod';
import { databaseId, disDatabase, DisError } from './appwrite';
import { loadDisPlaces } from './places';
import { loadTimetables } from './timetables';

export function readShiftPlan(value: unknown): ShiftPlan | null {
  if (!value) return null;
  try {
    return shiftPlanSchema.parse(JSON.parse(String(value)));
  } catch {
    throw new DisError(409, 'Uložený plán zmeny je poškodený.');
  }
}

async function editableShift(id: string) {
  const shift = await disDatabase().getDocument(databaseId, 'shifts', id);
  if (!['draft', 'open', 'active'].includes(String(shift.status)))
    throw new DisError(409, 'Ukončenú alebo zrušenú zmenu už nemožno plánovať.');
  return shift;
}

async function persistPlan(id: string, plan: ShiftPlan) {
  const planJson = JSON.stringify(plan);
  if (planJson.length > 100000)
    throw new DisError(400, 'Plán zmeny je príliš veľký. Vyberte menej vlakov.');
  await disDatabase().updateDocument(databaseId, 'shifts', id, { planJson });
  return { plan };
}

export async function configureShiftPlan(body: unknown) {
  const input = z
    .object({
      id: z.string().min(1).max(36),
      placeId: z.string().regex(/^[1-9]\d{0,31}$/),
      timetableIds: z.array(z.string().min(1).max(36)).min(1).max(100),
    })
    .parse(body);
  const shift = await editableShift(input.id);
  if (shift.status === 'active')
    throw new DisError(409, 'Grafikon možno zmeniť iba pred začiatkom zmeny.');
  const place = (await loadDisPlaces()).places.find((place) => place.placeId === input.placeId);
  if (!place?.hasTemplate) throw new DisError(404, 'Vyberte pripravenú sieť staníc.');
  const ids = new Set(input.timetableIds);
  const trains = (await loadTimetables(input.placeId)).filter((train) => ids.has(train.$id));
  if (trains.length !== ids.size)
    throw new DisError(400, 'Niektorý vlak už nie je dostupný v zvolenom grafikone.');
  const stationIds = new Set(trains.flatMap((train) => train.stops.map((stop) => stop.station)));
  const stations = place.stations.filter((station) => stationIds.has(station.stationId));
  if (stations.length !== stationIds.size)
    throw new DisError(409, 'Grafikon obsahuje stanice mimo pripravenej siete.');
  const previous = readShiftPlan(shift.planJson);
  return persistPlan(input.id, {
    placeId: place.placeId,
    placeName: place.name,
    stations,
    trains,
    assignments:
      previous?.placeId === place.placeId
        ? previous.assignments.filter((assignment) =>
            assignment.role === 'dispatcher'
              ? stationIds.has(assignment.targetId)
              : ids.has(assignment.targetId),
          )
        : [],
  });
}

export async function assignShiftStaff(body: unknown) {
  const input = z
    .object({
      id: z.string().min(1).max(36),
      role: z.enum(['dispatcher', 'driver']),
      targetId: z.string().min(1).max(128),
      userId: z.string().max(64),
    })
    .parse(body);
  const shift = await editableShift(input.id);
  const plan = readShiftPlan(shift.planJson);
  if (!plan) throw new DisError(409, 'Najprv vyberte grafikon zmeny.');
  const exists =
    input.role === 'dispatcher'
      ? plan.stations.some((station) => station.stationId === input.targetId)
      : plan.trains.some((train) => train.$id === input.targetId);
  if (!exists) throw new DisError(400, 'Stanica alebo vlak nepatrí do plánu zmeny.');
  const assignments = plan.assignments.filter(
    (assignment) => assignment.role !== input.role || assignment.targetId !== input.targetId,
  );
  if (input.userId) {
    const profile = (await disDatabase().getDocument(
      databaseId,
      'profiles',
      input.userId,
    )) as unknown as UserProfile;
    if (profile.userId !== input.userId || !canAssignShiftRole(profile, input.role))
      throw new DisError(403, 'Zamestnanec nemá oprávnenie na túto pracovnú rolu.');
    if (
      input.role === 'dispatcher' &&
      assignments.some(
        (assignment) => assignment.role === 'dispatcher' && assignment.userId === input.userId,
      )
    )
      throw new DisError(409, 'Výpravca už má v tejto zmene pridelenú inú stanicu.');
    assignments.push({
      role: input.role,
      targetId: input.targetId,
      userId: profile.userId,
      userName: profile.name,
    });
  }
  return persistPlan(input.id, { ...plan, assignments });
}
