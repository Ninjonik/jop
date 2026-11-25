'use client';
import { parseCompactClock } from '@/lib/dis/gvd-running-times';
import { clockMinutes, formatMinute, type TimetableInput } from '@/lib/dis/timetable';
import { useTranslation } from '@/lib/i18n/client';
import { useRef, useState } from 'react';
import { AeroAutocomplete } from '../ui/AeroAutocomplete';

export function GvdStopGrid({
  train,
  stations,
  disabled,
  onChange,
}: {
  train: TimetableInput;
  stations: { stationId: string; name: string }[];
  disabled: boolean;
  onChange: (train: TimetableInput) => void;
}) {
  const t = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const table = useRef<HTMLTableElement>(null);
  const update = (row: number, patch: Partial<TimetableInput['stops'][number]>) =>
    onChange({
      ...train,
      stops: train.stops.map((s, i) =>
        i === row
          ? {
              ...s,
              ...patch,
              ...(row === 0 && patch.departure !== undefined ? { arrival: patch.departure } : {}),
              ...(row === train.stops.length - 1 && patch.arrival !== undefined
                ? { departure: patch.arrival }
                : {}),
            }
          : s,
      ),
    });
  const move = (index: number, delta: number) => {
    const stops = [...train.stops];
    [stops[index], stops[index + delta]] = [stops[index + delta], stops[index]];
    onChange({ ...train, stops });
  };
  return (
    <>
      <label className="gvd-grid-options">
        <input
          type="checkbox"
          checked={showDetails}
          onChange={(e) => setShowDetails(e.target.checked)}
        />
        {t('Poznámky a druh zastavenia')}
      </label>
      <div className="gvd-grid-scroll gvd-simple-grid">
        <table
          className="aero-grid gvd-sheet"
          ref={table}
          onKeyDown={(e) => {
            const input = e.target as HTMLInputElement;
            if (
              !['Enter', 'ArrowUp', 'ArrowDown'].includes(e.key) ||
              input.tagName !== 'INPUT' ||
              !input.dataset.cell
            )
              return;
            const [row, column] = input.dataset.cell.split(':').map(Number);
            const next = table.current?.querySelector<HTMLInputElement>(
              `input[data-cell="${row + (e.key === 'ArrowUp' ? -1 : 1)}:${column}"]`,
            );
            if (next) {
              e.preventDefault();
              next.focus();
              next.select();
            }
          }}
        >
          <thead>
            <tr>
              {[
                'Dopravňa',
                'Príchod',
                'Pobyt',
                'Odchod',
                'Koľaj',
                'Druh zastavenia',
                'Poznámky',
                'Úpravy',
              ]
                .filter((label) => showDetails || !['Druh zastavenia', 'Poznámky'].includes(label))
                .map((s) => (
                  <th key={s}>{t(s)}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {train.stops.map((stop, index) => (
              <tr key={index}>
                <td>
                  <span className="gvd-row-number">{index + 1}</span>
                  <AeroAutocomplete
                    portal
                    disabled={disabled}
                    label={t('Stanica {0}', index + 1)}
                    value={stations.find((s) => s.stationId === stop.station)?.name || stop.station}
                    options={stations.map((s) => ({ value: s.stationId, label: s.name }))}
                    onInput={(value) => {
                      const match = stations.find(
                        (s) =>
                          s.name.toLocaleLowerCase('sk') === value.trim().toLocaleLowerCase('sk'),
                      );
                      if (!disabled) update(index, { station: match?.stationId || value });
                    }}
                    onSelect={(o) => {
                      if (!disabled) update(index, { station: o.value });
                    }}
                  />
                </td>
                {(['arrival', 'dwell', 'departure', 'track', 'kind', 'notes'] as const).map(
                  (field, col) =>
                    !showDetails && (field === 'kind' || field === 'notes') ? null : (
                      <td key={field}>
                        {field === 'kind' ? (
                          <select
                            className="aero-select"
                            disabled={disabled}
                            value={stop.kind || 'stop'}
                            aria-label={t('Druh zastavenia')}
                            onChange={(e) =>
                              update(index, {
                                kind: e.target.value as 'stop' | 'pass' | 'operational',
                                ...(e.target.value === 'pass' ? { departure: stop.arrival } : {}),
                              })
                            }
                          >
                            {['stop', 'pass', 'operational'].map((s, i) => (
                              <option key={s} value={s}>
                                {t(['Zastavenie', 'Prejazd', 'Dopravný pobyt'][i])}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="aero-input"
                            disabled={
                              disabled ||
                              (index === 0 && field === 'arrival') ||
                              (index === train.stops.length - 1 && field === 'departure') ||
                              ((index === 0 || index === train.stops.length - 1) &&
                                field === 'dwell') ||
                              (stop.kind === 'pass' &&
                                (field === 'dwell' || (field === 'departure' && index > 0)))
                            }
                            data-cell={`${index}:${col}`}
                            aria-label={`${t(field === 'dwell' ? 'Pobyt' : field)} ${index + 1}`}
                            inputMode={field === 'track' || field === 'notes' ? 'text' : 'numeric'}
                            placeholder="—"
                            value={
                              (index === 0 && field === 'arrival') ||
                              (index === train.stops.length - 1 && field === 'departure')
                                ? ''
                                : field === 'dwell'
                                  ? /^[0-2]\d:[0-5]\d$/.test(stop.arrival) &&
                                    /^[0-2]\d:[0-5]\d$/.test(stop.departure)
                                    ? (clockMinutes(stop.departure) -
                                        clockMinutes(stop.arrival) +
                                        1440) %
                                      1440
                                    : ''
                                  : stop[field] || ''
                            }
                            onBlur={(e) => {
                              if (field === 'arrival' || field === 'departure') {
                                const value = parseCompactClock(e.target.value);
                                if (value !== e.target.value)
                                  update(index, {
                                    [field]: value,
                                    ...(stop.kind === 'pass' && field === 'arrival'
                                      ? { departure: value }
                                      : {}),
                                  });
                              }
                            }}
                            onChange={(e) => {
                              if (field === 'dwell') {
                                const minutes = Number(e.target.value);
                                if (
                                  Number.isFinite(minutes) &&
                                  minutes >= 0 &&
                                  minutes < 1440 &&
                                  /^\d{2}:\d{2}$/.test(stop.arrival)
                                )
                                  update(index, {
                                    departure: formatMinute(clockMinutes(stop.arrival) + minutes),
                                  });
                              } else
                                update(index, {
                                  [field]: e.target.value,
                                  ...(stop.kind === 'pass' && field === 'arrival'
                                    ? { departure: e.target.value }
                                    : {}),
                                });
                            }}
                            onPaste={(e) => {
                              if (disabled || field === 'dwell') return;
                              const text = e.clipboardData.getData('text');
                              if (!text.includes('\t') && !text.includes('\n')) return;
                              e.preventDefault();
                              const fields = ['arrival', 'departure', 'track', 'notes'] as const;
                              const start = fields.indexOf(field as (typeof fields)[number]);
                              if (start < 0) return;
                              const rows = text.replace(/\r?\n$/, '').split(/\r?\n/);
                              if (rows.length + index > 100) return;
                              const stops = train.stops.map((s) => ({ ...s }));
                              rows.forEach((line, r) => {
                                if (!stops[index + r]) return;
                                line.split('\t').forEach((value, c) => {
                                  const key = fields[start + c];
                                  if (key)
                                    stops[index + r][key] =
                                      key === 'arrival' || key === 'departure'
                                        ? parseCompactClock(value)
                                        : value;
                                });
                              });
                              stops[0].arrival = stops[0].departure;
                              stops[stops.length - 1].departure = stops[stops.length - 1].arrival;
                              onChange({ ...train, stops });
                            }}
                          />
                        )}
                      </td>
                    ),
                )}
                <td>
                  <div className="gvd-row-actions">
                    <button
                      className="aero-btn"
                      disabled={disabled || index === 0}
                      title={t('Vyššie')}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="aero-btn"
                      disabled={disabled || index === train.stops.length - 1}
                      title={t('Nižšie')}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="aero-btn"
                      disabled={disabled || train.stops.length >= 100}
                      onClick={() =>
                        onChange({
                          ...train,
                          stops: [
                            ...train.stops.slice(0, index + 1),
                            {
                              station: '',
                              arrival: stop.departure,
                              departure: stop.departure,
                              track: '',
                            },
                            ...train.stops.slice(index + 1),
                          ],
                        })
                      }
                    >
                      {t('Vložiť')}
                    </button>
                    <button
                      className="aero-btn"
                      disabled={disabled || train.stops.length <= 2}
                      onClick={() =>
                        onChange({ ...train, stops: train.stops.filter((_, i) => i !== index) })
                      }
                    >
                      {t('Odstrániť')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
