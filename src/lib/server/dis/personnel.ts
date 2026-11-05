import type { UserProfile } from '@/lib/dis/appwrite-client';
import { clockMinutes, clockSchema, formatMinute } from '@/lib/dis/timetable';
import { ID, Query, type Models } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { databaseId, disDatabase, DisError, dispatchers, listDocuments } from './appwrite';

export async function loadStaff() {
  return {
    profiles: await listDocuments<Models.Document & UserProfile>('profiles', [
      Query.orderAsc('name'),
    ]),
  };
}
export async function assessStaff(body: unknown) {
  const { id, ...assessment } = z
    .object({
      id: z.string().min(1).max(36),
      trainingStage: z.enum(['cadet', 'theory', 'simulator', 'exam', 'certified']),
      strikes: z.number().int().min(0).max(10),
      notes: z.string().max(2000),
    })
    .parse(body);
  return { profile: await disDatabase().updateDocument(databaseId, 'profiles', id, assessment) };
}
export async function loadShifts(shiftId?: string) {
  if (shiftId)
    return { bookings: await listDocuments('shift_bookings', [Query.equal('shiftId', shiftId)]) };
  return { shifts: await listDocuments('shifts', [Query.orderDesc('date')]) };
}
export async function createShift(body: unknown) {
  const input = z
    .object({
      title: z.string().trim().min(1).max(128),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(
          (date) =>
            !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date,
          'Neplatný dátum.',
        ),
      startTime: clockSchema,
    })
    .parse(body);
  return {
    shift: await disDatabase().createDocument(databaseId, 'shifts', ID.unique(), {
      ...input,
      endTime: formatMinute(clockMinutes(input.startTime) + 150),
      durationHours: 2.5,
      status: 'open',
    }),
  };
}
export async function registerShift(body: unknown, profile: UserProfile) {
  const command = z
    .object({
      shiftId: z.string().min(1).max(36),
      assignedRole: z.enum(['dispatcher', 'driver']),
      assignedLocation: z.string().trim().min(1).max(64),
    })
    .parse(body);
  const allowedRoles =
    command.assignedRole === 'dispatcher'
      ? dispatchers
      : ['driver_manager', 'driver_instructor', 'driver', 'driver_trainee'];
  if (profile.role !== 'admin' && !allowedRoles.includes(profile.role))
    throw new DisError(403, 'Na túto pracovnú rolu nemáte oprávnenie.');
  const shift = await disDatabase().getDocument(databaseId, 'shifts', command.shiftId);
  if (shift.status !== 'open') throw new DisError(409, 'Prihlasovanie na zmenu je uzavreté.');
  const id = createHash('sha256')
    .update(JSON.stringify([command.shiftId, profile.userId]))
    .digest('hex')
    .slice(0, 36);
  return {
    booking: await disDatabase().createDocument(databaseId, 'shift_bookings', id, {
      ...command,
      userId: profile.userId,
      userName: profile.name,
      attendance: 'registered',
    }),
  };
}
export async function changeShiftStatus(body: unknown) {
  const command = z
    .object({ id: z.string().min(1).max(36), status: z.enum(['active', 'completed', 'cancelled']) })
    .parse(body);
  const shift = await disDatabase().getDocument(databaseId, 'shifts', command.id);
  const allowed: Record<string, string[]> = {
    draft: ['cancelled'],
    open: ['active', 'cancelled'],
    active: ['completed', 'cancelled'],
  };
  if (!allowed[String(shift.status)]?.includes(command.status))
    throw new DisError(409, 'Neplatná zmena stavu šichty.');
  return {
    shift: await disDatabase().updateDocument(databaseId, 'shifts', command.id, {
      status: command.status,
    }),
  };
}
export async function recordAttendance(body: unknown) {
  const { id, attendance } = z
    .object({
      id: z.string().min(1).max(36),
      attendance: z.enum(['registered', 'present', 'strike', 'excused']),
    })
    .parse(body);
  return {
    booking: await disDatabase().updateDocument(databaseId, 'shift_bookings', id, { attendance }),
  };
}
