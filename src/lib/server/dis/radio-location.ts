import { physicalVehicleStation } from '@/lib/station/physical-trains';
import { isPublicStation } from '@/lib/station/visibility';
import { gsmRRepository } from '../repositories/gsm-r-repository';
import { sessionRepository } from '../repositories/session-repository';
import { isRobloxSessionLive } from '../services/station-service';

export async function driverRadioStation(sessionId: string, userId: string) {
  const [session, vehicles] = await Promise.all([
    sessionRepository.findById(sessionId),
    gsmRRepository.list(sessionId),
  ]);
  if (!session || session.status !== 'active' || !isRobloxSessionLive(session)) return null;
  const vehicle = vehicles.find((vehicle) => vehicle.binding?.userId === userId);
  const stationId = vehicle && physicalVehicleStation(session, vehicle.sensorId);
  return stationId && isPublicStation(stationId) ? stationId : null;
}
