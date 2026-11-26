'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import {
  canRecord,
  eddClock,
  offsetEddTime,
  timeSeconds,
  type EddEntry,
  type EddEvent,
} from '@/lib/dis/edd';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';

/** Direct movement entry; the server still validates sequence, ownership and revision. */
export function EddMovementAction({
  record,
  event,
  date,
  now,
  busy,
  clockReady,
  onCommand,
}: {
  record: EddEntry;
  event: EddEvent;
  date: string;
  now: string;
  busy: boolean;
  clockReady: boolean;
  onCommand: (payload: object) => Promise<boolean>;
}) {
  const t = useTranslation();
  const actual = event === 'arrival' ? record.actualArrival : record.actualDeparture;
  const planned = event === 'arrival' ? record.schedArrival : record.schedDeparture;

  const [time, setTime] = useState(
    eddClock(actual || planned) === '—' ? now : eddClock(actual || planned),
  );
  const [baseDate, setBaseDate] = useState(record.eventDates[event] || date);
  const [offset, setOffset] = useState('0');
  const [usingOffset, setUsingOffset] = useState(false);
  const [revision] = useState(record.revision);
  const [reason, setReason] = useState('');
  let movement = { time, date: baseDate },
    invalidOffset = false;
  if (usingOffset) {
    try {
      movement = offsetEddTime(planned, baseDate, offset.trim() ? Number(offset) : NaN);
    } catch {
      invalidOffset = true;
    }
  }
  const displayedOffset = usingOffset
    ? offset
    : planned && /^\d{2}:\d{2}$/.test(time)
      ? String(
          Math.round((((timeSeconds(time) - timeSeconds(planned) + 129600) % 86400) - 43200) / 60),
        )
      : '';
  return (
    <div className="edd-movement-action">
      <form
        className="edd-time-entry"
        onSubmit={async (e) => {
          e.preventDefault();
          if (invalidOffset) return;
          if (
            await onCommand({
              command: 'edit',
              action: actual ? 'correct' : 'record',
              id: record.$id,
              expectedRevision: revision,
              event,
              time: movement.time,
              date: movement.date,
              reason,
            })
          )
            setReason('');
        }}
      >
        <div className="edd-time-fields">
          <label>
            {t(event === 'arrival' ? 'Príchod' : event === 'departure' ? 'Odchod' : 'Prechod')}
            <input
              className="aero-input edd-time"
              required
              placeholder="HH:mm"
              aria-label={t('Skutočný čas')}
              value={movement.time}
              maxLength={5}
              inputMode="numeric"
              onChange={(e) => {
                setTime(e.target.value);
                setBaseDate(movement.date);
                setUsingOffset(false);
              }}
            />
          </label>
          <label>
            {t('Posun (min)')}
            <input
              className="aero-input edd-offset"
              type="number"
              step="1"
              min="-1440"
              max="1440"
              disabled={!planned}
              value={displayedOffset}
              onChange={(e) => {
                setOffset(e.target.value);
                setUsingOffset(true);
              }}
            />
          </label>
          <button
            type="button"
            className="aero-btn"
            disabled={!clockReady}
            onClick={() => {
              setTime(now);
              setBaseDate(date);
              setUsingOffset(false);
            }}
          >
            <AeroIcon name="refresh" /> {t('Teraz')}
          </button>
        </div>
        <div className="edd-time-summary">
          <span>
            {t('Plán')}: <b>{eddClock(planned)}</b>
          </span>
          <span aria-hidden="true"> → </span>
          <span>
            {t('Výsledný čas')}: <strong>{invalidOffset ? '—' : movement.time || '—'}</strong>
          </span>
          {movement.date !== date && <small> · {movement.date}</small>}
        </div>
        <details className="edd-entry-details">
          <summary>{t('Dátum pohybu')}</summary>
          <input
            type="date"
            className="aero-input"
            required
            aria-label={t('Dátum pohybu')}
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value)}
          />
        </details>
        {actual && (
          <input
            className="aero-input"
            required
            maxLength={500}
            aria-label={t('Dôvod opravy')}
            placeholder={t('Dôvod opravy')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        <button
          className="aero-btn edd-record-button"
          disabled={busy || invalidOffset || (!actual && !canRecord(record, event))}
        >
          <AeroIcon name={actual ? 'edit' : 'confirm'} /> {t(actual ? 'Opraviť čas' : 'Zapísať')}
        </button>
      </form>
    </div>
  );
}
