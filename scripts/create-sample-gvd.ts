/** Explicitly requested demo GVD. Never overwrites an existing train. */
import type { Timetable } from '../src/lib/dis/timetable';
import { databaseId, disDatabase } from '../src/lib/server/dis/appwrite';
import { getDisPlaceTemplate } from '../src/lib/server/dis/places';
import { loadTimetables, saveTimetable } from '../src/lib/server/dis/timetables';
import { getMongoClient } from '../src/lib/server/mongo';
import { isPublicStation } from '../src/lib/station/visibility';

const placeId = '113144512557419';
const marker = 'Ukážkový GVD pre testovanie DIS';
const numbers = ['90001', '90002', '99001', '99002'];
const created: string[] = [];

async function main() {
  const template = await getDisPlaceTemplate(placeId);
  const stations =
    template?.schema.stations
      .filter((station) => isPublicStation(station.stationId))
      .map((station) => station.stationId) || [];
  if (!stations.includes('kolarovo') || !stations.includes('vesele'))
    throw new Error('Sample requires the saved kolarovo/vesele network.');
  const current = await loadTimetables(placeId);
  if (
    numbers.every((number) =>
      current.some((train) => train.trainNumber === number && train.notes?.startsWith(marker)),
    )
  ) {
    console.log('The four sample trains already exist. No records changed.');
    return;
  }
  if (current.some((train) => numbers.includes(train.trainNumber)))
    throw new Error('A sample number is already in use. No existing train will be overwritten.');
  if (!process.argv.includes('--apply')) {
    console.log(
      'Would create sample trains: Os 90001 → Os 90002 → Mn 99001 → Mn 99002. Use --apply to save.',
    );
    return;
  }
  const times = [
    ['08:00', '08:20'],
    ['08:35', '08:55'],
    ['09:10', '09:30'],
    ['09:45', '10:05'],
  ];
  const saved: Timetable[] = [];
  for (let index = 0; index < numbers.length; index++) {
    const route = index % 2 ? ['vesele', 'kolarovo'] : ['kolarovo', 'vesele'];
    const result = await saveTimetable({
      placeId,
      timetable: {
        trainNumber: numbers[index],
        trainType: index < 2 ? 'Os' : 'Mn',
        maxSpeed: index < 2 ? 100 : 70,
        trainLength: index < 2 ? 150 : 250,
        notes: `${marker}. Fiktívne časy a parametre; nejde o skutočný cestovný poriadok.`,
        stops: route.map((station, stopIndex) => ({
          station,
          arrival: times[index][stopIndex],
          departure: times[index][stopIndex],
          track: '1',
          notes: stopIndex
            ? 'Koniec jazdy; skontrolujte nadväzujúci vlak.'
            : 'Začiatok ukážkovej jazdy.',
        })),
      },
    });
    created.push(result.timetable.$id);
    saved.push(result.timetable);
  }
  for (let index = 0; index < saved.length - 1; index++)
    await saveTimetable({
      placeId,
      id: saved[index].$id,
      timetable: { ...saved[index], nextTrainId: saved[index + 1].$id },
    });
  const persisted = await loadTimetables(placeId);
  if (
    !saved.every((train, index) =>
      persisted.some(
        (item) =>
          item.$id === train.$id &&
          (index === saved.length - 1 || item.nextTrainId === saved[index + 1].$id),
      ),
    )
  )
    throw new Error('Sample verification failed.');
  console.log(
    'Saved and verified: Os 90001 → Os 90002 → Mn 99001 → Mn 99002, 08:00–10:05, kolarovo ↔ vesele.',
  );
}
main()
  .catch(async (error) => {
    for (const id of created) await disDatabase().deleteDocument(databaseId, 'timetables_gvd', id);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (await getMongoClient()).close();
  });
