import { getMongoDb } from '@/lib/server/mongo';
import { getRobloxPlaceNames } from '@/lib/server/roblox/place-names';
import type { PlaceTemplateDocument } from '@/lib/station/domain';
import { isPublicStation } from '@/lib/station/visibility';

const defaultUniverse = '9571094123';
const defaultPlace = '113144512557419';
const knownPlaceNames: Record<string, string> = { [defaultPlace]: 'ZSSK: Kameňansko, 2005' };

export function getDisUniverseId() {
  const universeId = process.env.ROBLOX_UNIVERSE_ID?.trim() || defaultUniverse;
  if (!/^[1-9]\d*$/.test(universeId)) throw new Error('Invalid ROBLOX_UNIVERSE_ID.');
  return universeId;
}

export async function getDisPlaceTemplate(placeId: string) {
  if (!/^[1-9]\d{0,31}$/.test(placeId)) return null;
  const db = await getMongoDb();
  return db.collection<PlaceTemplateDocument>('roblox_place_templates').findOne({
    universeId: getDisUniverseId(),
    placeId,
  });
}

export async function loadDisPlaces() {
  const universeId = getDisUniverseId();
  const db = await getMongoDb();
  const templates = await db
    .collection<PlaceTemplateDocument>('roblox_place_templates')
    .find({ universeId })
    .sort({ updatedAt: -1 })
    .toArray();
  const names = new Map<string, string>();
  let placesComplete = true;
  try {
    for (const [placeId, name] of await getRobloxPlaceNames(universeId)) names.set(placeId, name);
  } catch {
    placesComplete = false;
  }
  const places = new Map<
    string,
    {
      placeId: string;
      name: string;
      stations: { stationId: string; name: string }[];
      hasTemplate: boolean;
    }
  >();
  for (const [placeId, name] of names)
    places.set(placeId, { placeId, name, stations: [], hasTemplate: false });
  for (const template of templates) {
    const name =
      names.get(template.placeId) || knownPlaceNames[template.placeId] || 'Nedostupný názov';
    places.set(template.placeId, {
      placeId: template.placeId,
      name,
      hasTemplate: true,
      stations: template.schema.stations
        .filter((station) => isPublicStation(station.stationId))
        .map((station) => ({
          stationId: station.stationId,
          name: station.stationId,
        })),
    });
  }
  const selected = places.has(defaultPlace) ? defaultPlace : templates[0]?.placeId || '';
  return { universeId, defaultPlaceId: selected, places: [...places.values()], placesComplete };
}
