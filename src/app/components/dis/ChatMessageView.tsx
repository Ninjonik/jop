'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import type { ChatMessage } from '@/lib/dis/chat';
import { chatSystemText } from '@/lib/dis/chat-system';
import { formatEddMessage, type EddReply } from '@/lib/dis/edd';
import { useLocale, useLocaleTag, useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useTrainWorkspace } from './TrainWorkspace';

export type DisplayMessage = ChatMessage & { delivery?: 'sending' | 'failed' };

export function ChatMessageView({
  message,
  onRetry,
  stationId,
  onAcknowledge,
  onEddReply,
  offerAnswered,
  actionsVisible = true,
}: {
  message: DisplayMessage;
  onRetry?: () => void;
  stationId?: string;
  onAcknowledge?: (id: string) => void;
  onEddReply?: (reply: EddReply) => void;
  offerAnswered?: boolean;
  actionsVisible?: boolean;
}) {
  const t = useTranslation();
  const localeTag = useLocaleTag();
  const locale = useLocale();
  const edd = message.edd;
  const traffic = useTrainWorkspace();
  function linkedText(text: string) {
    const numbers = new Set(traffic.value.timetables.map((train) => train.trainNumber));
    if (edd) numbers.add(edd.trainNumber);
    return text.split(/(\d+)/g).map((part, i) =>
      numbers.has(part) || /^\d{3,6}$/.test(part) ? (
        <button key={i} className="chat-train-link" onClick={() => traffic.openTrain(part)}>
          {part}
        </button>
      ) : (
        part
      ),
    );
  }
  return (
    <div className="session-chat-message" data-announcement={message.announcement}>
      <time
        dateTime={message.createdAt}
        title={new Date(message.createdAt).toLocaleString(localeTag)}
      >
        {edd
          ? (edd.sentOperatingTime || edd.time).slice(0, 5)
          : new Date(message.createdAt).toLocaleTimeString(localeTag, {
              hour: '2-digit',
              minute: '2-digit',
              ...(message.system ? { second: '2-digit' } : {}),
            })}
      </time>{' '}
      {message.system ? (
        <strong className="inline-flex items-center gap-1">
          <AeroIcon name={message.system.kind === 'radiostop' ? 'warning' : 'phone'} />
          {t('Systém')}
        </strong>
      ) : (
        <>
          <strong
            className="chat-role-prefix"
            data-role={message.senderRole || message.sender.kind}
          >
            <span className="chat-role-dot" aria-hidden="true" />
            {t(message.senderRole || message.sender.kind)} ·{' '}
            {message.sender.kind === 'station'
              ? getStationDisplayName(message.sender.id)
              : message.sender.name}
          </strong>
          {(message.sender.kind === 'station' || message.sender.name !== message.senderName) && (
            <span> ({message.senderName})</span>
          )}
          {message.senderRobloxUsername && (
            <small className="chat-roblox-name">
              {t('Roblox: {0}', message.senderRobloxUsername)}
            </small>
          )}
        </>
      )}
      :{' '}
      {message.announcement && (
        <strong>
          {t(
            message.announcement === 'info'
              ? 'Oznam'
              : message.announcement === 'warning'
                ? 'Upozornenie'
                : 'Poplach',
          )}{' '}
          ·{' '}
        </strong>
      )}
      <span className="whitespace-pre-wrap break-words">
        {message.system
          ? chatSystemText(message.system, t)
          : edd
            ? linkedText(formatEddMessage(edd, locale))
            : linkedText(message.content)}
      </span>
      {edd && (
        <div className="chat-operating-actions">
          <small>
            {t(edd.acknowledgedAt ? 'Potvrdené' : edd.deliveredAt ? 'Doručené' : 'Odoslané')}
            {edd.acknowledgedBy ? ' · ' + edd.acknowledgedBy : ''}
          </small>
          {edd.acknowledgedAt && (
            <details>
              <summary>{t('Potvrdenie príjmu')}</summary>
              <small>{formatEddMessage(edd, locale, true)}</small>
            </details>
          )}
          {actionsVisible &&
            stationId === edd.toStation &&
            !edd.acknowledgedAt &&
            onAcknowledge && (
              <button className="aero-btn" onClick={() => onAcknowledge(edd.id)}>
                {t('Potvrdiť príjem')}
              </button>
            )}
          {stationId === edd.toStation && edd.kind === 'offer' && !offerAnswered && onEddReply && (
            <>
              <button
                className="aero-btn"
                onClick={() =>
                  onEddReply({
                    stationId: stationId!,
                    message: edd,
                    kind: 'accept',
                    request: Date.now(),
                  })
                }
              >
                {t('Prijať vlak')}
              </button>
              <button
                className="aero-btn"
                onClick={() =>
                  onEddReply({
                    stationId: stationId!,
                    message: edd,
                    kind: 'wait',
                    request: Date.now(),
                  })
                }
              >
                {t('Čakajte')}
              </button>
            </>
          )}
          {actionsVisible && stationId === edd.fromStation && onEddReply && (
            <>
              <button
                className="aero-btn"
                onClick={() =>
                  onEddReply({
                    stationId: stationId!,
                    message: edd,
                    kind: 'correction',
                    request: Date.now(),
                  })
                }
              >
                {t('Opraviť správu')}
              </button>
              {edd.kind === 'offer' && (
                <button
                  className="aero-btn"
                  onClick={() =>
                    onEddReply({
                      stationId: stationId!,
                      message: edd,
                      kind: 'cancel',
                      request: Date.now(),
                    })
                  }
                >
                  {t('Zrušiť prijatie')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {message.delivery === 'sending' && (
        <span className="ml-2 text-[var(--aero-text-muted)]">{t('Odosielam…')}</span>
      )}
      {message.delivery === 'failed' && (
        <button type="button" className="aero-btn ml-2" onClick={onRetry}>
          <AeroIcon name="refresh" /> {t('Odoslať znova')}{' '}
        </button>
      )}
    </div>
  );
}
