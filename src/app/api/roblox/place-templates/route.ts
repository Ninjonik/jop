import { getDisUniverseId } from '@/lib/server/dis/places';
import { jsonErrorResponse } from '@/lib/server/http';
import { getRobloxPlaceNames } from '@/lib/server/roblox/place-names';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const templates = await stationService.listPlaceTemplates();
    const universes = [
      ...new Set([getDisUniverseId(), ...templates.map((template) => template.universeId)]),
    ];
    const results = await Promise.allSettled(universes.map(getRobloxPlaceNames));
    const destinations = results.flatMap((result, index) =>
      result.status === 'fulfilled'
        ? [...result.value].map(([placeId, name]) => ({
            universeId: universes[index],
            placeId,
            name,
          }))
        : [],
    );
    return Response.json({
      templates: templates.map((template) => ({
        ...template,
        name:
          destinations.find(
            (place) =>
              place.universeId === template.universeId && place.placeId === template.placeId,
          )?.name ?? null,
      })),
      destinations,
      namesComplete: results.every((result) => result.status === 'fulfilled'),
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
