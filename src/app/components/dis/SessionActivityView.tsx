'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { ActionFeedback } from '@/app/components/ui/DispatcherFeedback';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useLocaleTag, useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import type { SessionActivityPage } from '@/lib/station/session-activity';
import { useState } from 'react';

export function SessionActivityView({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const locale = useLocaleTag();
  const [cursor, setCursor] = useState<string | null>(null);
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const { value, error, loading, refresh } = useDisResource<SessionActivityPage>(
    sessionId ? `/api/sessions/${encodeURIComponent(sessionId)}/activity${query}` : null,
    { entries: [], nextCursor: null },
    5000,
  );
  return (
    <section className="border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)]">
      <div className="ribbon-bar flex-wrap">
        <strong>{t('Denník relácie')}</strong>
        <button
          className="aero-btn"
          onClick={() => {
            if (cursor) setCursor(null);
            else void refresh();
          }}
        >
          <AeroIcon name="refresh" />
          {t('Najnovšie udalosti')}
        </button>
        <button
          className="aero-btn"
          disabled={!value.nextCursor}
          onClick={() => setCursor(value.nextCursor)}
        >
          {t('Staršie udalosti')}
        </button>
        <span>{t('Denník sa odstráni po ukončení relácie.')}</span>
      </div>
      <p className="p-2">
        {t(
          'Čas je zaznamenaný serverom. Potvrdenie klienta označuje spracovanie snímky v prehliadači, nie meranie vykreslenia obrazovky.',
        )}
      </p>
      <ActionFeedback message={t(error)} error />
      {loading && <p className="p-2">{t('Načítavam denník...')}</p>}
      {!loading && !value.entries.length && (
        <p className="p-2">{t('Zatiaľ nie sú zaznamenané udalosti.')}</p>
      )}
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-[var(--aero-ribbon-bg)]">
            <tr>
              {['Čas', 'Zdroj', 'Udalosť', 'Stanica', 'Revízia', 'Trvanie', 'Podrobnosti'].map(
                (label) => (
                  <th key={label} className="text-left p-2">
                    {t(label)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {value.entries.map((entry) => (
              <tr key={entry.id} className="border-t border-[var(--aero-panel-border)] align-top">
                <td className="p-2 whitespace-nowrap">
                  {new Date(entry.recordedAt).toLocaleString(locale, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                    fractionalSecondDigits: 3,
                  })}
                </td>
                <td className="p-2">{entry.source}</td>
                <td className="p-2">
                  <span>
                    {entry.level === 'error'
                      ? t('Chyba')
                      : entry.level === 'warning'
                        ? t('Upozornenie')
                        : ''}
                  </span>{' '}
                  {entry.event}
                </td>
                <td className="p-2">
                  {entry.stationId ? getStationDisplayName(entry.stationId) : '—'}
                </td>
                <td className="p-2">{entry.revision ?? '—'}</td>
                <td className="p-2 whitespace-nowrap">
                  {entry.durationMs === undefined ? '—' : `${entry.durationMs} ms`}
                </td>
                <td className="p-2">
                  <details>
                    <summary>{t('Podrobnosti')}</summary>
                    <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        { correlationId: entry.correlationId, ...entry.details },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
