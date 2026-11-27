'use client';
import { bookletRows } from '@/lib/dis/booklet';
import { printBooklet } from '@/lib/dis/print-booklet';
import { type RailwayNetwork } from '@/lib/dis/railway-network';
import { formatBookletClock, formatDwell, unfoldStops, type Timetable } from '@/lib/dis/timetable';
import { useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useRef, useState } from 'react';
import './train-workspace.css';
import { ZcpSymbol } from './ZcpSymbol';
export function BookletTimetable({
  timetable,
  stationNames,
  network,
}: {
  timetable: Timetable;
  stationNames?: Map<string, string>;
  positions?: Record<string, number>;
  network?: RailwayNetwork;
}) {
  const t = useTranslation(),
    table = useRef<HTMLTableElement>(null);
  const [error, setError] = useState('');
  const stops = unfoldStops(timetable.stops);
  const meta = timetable.planning?.booklet;
  const name = (id: string) =>
    network?.points.find((p) => p.id === id)?.name ||
    stationNames?.get(id) ||
    getStationDisplayName(id);
  const route = `${name(stops[0]?.station || '')} – ${name(stops.at(-1)?.station || '')}`;
  const notes = [
    meta?.locomotive ? `HKV r. ${meta.locomotive}.` : null,
    meta?.brakeMode ? `Vlak brzdený v režime ${meta.brakeMode}` : null,
    meta?.note || null,
  ].filter((s): s is string => !!s);
  const validity =
    timetable.planning && !timetable.planning.daily
      ? `Platí od ${timetable.planning.validFrom} do ${timetable.planning.validTo}`
      : 'Platnosť: podľa hernej relácie';
  const rows = bookletRows(timetable, network, stationNames);
  const printHeading = {
    train: `${timetable.trainType} ${timetable.trainNumber}`,
    route,
    carrier: meta?.carrier || 'ZSSK',
    validity,
    notes,
  };
  return (
    <section className="zcp-document" aria-label={t('Zošitový cestovný poriadok')}>
      <div className="gvd-action-row">
        <button
          className="aero-btn"
          disabled={!timetable.trainNumber || stops.some((stop) => !stop.station)}
          onClick={() => {
            try {
              setError('');
              if (table.current)
                printBooklet(table.current, {
                  train: `${timetable.trainType} ${timetable.trainNumber}`,
                  route,
                  carrier: meta?.carrier || 'ZSSK',
                  validity,
                  notes,
                });
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {t('Tlač / PDF')}
        </button>
        <span>{t('A4 · mierka 100 % · pre sivé riadky zapnite grafiku na pozadí.')}</span>
        <button
          className="aero-btn"
          disabled={!timetable.trainNumber || stops.some((stop) => !stop.station)}
          onClick={() => {
            try {
              if (table.current) printBooklet(table.current, printHeading, true);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {t('Náhľad A4')}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="zcp-paper">
        <h1>
          {timetable.trainType} {timetable.trainNumber} {meta?.carrier || 'ZSSK'}
        </h1>
        <div className="zcp-notes">
          {notes.map((note, i) => (
            <div key={i}>{note}</div>
          ))}
        </div>
        <div className="zcp-table-scroll">
          <table ref={table} className="zcp-table">
            <colgroup>
              {[43, 7, 7, 10, 6, 10, 17].map((width, i) => (
                <col key={i} style={{ width: width + '%' }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {['1', '2', '3', '5', '6', '7', '8'].map((n, i) => (
                  <th
                    key={n}
                    title={t(
                      [
                        'Dopravňa',
                        'Osobitné opatrenia',
                        'Jazdný čas',
                        'Príchod',
                        'Pobyt',
                        'Odchod',
                        'Stanovená rýchlosť / požadované brzdiace percentá',
                      ][i],
                    )}
                  >
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ stop, index, section, speed, id, operating }, row) => {
                const point = network?.points.find((p) => p.id === id);
                return (
                  <tr
                    key={`${row}:${id}`}
                    className={`${section?.tracks === 2 ? 'zcp-double' : ''} ${section?.block === 'AB' ? 'zcp-ab' : ''}`}
                  >
                    <td>
                      {section?.against && (
                        <span className="zcp-opposite">
                          ×<br />×<br />×
                        </span>
                      )}
                      <span
                        className={`zcp-leader ${point?.kind === 'Stanica' || (!operating && (index === 0 || index === stops.length - 1)) ? 'zcp-station' : ''}`}
                      >
                        {name(id)}
                      </span>
                    </td>
                    <td className="zcp-measures">
                      {point?.symbols.map((s) => (
                        <ZcpSymbol key={s} symbol={s} />
                      ))}
                    </td>
                    <td className="zcp-clock">
                      {!operating && index > 0
                        ? formatDwell(stop.arrivalMinute - stops[index - 1].departureMinute)
                        : ''}
                    </td>
                    <td className="zcp-clock">
                      {!operating && index > 0
                        ? formatBookletClock(
                            stop.arrival,
                            index > 1 ? stops[index - 1].arrival : undefined,
                          )
                        : ''}
                    </td>
                    <td>
                      {!operating && index > 0 && index < stops.length - 1 && stop.dwell
                        ? formatDwell(stop.dwell)
                        : ''}
                    </td>
                    <td className="zcp-clock">
                      {!operating && index < stops.length - 1
                        ? formatBookletClock(
                            stop.departure,
                            index ? stops[index - 1].departure : undefined,
                          )
                        : ''}
                    </td>
                    <td>
                      {speed && (
                        <>
                          <strong>{speed.split('/')[0]}</strong>/{speed.split('/')[1]}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {timetable.notes && <p>{timetable.notes}</p>}
        <details className="zcp-legend">
          <summary>{t('Vysvetlenie stĺpcov a značiek')}</summary>
          <p>
            {t(
              '1 Dopravné body · 2 Osobitné opatrenia · 3 Jazdný čas · 5 Príchod · 6 Pobyt · 7 Odchod · 8 Stanovená rýchlosť / požadované brzdiace percentá',
            )}
          </p>
          <p>
            {t(
              '⁵ znamená polovicu minúty. Nezadané technické údaje zostávajú prázdne. Časy medziľahlých prevádzkových bodov sa nevymýšľajú.',
            )}
          </p>
        </details>
      </div>
    </section>
  );
}
