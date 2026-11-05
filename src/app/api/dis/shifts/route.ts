import { managers, requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import {
  changeShiftStatus,
  createShift,
  loadShifts,
  recordAttendance,
  registerShift,
} from '@/lib/server/dis/personnel';
import { z } from 'zod';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    const shiftId = new URL(request.url).searchParams.get('shiftId');
    return loadShifts(shiftId ? z.string().min(1).max(36).parse(shiftId) : undefined);
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    const body = await request.json();
    const { command } = z
      .object({ command: z.enum(['create', 'register', 'status', 'attendance']) })
      .parse(body);
    const profile = await requireDisProfile(request, command === 'register' ? undefined : managers);
    if (command === 'create') return createShift(body);
    if (command === 'register') return registerShift(body, profile);
    if (command === 'status') return changeShiftStatus(body);
    return recordAttendance(body);
  });
}
