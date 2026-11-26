'use client';
import { canRecord, eddClock, offsetEddTime, type EddEntry, type EddEvent } from '@/lib/dis/edd';
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
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState('');
  const [baseDate, setBaseDate] = useState(date);
  const [offset, setOffset] = useState('0');
  const [usingOffset, setUsingOffset] = useState(false);
  const [revision, setRevision] = useState(record.revision);
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
  const labels = { arrival: 'Príchod teraz', departure: 'Odchod teraz', passage: 'Prechod teraz' };
  return (
    <div className="edd-movement-action">
      <div className="edd-action-buttons">
        {!actual && (
          <button
            className="aero-btn"
            disabled={busy || !clockReady || !canRecord(record, event)}
            onClick={() =>
              void onCommand({
                command: 'record',
                id: record.$id,
                expectedRevision: record.revision,
                event,
              })
            }
          >
            {t(labels[event])}
          </button>
        )}
        <button
          className="aero-btn"
          aria-expanded={open}
          disabled={busy}
          onClick={() => {
            if (!open) {
              setTime(eddClock(actual || planned) === '—' ? now : eddClock(actual || planned));
              setBaseDate(record.eventDates[event] || date);
              setOffset('0');
              setUsingOffset(false);
              setReason('');
              setRevision(record.revision);
            }
            setOpen(!open);
          }}
        >
          {t(actual ? 'Opraviť čas' : 'Čas / posun')}
        </button>
      </div>
      {open && (
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
              setOpen(false);
          }}
        >
          <div className="edd-time-fields">
            <label>
              {t('Skutočný čas')}
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
                value={offset}
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
              {t('Teraz')}
            </button>
          </div>
          <div className="edd-time-summary">
            <strong>{movement.time || '—'}</strong> · {t('Plán')}: {eddClock(planned)} ·{' '}
            {movement.date}
          </div>
          <details>
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
            className="aero-btn"
            disabled={busy || invalidOffset || (!actual && !canRecord(record, event))}
          >
            {t('Zapísať')}
          </button>
        </form>
      )}
    </div>
  );
}
