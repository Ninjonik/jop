/** Map reference and confirmed corrections; stops use the timetable suffix “z”. */
export const kamenanskoTransportPoints = [
  ['kamenany', 'Kameňany'],
  ['kamenany-nakladna-stanica', 'Kameňany nákladná stanica'],
  ['milosov', 'Milošov'],
  ['milosov-z', 'Milošov z'],
  ['kotesova', 'Kotešová z'],
  ['klenov', 'Klenov'],
  ['dvorniky', 'Dvorníky z'],
  ['dvorniky-zastavka', 'Dvorníky zastávka z'],
  ['solinky', 'odb. Solinky'],
  ['nadezdovo', 'Nadeždovo'],
  ['chym', 'odb. Chým'],
  ['zariecie', 'Záriečie z'],
  ['prilohy', 'Prílohy'],
  ['cervenik', 'Červeník z'],
  ['madunice', 'Madunice z'],
  ['lubina', 'Lubina'],
  ['strezenice', 'Streženice'],
  ['povina', 'Povina z'],
  ['ranciska', 'Rančiská'],
  ['brekov', 'Brekov z'],
  ['teriakovske-klacany', 'Teriakovské Kľačany'],
  ['teriakovce', 'Teriakovce'],
  ['vadan', 'Vadaň z'],
  ['vesele', 'Veselé'],
  ['mytna', 'Mýtna z'],
  ['stefanovo', 'Štefanovo z'],
  ['kolarovo', 'Kolárovo'],
].map(([stationId, name]) => ({ stationId, name }));

export function transportPointKey(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function timetableTransportPoints(
  placeId: string,
  existing: { stationId: string; name: string }[],
) {
  const points = existing.map((point) => ({ ...point, name: point.name.replace(/\bz\.$/, 'z') }));
  if (placeId !== '113144512557419') return points;
  for (const point of kamenanskoTransportPoints) {
    const index = points.findIndex(
      (item) =>
        item.stationId === point.stationId ||
        transportPointKey(item.name) === transportPointKey(point.name),
    );
    if (index < 0) points.push(point);
    else points[index] = { ...points[index], name: point.name };
  }
  return points.sort((a, b) => a.name.localeCompare(b.name, 'sk'));
}
