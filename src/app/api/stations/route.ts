import type { StationDocument } from '@/lib/station/domain';
import { createStationSchema, deserializeStationLayout } from '@/lib/station/domain';
import { parseJsonRequest, jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await parseJsonRequest(request, createStationSchema);
    const importedLayout = body.layout
      ? deserializeStationLayout(body.layout as StationDocument['layout'])
      : undefined;

    const station = await stationService.createStation(
      body.sessionId,
      body.stationId,
      importedLayout
    );
    return Response.json({ station }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
