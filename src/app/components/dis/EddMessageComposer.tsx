'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { useResizablePanel } from '@/app/components/ui/ResizablePanel';
import { useDisAuth } from '@/lib/dis/auth-context';
import { operatingClockParts } from '@/lib/dis/clock';
import {
  formatEddMessage,
  messageKinds,
  messageLabels,
  offsetEddTime,
  stationForms,
  type EddEntry,
  type EddMessage,
  type EddMessageKind,
  type EddReply,
  type EddSendCommand,
} from '@/lib/dis/edd';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useSessionClock } from '@/lib/dis/use-session-clock';
import { useLocale, useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useEffect, useRef, useState } from 'react';
import './edd.css';
import type { EddSnapshot } from './EddWorkstation';
import { playMessageSound } from './message-sounds';

export function EddMessageComposer({
  sessionId,
  stationId,
  reply: incomingReply,
  selected,
  onOpenChat,
  onSend,
}: {
  sessionId: string;
  stationId: string;
  reply?: EddReply;
  selected?: EddEntry;
  onOpenChat?: (stationId: string) => void;
  onSend: (command: EddSendCommand, preview: EddMessage) => Promise<boolean>;
}) {
  const t = useTranslation(),
    locale = useLocale();
  const { profile, canOperateStation } = useDisAuth();
  const { expand } = useResizablePanel();
  useEffect(() => {
    if (incomingReply) expand();
  }, [incomingReply, expand]);
  const { clock, now, error: clockError } = useSessionClock(sessionId);
  const current = operatingClockParts(clock?.offsetMinutes || 0, now);
  const {
    value,
    error: loadError,
    refresh,
  } = useDisResource<EddSnapshot>(
    `/api/dis/edd?${new URLSearchParams({ sessionId, stationId })}`,
    { records: [], messages: [], contacts: [] },
    5000,
  );
  const writable = canOperateStation && value.canWrite === true;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const commandLock = useRef(false);
  const [toStation, setToStation] = useState(''),
    [kind, setKind] = useState<EddMessageKind>('offer');
  const [trainNumber, setTrainNumber] = useState(''),
    [messageTime, setMessageTime] = useState(''),
    [text, setText] = useState('');
  const [replyToId, setReplyToId] = useState(''),
    [wholeTrainConfirmed, setWholeTrainConfirmed] = useState(false);
  const ownName = getStationDisplayName(stationId),
    ownForms = stationForms(ownName);
  const [locative, setLocative] = useState(ownForms.stationLocative),
    [genitive, setGenitive] = useState(ownForms.stationGenitive);
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, [
    toStation,
    kind,
    trainNumber,
    messageTime,
    text,
    replyToId,
    locative,
    genitive,
    wholeTrainConfirmed,
  ]);
  const [appliedSelection, setAppliedSelection] = useState<EddEntry>();
  if (selected && selected !== appliedSelection) {
    setAppliedSelection(selected);
    setTrainNumber(selected.trainNumber);
    setMessageTime(
      (kind === 'arrival' || kind === 'odhlaska'
        ? selected.actualArrival || selected.actualDeparture || ''
        : kind === 'departure'
          ? selected.actualDeparture || ''
          : selected.schedDeparture || ''
      ).slice(0, 5),
    );
  }
  const [appliedReply, setAppliedReply] = useState<EddReply>();
  if (incomingReply && incomingReply !== appliedReply) {
    setAppliedReply(incomingReply);
    const { message, kind } = incomingReply;
    if (
      incomingReply.stationId === stationId &&
      message.sessionId === sessionId &&
      [message.fromStation, message.toStation].includes(stationId)
    ) {
      setKind(kind);
      setToStation(message.fromStation === stationId ? message.toStation : message.fromStation);
      setTrainNumber(message.trainNumber);
      setMessageTime(message.time.slice(0, 5));
      setReplyToId(message.id);
      setText('');
    }
  }
  const original =
    value.messages?.find((m) => m.id === replyToId) ||
    (incomingReply?.message.id === replyToId ? incomingReply.message : undefined);
  const preview: EddMessage = {
    id: '',
    sessionId,
    fromStation: stationId,
    toStation,
    kind,
    trainNumber,
    time: kind === 'accept' && original ? original.time : messageTime || current.minuteTime,
    date: current.date,
    createdAt: '',
    operator: profile?.name || '',
    userId: profile?.userId || '',
    text,
    stationName: kind === 'accept' && original ? original.stationName : ownName,
    stationLocative: kind === 'accept' && original ? original.stationLocative : locative,
    stationGenitive: kind === 'accept' && original ? original.stationGenitive : genitive,
  };

  return (
    <div className="edd-global-composer">
      {(error || loadError || clockError) && (
        <p className="edd-error" role="alert">
          {t(error || loadError || clockError)}
        </p>
      )}
      <section className="edd-presets">
        <div className="edd-toolbar">
          <strong>{t('Dopravné správy')}</strong>
          <span className="edd-muted">
            {t('Správy sa odosielajú do existujúcej staničnej komunikácie.')}
          </span>
          {toStation && (
            <button className="aero-btn" onClick={() => onOpenChat?.(toStation)}>
              {t('Otvoriť rozhovor')}
            </button>
          )}
        </div>
        {writable && (
          <form
            className="edd-composer"
            onSubmit={async (e) => {
              e.preventDefault();
              if (commandLock.current) return;
              commandLock.current = true;
              setBusy(true);
              setError('');
              const submission: EddSendCommand = {
                sessionId,
                stationId,
                requestId: requestId.current,
                toStation,
                trainNumber,
                kind,
                time: preview.time,
                date: preview.date,
                text,
                ...(replyToId && { replyToId }),
                wholeTrainConfirmed,
                stationLocative: locative,
                stationGenitive: genitive,
              };
              // Preserve the submitted message in the outbox; edits made afterward stay untouched.
              const sending = onSend(submission, preview);
              requestId.current = crypto.randomUUID();
              setText('');
              setWholeTrainConfirmed(false);
              setReplyToId('');
              setKind('offer');
              onOpenChat?.(toStation);
              playMessageSound('outgoing');
              try {
                if (await sending) void refresh();
              } finally {
                commandLock.current = false;
                setBusy(false);
              }
            }}
          >
            <div className="edd-composer-fields">
              <label>
                {t('Adresát')}
                <select
                  className="aero-select"
                  required
                  value={toStation}
                  onChange={(e) => {
                    setToStation(e.target.value);
                    setReplyToId('');
                  }}
                >
                  <option value="">{t('Vyberte stanicu')}</option>
                  {(value.contacts || []).map((contact) => (
                    <option key={contact.stationId} value={contact.stationId}>
                      {contact.name}
                      {contact.neighbour ? ` — ${t('Susedná stanica')}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Číslo vlaku')}
                <input
                  className="aero-input"
                  required
                  maxLength={32}
                  value={trainNumber}
                  onChange={(e) => {
                    setTrainNumber(e.target.value);
                    setReplyToId('');
                  }}
                />
              </label>
              <label>
                {t('Druh správy')}
                <select
                  className="aero-select"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as EddMessageKind);
                    if (selected)
                      setMessageTime(
                        (e.target.value === 'arrival' || e.target.value === 'odhlaska'
                          ? selected.actualArrival || selected.actualDeparture || ''
                          : e.target.value === 'departure'
                            ? selected.actualDeparture || ''
                            : selected.schedDeparture || ''
                        ).slice(0, 5),
                      );
                    if (!['accept', 'wait', 'cancel', 'correction'].includes(e.target.value))
                      setReplyToId('');
                    setWholeTrainConfirmed(false);
                  }}
                >
                  {messageKinds.map((k) => (
                    <option
                      key={k}
                      value={k}
                      disabled={
                        ['accept', 'wait', 'cancel', 'correction'].includes(k) && !replyToId
                      }
                    >
                      {t(messageLabels[k])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Čas hláseného pohybu')}
                <span className="edd-message-time">
                  <input
                    className="aero-input"
                    placeholder={current.minuteTime}
                    value={messageTime}
                    disabled={kind === 'accept'}
                    onChange={(e) => setMessageTime(e.target.value)}
                  />
                  <button
                    type="button"
                    className="aero-btn"
                    disabled={kind === 'accept'}
                    onClick={() => setMessageTime(current.minuteTime)}
                  >
                    <AeroIcon name="refresh" />
                    {t('Teraz')}
                  </button>
                </span>
              </label>
              <label>
                {t('Posun (min)')}
                <input
                  className="aero-input edd-offset"
                  type="number"
                  defaultValue="0"
                  disabled={kind === 'accept'}
                  onChange={(e) => {
                    try {
                      setMessageTime(
                        offsetEddTime(
                          (kind === 'arrival'
                            ? selected?.actualArrival || selected?.schedArrival
                            : selected?.actualDeparture || selected?.schedDeparture) ||
                            current.minuteTime,
                          current.date,
                          Number(e.target.value),
                        ).time,
                      );
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
              </label>
            </div>
            {replyToId && (
              <p>
                {t('Odpoveď na vybranú správu')}{' '}
                <button
                  type="button"
                  className="aero-btn"
                  onClick={() => {
                    setReplyToId('');
                    setKind('offer');
                  }}
                >
                  {t('Zrušiť')}
                </button>
              </p>
            )}
            {!ownForms.known && (
              <details>
                <summary>{t('Skloňovanie názvu stanice')}</summary>
                <label>
                  {t('v / vo')}{' '}
                  <input
                    className="aero-input"
                    required
                    value={locative}
                    onChange={(e) => setLocative(e.target.value)}
                  />
                </label>
                <label>
                  {t('z / zo')}{' '}
                  <input
                    className="aero-input"
                    required
                    value={genitive}
                    onChange={(e) => setGenitive(e.target.value)}
                  />
                </label>
              </details>
            )}
            <textarea
              rows={1}
              className="aero-input"
              aria-label={t('Doplňujúci text alebo dôvod')}
              placeholder={t('Doplňujúci text alebo dôvod')}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {kind === 'odhlaska' && (
              <label>
                <input
                  type="checkbox"
                  checked={wholeTrainConfirmed}
                  onChange={(e) => setWholeTrainConfirmed(e.target.checked)}
                />{' '}
                {t('Celý vlak uvoľnil oddiel a sú splnené podmienky odhlášky.')}
              </label>
            )}
            <p className="edd-message-preview">{formatEddMessage(preview, locale)}</p>
            <small className="edd-muted">
              {t(
                ['offer', 'accept', 'wait', 'odhlaska', 'occupied'].includes(kind)
                  ? 'Slovenský vzor podľa predpisu; angličtina je herný preklad.'
                  : 'Zjednodušené herné hlásenie.',
              )}
            </small>
            <button
              className="aero-btn"
              disabled={
                busy || !clock || !!clockError || (kind === 'odhlaska' && !wholeTrainConfirmed)
              }
            >
              <AeroIcon name="send" /> {t('Odoslať správu')}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
