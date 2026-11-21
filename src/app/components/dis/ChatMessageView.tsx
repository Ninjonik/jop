'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import type { ChatMessage } from '@/lib/dis/chat';
import { chatSystemText } from '@/lib/dis/chat-system';
import { useLocaleTag, useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';

export type DisplayMessage = ChatMessage & { delivery?: 'sending' | 'failed' };

export function ChatMessageView({
  message,
  onRetry,
}: {
  message: DisplayMessage;
  onRetry?: () => void;
}) {
  const t = useTranslation();
  const localeTag = useLocaleTag();
  return (
    <div className="session-chat-message" data-announcement={message.announcement}>
      <time
        dateTime={message.createdAt}
        title={new Date(message.createdAt).toLocaleString(localeTag)}
      >
        {new Date(message.createdAt).toLocaleTimeString(localeTag, {
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
            <small className="chat-roblox-name">{t('Roblox: {0}', message.senderRobloxUsername)}</small>
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
        {message.system ? chatSystemText(message.system, t) : message.content}
      </span>
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
