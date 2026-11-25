'use client';
import type { Timetable } from '@/lib/dis/timetable';
import { formatBookletClock, formatDwell, unfoldStops } from '@/lib/dis/timetable';
import { useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
export function BookletTimetable({
  timetable,
  stationNames,
  positions,
}: {
  timetable: Timetable;
  stationNames?: Map<string, string>;
  positions?: Record<string, number>;
}) {
  const t = useTranslation();
  const stops = unfoldStops(timetable.stops);
  const stationName = (id: string) => stationNames?.get(id) || getStationDisplayName(id);
  return (
    <section className="booklet-timetable" aria-label={t('Zošitový cestovný poriadok')}>
      <div className="booklet-heading">
        <strong>
          {timetable.trainType} {timetable.trainNumber}
        </strong>
        <span>
          {stationName(stops[0]?.station || '')} – {stationName(stops.at(-1)?.station || '')}
        </span>
        <span>
          {t('Najvyššia rýchlosť')}: {timetable.maxSpeed} {'km/h'}
        </span>
      </div>
      {timetable.planning && !timetable.planning.daily && (
        <div className="booklet-heading booklet-metadata">
          <span>
            {t('Platnosť')}: {timetable.planning.validFrom} – {timetable.planning.validTo}
          </span>
          <span>
            {t('Obdobie GVD')}: {timetable.planning.era}
          </span>
          <span>
            {t('Dni jazdy')}:{' '}
            {timetable.planning.weekdays
              .map((d) => ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'][d - 1])
              .map((d) => t(d))
              .join(', ')}
          </span>
          <span>
            {t('Verzia záznamu')}: {timetable.$updatedAt || '—'}
          </span>
          <span>
            {t('Ide tiež (dátumy oddelené čiarkou)')}:{' '}
            {timetable.planning.includedDates.join(', ') || '—'}
          </span>
          <span>
            {t('Nejde (dátumy oddelené čiarkou)')}:{' '}
            {timetable.planning.excludedDates.join(', ') || '—'}
          </span>
        </div>
      )}
      {timetable.planning?.stock && !timetable.planning.daily && (
        <div className="booklet-heading booklet-metadata">
          <span>
            {t('Súprava')}: {timetable.planning.stock.name}
          </span>
          <span>
            {t('Hmotnosť vozňov (t)')}: {timetable.planning.stock.hauledMassT}
          </span>
          <span>
            {t('Zdroj a platnosť technických údajov')}:{' '}
            {timetable.planning.stock.source || t('Odhad')}
          </span>
          <span>
            {t('Brzdiace percentá')}:{' '}
            {timetable.planning.stock.brakedWeightT
              ? (
                  (timetable.planning.stock.brakedWeightT /
                    (timetable.planning.stock.hauledMassT +
                      timetable.planning.stock.locomotiveMassT)) *
                  100
                ).toFixed(1)
              : '—'}
          </span>
        </div>
      )}
      <div className="overflow-auto">
        <table>
          <thead>
            <tr>
              {[
                'Dopravňa',
                'km',
                'Príchod',
                'Pobyt (min)',
                'Odchod',
                'Koľaj',
                'Rýchlosť (km/h)',
                'Poznámky',
              ].map((label) => (
                <th key={label}>{t(label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stops.map((stop, index) => (
              <tr key={index}>
                <td className={index === 0 || index === stops.length - 1 ? 'font-bold' : ''}>
                  {stationName(stop.station)}
                </td>
                <td>
                  {stop.kilometer ??
                    (positions?.[stop.station] !== undefined
                      ? (positions[stop.station] / 1000).toFixed(3)
                      : '—')}
                </td>
                <td>
                  {index === 0
                    ? '—'
                    : formatBookletClock(
                        stop.arrival,
                        index > 1 ? stops[index - 1].arrival : undefined,
                      )}
                  {index !== 0 && stop.arrivalMinute >= 1440 ? ' +1' : ''}
                </td>
                <td>{stop.dwell ? formatDwell(stop.dwell) : '—'}</td>
                <td>
                  {index === stops.length - 1
                    ? '—'
                    : formatBookletClock(
                        stop.departure,
                        index > 0 ? stops[index - 1].departure : undefined,
                      )}
                  {index !== stops.length - 1 && stop.departureMinute >= 1440 ? ' +1' : ''}
                </td>
                <td>{stop.track || '—'}</td>
                <td>{stop.speedLimit ?? '—'}</td>
                <td>{stop.notes || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {timetable.notes && <p className="p-2">{timetable.notes}</p>}
    </section>
  );
}
