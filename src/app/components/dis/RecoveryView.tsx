'use client';
import { useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';

import { disFetch } from '@/lib/dis/api-client';
import type { JopStationSummary } from '@/lib/dis/jop-bridge';
import { useState } from 'react';

const actions = [
  {
    id: 'clear-physical-occupations',
    title: 'Vyčistiť snímače obsadenia',
    description: 'Vymaže hlásené obsadenie snímačov.',
  },
  {
    id: 'clear-routes',
    title: 'Zrušiť vlakové cesty',
    description: 'Odstráni postavené a rozpracované cesty.',
  },
  {
    id: 'reset-session-state',
    title: 'Úplný reset prevádzky',
    description: 'Vymaže prevádzkové stavy vrátane vlakov, snímačov, ciest a polôh výhybiek.',
  },
];

export function RecoveryView({
  sessionId,
  stations,
}: {
  sessionId: string;
  stations: JopStationSummary[];
}) {
  const t = useTranslation();
  const [stationId, setStationId] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  async function run(action: (typeof actions)[number]) {
    if (
      !sessionId ||
      !window.confirm(
        t(
          '{0}?\nRozsah: {1}.\n{2}',
          t(action.title),
          stationId || t('celá relácia'),
          t(action.description),
        ),
      )
    )
      return;
    setRunning(true);
    setMessage('');
    try {
      const result = await disFetch<{ stationsUpdated: number }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/admin-recovery`,
        {
          method: 'POST',
          body: JSON.stringify({ action: action.id, stationId: stationId || undefined }),
        },
      );
      setMessage(`Operácia dokončená. Aktualizované stanice: ${result.stationsUpdated}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operácia zlyhala.');
    } finally {
      setRunning(false);
    }
  }
  return (
    <div className="overflow-auto p-4 space-y-4">
      <h2 className="font-bold text-sm">{t('Obnova prevádzkového stavu')}</h2>
      <p>{t('Ak je prevádzkový stav poškodený, vyberte rozsah a vykonajte príslušnú obnovu.')}</p>
      <label>
        {' '}
        {t('Rozsah:')}{' '}
        <select
          className="aero-select"
          value={stationId}
          onChange={(event) => setStationId(event.target.value)}
        >
          <option value="">{t('Celá relácia')}</option>
          {stations
            .filter((station) => station.sessionId === sessionId)
            .map((station) => (
              <option key={station.stationId} value={station.stationId}>
                {station.name}
              </option>
            ))}
        </select>
      </label>
      {!sessionId && <p>{t('Najprv vyberte reláciu.')}</p>}
      {message && <p role="status">{t(message)}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {actions.map((action) => (
          <section
            key={action.id}
            className="border border-[var(--aero-panel-border)] p-3 space-y-2"
          >
            <strong>{t(action.title)}</strong>
            <p>{t(action.description)}</p>
            <button
              className="aero-btn"
              disabled={!sessionId || running}
              onClick={() => void run(action)}
            >
              <AeroIcon name="settings" />
              {t(action.title)}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
