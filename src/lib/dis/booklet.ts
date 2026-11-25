import { networkPath, type RailwayNetwork } from './railway-network';
import { unfoldStops, type TimetableInput } from './timetable';
export function bookletRows(
  train: TimetableInput,
  network?: RailwayNetwork,
  names?: Map<string, string>,
) {
  const stops = unfoldStops(train.stops);
  const key = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const resolve = (id: string) =>
    network?.points.find((p) => p.id === id || key(p.name) === key(names?.get(id) || id))?.id || id;
  type Row = {
    stop: (typeof stops)[number];
    index: number;
    section?: RailwayNetwork['sections'][number];
    speed: string;
    id: string;
    operating: boolean;
  };
  const rows: Row[] = [];
  let previousSpeed = '';
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index],
      next = stops[index + 1],
      from = resolve(stop.station);
    const path = network && next ? networkPath(network, from, resolve(next.station)) : [];
    const ids = [from, ...path.slice(1, -1)];
    ids.forEach((id, i) => {
      const following = path[i + 1];
      const section = network?.sections.find(
        (s) => (s.from === id && s.to === following) || (s.to === id && s.from === following),
      );
      const speed = section?.speed
        ? `${Math.min(train.maxSpeed, section.speed)}/${section.requiredBrakePercent ?? '—'}`
        : section?.requiredBrakePercent
          ? `${train.maxSpeed}/${section.requiredBrakePercent}`
          : '';
      rows.push({
        stop,
        index,
        section,
        speed: speed === previousSpeed ? '' : speed,
        id,
        operating: i > 0,
      });
      previousSpeed = speed;
    });
  }
  return rows;
}
