import { switchSetPositionCommandSchema } from '@/lib/station/domain';
import { parseJsonRequest, jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const command = await parseJsonRequest(request, switchSetPositionCommandSchema);
    const action = await stationService.submitSwitchSetPosition(command);
    return Response.json({ action }, { status: 202 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
