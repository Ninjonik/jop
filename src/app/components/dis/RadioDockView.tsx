'use client';
import { useLocaleTag, useTranslation } from '@/lib/i18n/client';

import { AeroAutocomplete, type AutocompleteOption } from '@/app/components/ui/AeroAutocomplete';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { RadioMessage } from '@/lib/dis/records';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useState } from 'react';

export function RadioDockView({
  sessionId,
  stationId,
  defaultTarget,
}: {
  sessionId: string;
  stationId: string;
  defaultTarget?: string;
}) {
  const t = useTranslation();
  const localeTag = useLocaleTag();
  const { profile } = useDisAuth();
  const {
    value,
    error: loadError,
    refresh,
  } = useDisResource<{ messages: RadioMessage[] }>(
    sessionId ? `/api/dis/radio?${new URLSearchParams({ sessionId })}` : null,
    { messages: [] },
    3000,
  );
  const [target, setTarget] = useState(defaultTarget || 'Všetci');
  const [expanded, setExpanded] = useState(true);
  const { value: directory, error: directoryError } = useDisResource<{
    recipients: AutocompleteOption[];
  }>(
    sessionId ? `/api/dis/radio?${new URLSearchParams({ sessionId, recipients: 'true' })}` : null,
    { recipients: [] },
    60000,
  );
  const [text, setText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !text.trim() || !sessionId || !stationId) return;
    setBusy(true);
    setError(null);
    try {
      await disFetch('/api/dis/radio', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          stationId,
          targetRecipient: target,
          content: text,
          isUrgentOrder: urgent,
        }),
      });
      setText('');
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Správa nebola odoslaná.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="radio-dock">
      <div className="radio-dock-header">
        <button
          className="aero-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <AeroIcon name="documents" />
          <strong>
            {' '}
            {t('Rádiový denník —')}{' '}
            {stationId ? getStationDisplayName(stationId) : t('Vyberte stanicu')}
          </strong>
          <AeroIcon name={expanded ? 'collapse' : 'expand'} />
        </button>
        <span className="text-[var(--aero-text-muted)]">{t('Hlásenia a rozkazy')}</span>
      </div>
      {expanded && (
        <>
          {(error || loadError) && (
            <p role="alert" className="p-2 text-red-700">
              {t(error) || t(loadError)}
            </p>
          )}
          <div className="radio-messages" aria-live="polite">
            {value.messages.length === 0 && <p>{t('Žiadne uložené hlásenia v relácii.')}</p>}
            {value.messages.map((message) => (
              <div key={message.$id} className={`msg-line ${message.isUrgentOrder ? 'alert' : ''}`}>
                <span className="msg-time">
                  [{new Date(message.$createdAt).toLocaleTimeString(localeTag)}]{' '}
                </span>
                <strong>{message.senderName}</strong> →{' '}
                {message.targetRecipient === 'Všetci' ? t('Všetci') : message.targetRecipient}:{' '}
                {message.content}
              </div>
            ))}
          </div>
          <form onSubmit={send} className="radio-input-strip">
            <label className="radio-recipient">
              {' '}
              {t('Príjemca')}{' '}
              <AeroAutocomplete
                label={t('Príjemca hlásenia')}
                placeholder={t('Stanica alebo vlak…')}
                value={target}
                options={directory.recipients.map((recipient) => ({
                  ...recipient,
                  label: recipient.value === 'Všetci' ? t('Všetci') : recipient.label,
                }))}
                placement="up"
                disabled={busy}
                onInput={(value) => setTarget(value.slice(0, 64))}
                onSelect={(option) => setTarget(option.value)}
              />
            </label>
            <label className="radio-text">
              {' '}
              {t('Hlásenie')}{' '}
              <input
                aria-label={t('Hlásenie')}
                placeholder={t('Text hlásenia...')}
                className="aero-input flex-1"
                required
                maxLength={1000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={busy}
              />
            </label>
            {['admin', 'dispatcher_manager'].includes(profile?.role || '') && (
              <label>
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(event) => setUrgent(event.target.checked)}
                />{' '}
                {t('Rozkaz')}{' '}
              </label>
            )}
            <button
              className="aero-btn"
              disabled={busy || !sessionId || !stationId || !target.trim() || !text.trim()}
            >
              <AeroIcon name="send" />
              {busy ? t('Odosielam...') : t('Odoslať')}
            </button>
          </form>
          {directoryError && (
            <p role="status" className="px-3 pb-2 text-[var(--aero-text-muted)]">
              {' '}
              {t('Návrhy príjemcov sa nepodarilo načítať. Meno môžete zadať ručne.')}{' '}
            </p>
          )}
        </>
      )}
    </div>
  );
}
