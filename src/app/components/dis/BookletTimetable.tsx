'use client';
import type { Timetable } from '@/lib/dis/timetable';
import { unfoldStops } from '@/lib/dis/timetable';
import { useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
export function BookletTimetable({ timetable }: { timetable: Timetable }) {
  const t = useTranslation();
  const stops = unfoldStops(timetable.stops);
  return (
    <section className="booklet-timetable" aria-label={t('Zošitový cestovný poriadok')}>
      <div className="booklet-heading">
        <strong>
          {timetable.trainType} {timetable.trainNumber}
        </strong>
        <span>
          {getStationDisplayName(stops[0]?.station || '')} –{' '}
          {getStationDisplayName(stops.at(-1)?.station || '')}
        </span>
        <span>
          {t('Najvyššia rýchlosť')}: {timetable.maxSpeed} {'km/h'} · {t('Dĺžka vlaku')}:{' '}
          {timetable.trainLength} m
        </span>
      </div>
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
                  {getStationDisplayName(stop.station)}
                </td>
                <td>{stop.kilometer ?? '—'}</td>
                <td>
                  {index === 0 ? '—' : stop.arrival}
                  {index !== 0 && stop.arrivalMinute >= 1440 ? ' +1' : ''}
                </td>
                <td>{stop.dwell || '—'}</td>
                <td>
                  {index === stops.length - 1 ? '—' : stop.departure}
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
