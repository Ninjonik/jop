import { z } from 'zod';
import type { UserProfile } from './appwrite-client';
import { isDisAdministrator } from './permissions';
import type { Timetable } from './timetable';
import { timetableSchema } from './timetable';

export type ShiftAssignment = {
  role: 'dispatcher' | 'driver';
  targetId: string;
  userId: string;
  userName: string;
};
export type ShiftPlan = {
  placeId: string;
  placeName: string;
  stations: { stationId: string; name: string }[];
  trains: Timetable[];
  assignments: ShiftAssignment[];
};

export const shiftPlanSchema = z.object({
  placeId: z.string().min(1),
  placeName: z.string().min(1),
  stations: z.array(z.object({ stationId: z.string().min(1), name: z.string().min(1) })),
  trains: z
    .array(timetableSchema.extend({ $id: z.string().min(1), $updatedAt: z.string().optional() }))
    .min(1),
  assignments: z.array(
    z.object({
      role: z.enum(['dispatcher', 'driver']),
      targetId: z.string().min(1),
      userId: z.string().min(1),
      userName: z.string().min(1),
    }),
  ),
});

export function canAssignShiftRole(profile: UserProfile, role: ShiftAssignment['role']) {
  return (
    isDisAdministrator(profile.role) ||
    profile.role === role ||
    profile.role === `${role}_manager` ||
    profile.role === `${role}_instructor` ||
    profile.role === `${role}_trainee`
  );
}

export type PlannedShift = {
  $id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'draft' | 'open' | 'active' | 'completed' | 'cancelled';
  plan: ShiftPlan | null;
};
