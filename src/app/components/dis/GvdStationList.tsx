'use client';
import { pointKind, pointKinds } from '@/lib/dis/railway-network';
import type { Timetable } from '@/lib/dis/timetable';
import { unfoldStops } from '@/lib/dis/timetable';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
export function GvdStationList({
  trains,
  stations,
}: {
  trains: Timetable[];
  stations: { stationId: string; name: string }[];
}) {
  const t = useTranslation();
  const [station, setStation] = useState(stations[0]?.stationId || '');
  const rows = trains
    .flatMap((train) =>
      unfoldStops(train.stops)
        .filter((stop) => stop.station === station)
        .map((stop) => ({ train, stop })),
    )
    .sort((a, b) => a.stop.arrivalMinute - b.stop.arrivalMinute);
  return (
    <section className="booklet-timetable">
      <div className="gvd-action-row">
        <label>
          {t('Dopravňa')}{' '}
          <select
            className="aero-select"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          >
            {pointKinds.map((kind) => (
              <optgroup key={kind} label={t(kind)}>
                {stations
                  .filter((s) => pointKind(s.name) === kind)
                  .map((s) => (
                    <option key={s.stationId} value={s.stationId}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button className="aero-btn" onClick={() => window.print()}>
          {t('Tlač / PDF')}
        </button>
      </div>
      <h3>
        {t('Staničný zoznam vlakov')} · {stations.find((s) => s.stationId === station)?.name}
      </h3>
      <table className="aero-grid">
        <thead>
          <tr>
            {['Vlak', 'Príchod', 'Odchod', 'Koľaj', 'Druh zastavenia', 'Poznámky'].map((s) => (
              <th key={s}>{t(s)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ train, stop }, i) => (
            <tr key={`${train.$id}:${i}`}>
              <td>
                {train.trainType} {train.trainNumber}
              </td>
              <td>
                {stop.arrival}
                {stop.arrivalMinute >= 1440 ? ' +1' : ''}
              </td>
              <td>
                {stop.departure}
                {stop.departureMinute >= 1440 ? ' +1' : ''}
              </td>
              <td>{stop.track || '—'}</td>
              <td>
                {t(
                  stop.kind === 'pass'
                    ? 'Prejazd'
                    : stop.kind === 'operational'
                      ? 'Dopravný pobyt'
                      : 'Zastavenie',
                )}
              </td>
              <td>{stop.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
