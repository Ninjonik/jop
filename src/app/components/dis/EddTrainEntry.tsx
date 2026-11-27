'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { eddClock, offsetEddTime, timeSeconds, type EddEntry } from '@/lib/dis/edd';
import { alignClockMinute, clockMinutes, formatMinute } from '@/lib/dis/timetable';
import type { TrainStopProgress } from '@/lib/dis/train-progress';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
export function EddTrainEntry({
  record,
  date,
  now,
  busy,
  onCommand,
  forecast,
}: {
  record: EddEntry;
  forecast?: TrainStopProgress;
  date: string;
  now: string;
  busy: boolean;
  onCommand: (payload: object) => Promise<boolean>;
}) {
  const t = useTranslation();
  const [arrival, setArrival] = useState(record.actualArrival || record.schedArrival || now);
  const [departure, setDeparture] = useState(
    record.actualDeparture || record.schedDeparture || record.schedArrival || now,
  );
  const [arrivalDate, setArrivalDate] = useState(record.eventDates.arrival || date);
  const [departureDate, setDepartureDate] = useState(record.eventDates.departure || date);
  const [manualDeparture, setManualDeparture] = useState(false);
  const [manualArrival, setManualArrival] = useState(false);
  const shownArrival =
    !manualArrival && !record.actualArrival && forecast
      ? formatMinute(forecast.arrival).slice(0, 5)
      : arrival;
  const [error, setError] = useState('');
  const follows =
    record.dwell && !record.actualDeparture && !manualDeparture && !record.lockedEvents?.departure;
  const expectedDeparture = forecast?.departure ?? clockMinutes(record.schedDeparture || now);
  const shownDeparture = follows
    ? formatMinute(Math.max(expectedDeparture, alignClockMinute(now, expectedDeparture))).slice(
        0,
        5,
      )
    : record.movement === 'pass' && !manualDeparture && !record.actualDeparture
      ? shownArrival
      : !manualDeparture && !record.actualDeparture && forecast
        ? formatMinute(forecast.departure).slice(0, 5)
        : departure;
  async function save(dwell: boolean) {
    setError('');
    await onCommand({
      command: 'edit',
      action: 'train',
      id: record.$id,
      expectedRevision: record.revision,
      ...(record.movement !== 'origin' && { arrival: shownArrival, arrivalDate }),
      ...(record.movement !== 'terminus' &&
        !dwell && { departure: shownDeparture, departureDate: follows ? date : departureDate }),
      dwell,
    });
  }
  const delayPlan =
    record.movement === 'terminus'
      ? record.schedArrival
      : record.schedDeparture || record.schedArrival;
  const delayActual = record.movement === 'terminus' ? shownArrival : shownDeparture;
  const delay =
    delayPlan && /^\d{2}:\d{2}$/.test(delayActual)
      ? Math.round(
          (((timeSeconds(delayActual) - timeSeconds(delayPlan) + 129600) % 86400) - 43200) / 60,
        )
      : 0;
  return (
    <div className="edd-train-entry">
      {(['arrival', 'departure'] as const).map((event) => {
        const isArrival = event === 'arrival';
        const excluded = isArrival ? record.movement === 'origin' : record.movement === 'terminus';
        const locked = !!record.lockedEvents?.[event];
        const value = isArrival ? shownArrival : shownDeparture;
        const planned = isArrival
          ? record.schedArrival
          : record.schedDeparture || record.schedArrival;
        const setValue = (time: string) => {
          if (isArrival) {
            setArrival(time);
            setManualArrival(true);
          } else {
            setDeparture(time);
            setManualDeparture(true);
          }
        };
        const offset =
          planned && /^\d{2}:\d{2}$/.test(value)
            ? Math.round(
                (((timeSeconds(value) - timeSeconds(planned) + 129600) % 86400) - 43200) / 60,
              )
            : 0;
        return (
          <fieldset
            key={event}
            disabled={excluded || locked || busy}
            className="edd-entry-movement"
          >
            <legend>
              {t(isArrival ? 'Príchod' : 'Odchod')}
              {locked ? ' · ' + t('Potvrdené') : ''}
            </legend>
            <div className="edd-time-fields">
              <input
                className="aero-input edd-time"
                aria-label={t(isArrival ? 'Príchod' : 'Odchod')}
                value={excluded ? '' : value}
                placeholder="HH:mm"
                maxLength={5}
                onChange={(e) => setValue(e.target.value)}
              />
              <label>
                {t('Posun (min)')}
                <input
                  className="aero-input edd-offset"
                  type="number"
                  disabled={!planned || excluded || locked}
                  value={excluded ? '' : offset}
                  onChange={(e) => {
                    try {
                      const shifted = offsetEddTime(planned, date, Number(e.target.value));
                      setValue(shifted.time);
                      if (isArrival) setArrivalDate(shifted.date);
                      else setDepartureDate(shifted.date);
                      setError('');
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
              </label>
              <button
                className="aero-btn"
                onClick={() => {
                  setValue(now);
                  if (isArrival) setArrivalDate(date);
                  else setDepartureDate(date);
                }}
              >
                <AeroIcon name="refresh" />
                {t('Teraz')}
              </button>
            </div>
            <div className="edd-time-summary">
              {t('Plán')}: <b>{excluded ? '—' : eddClock(planned)}</b> →{' '}
              <strong>{excluded ? '—' : value}</strong>
            </div>
            <details>
              <summary>{t('Dátum pohybu')}</summary>
              <input
                className="aero-input"
                type="date"
                value={isArrival ? arrivalDate : departureDate}
                onChange={(e) =>
                  isArrival ? setArrivalDate(e.target.value) : setDepartureDate(e.target.value)
                }
              />
            </details>
          </fieldset>
        );
      })}
      <div className="edd-train-save">
        {!!delay && (
          <span className={delay > 0 ? 'edd-delay' : 'edd-early'}>
            {t(delay > 0 ? 'Meškanie' : 'Náskok')}
            <strong>{Math.abs(delay)} min</strong>
          </span>
        )}
        <button className="aero-btn" disabled={busy} onClick={() => void save(false)}>
          <AeroIcon name="confirm" />
          {t('Zapísať')}
        </button>
        <button
          className="aero-btn"
          disabled={
            busy ||
            record.movement === 'terminus' ||
            !!record.actualDeparture ||
            !!record.lockedEvents?.departure
          }
          onClick={() => void save(true)}
        >
          <AeroIcon name="loading" />
          {t('Zapísať s pobytom')}
        </button>
        {follows && (
          <strong>
            {t('Pobyt')} · {shownDeparture}
          </strong>
        )}
      </div>
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
