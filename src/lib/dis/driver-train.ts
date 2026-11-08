import { sessionIdSchema } from '@/lib/station/domain';
import { z } from 'zod';
import type { Timetable } from './timetable';
import { trainCategorySchema } from './train-categories';

export const driverTrainInputSchema = z.object({
  sessionId: sessionIdSchema,
  trainNumber: z.string().trim().min(1).max(32),
  trainType: trainCategorySchema,
  timetableId: z.string().max(36).nullable(),
  endStation: z.string().trim().max(128),
  length: z.number().int().min(1).max(10000).nullable(),
  tonnage: z.number().min(0).max(100000).nullable(),
  wagons: z.number().int().min(0).max(1000).nullable(),
});
export type DriverTrainInput = z.infer<typeof driverTrainInputSchema>;
export type DriverTrain = DriverTrainInput & {
  _id: string;
  userId: string;
  userName: string;
  updatedAt: string;
};
export type DriverDashboard = {
  train: DriverTrain | null;
  timetables: Timetable[];
  drivers: DriverTrain[];
  stations: { stationId: string; name: string }[];
};
