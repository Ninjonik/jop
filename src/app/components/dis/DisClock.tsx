'use client';
import { disFetch } from '@/lib/dis/api-client';
import { operatingClockParts } from '@/lib/dis/clock';
import { useSessionClock } from '@/lib/dis/use-session-clock';
import { useLocaleTag, useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
import { GvdDialog } from './GvdDialog';

export function DisClock({
  sessionId = '',
  canManage = false,
}: {
  sessionId?: string;
  canManage?: boolean;
}) {
  const t = useTranslation();
  const locale = useLocaleTag();
  const { clock, now, error, refresh } = useSessionClock(sessionId);
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const offset = clock?.offsetMinutes || 0;
  const shown = operatingClockParts(offset, now);
  const unavailable = !!sessionId && !clock;
  const date = new Date(shown.date + 'T12:00:00Z').toLocaleDateString(locale, { timeZone: 'UTC' });
  async function save(value: number) {
    if (busy) return;
    setFailure('');
    setBusy(true);
    try {
      await disFetch('/api/dis/session-clock', {
        method: 'POST',
        body: JSON.stringify({ sessionId, offsetMinutes: Math.round(value * 60) }),
      });
      await refresh();
      setOpen(false);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        className="dis-operating-clock"
        title={t(error || (sessionId ? 'Prevádzkový čas relácie' : 'Reálny čas – Bratislava'))}
      >
        <time dateTime={unavailable ? undefined : shown.date + 'T' + shown.time}>
          {unavailable ? '—:—:—' : shown.time}
        </time>
        <small>
          {unavailable ? '—' : date}
          {offset ? ` · ${offset > 0 ? '+' : ''}${offset / 60} h` : ''}
        </small>
        {sessionId && canManage && (
          <button
            className="aero-btn"
            disabled={unavailable}
            onClick={() => {
              setHours(offset / 60);
              setFailure('');
              setOpen(true);
            }}
          >
            {t('Posun času')}
          </button>
        )}
        {error && <small role="status">{t('Čas sa nepodarilo overiť.')}</small>}
      </div>
      {open && (
        <GvdDialog
          title={t('Prevádzkový čas relácie')}
          compact
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            {t(
              'Posun platí pre všetkých v tejto relácii: hodiny DIS, TPV, skutočné časy EDD a Roblox. Časy v grafikone sa nemenia.',
            )}
          </p>
          <label>
            {t('Posun oproti reálnemu času (hodiny)')}
            <input
              className="aero-input"
              type="number"
              min={-24}
              max={24}
              step={1}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
              disabled={busy}
            />
          </label>
          <p>{t('Napríklad −12 h: reálne 18:00 → prevádzka 06:00.')}</p>
          <p>
            {t('Náhľad')}:{' '}
            <strong>
              {
                operatingClockParts(
                  Number.isFinite(hours) && Math.abs(hours) <= 24 ? hours * 60 : 0,
                  now,
                ).time
              }
            </strong>
          </p>
          <p>
            {t(
              'Termíny šícht a prihlášky zostávajú v reálnom čase. Roblox potrebuje aktualizovaný JOP Bridge.',
            )}
          </p>
          <div className="gvd-action-row">
            <button
              className="aero-btn"
              disabled={busy || !Number.isFinite(hours) || Math.abs(hours) > 24}
              onClick={() => void save(hours)}
            >
              {t('Použiť posun')}
            </button>
            <button className="aero-btn" disabled={busy} onClick={() => void save(0)}>
              {t('Použiť reálny čas')}
            </button>
          </div>
          {failure && <p role="alert">{t(failure)}</p>}
        </GvdDialog>
      )}
    </>
  );
}
