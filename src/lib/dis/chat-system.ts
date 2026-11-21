import { translate } from '@/lib/i18n/translate';

type CallParticipants = { callerName: string; recipientName: string };
export type ChatSystemEvent =
  | {
      kind: 'radiostop';
      eventId: string;
      actorName: string;
      scope: 'session' | 'station';
      areaName: string;
    }
  | ({ kind: 'call-ringing'; eventId: string } & CallParticipants)
  | ({ kind: 'call-started'; eventId: string } & CallParticipants)
  | ({
      kind: 'call-ended';
      eventId: string;
      durationSeconds: number | null;
      reason: string;
    } & CallParticipants);

export function chatSystemText(
  event: ChatSystemEvent,
  t: (text: string, ...values: (string | number)[]) => string = (text, ...values) =>
    translate(text, 'sk', ...values),
) {
  if (event.kind === 'radiostop')
    return t(
      'RADIOSTOP aktivoval {0}. Oblasť: {1}.',
      event.actorName,
      event.scope === 'session' ? t('Celá relácia') : event.areaName,
    );
  if (event.kind === 'call-ringing')
    return t('Volanie: {0} → {1}.', event.callerName, event.recipientName);
  if (event.kind === 'call-started')
    return t('Hovor začal: {0} ↔ {1}.', event.callerName, event.recipientName);
  if (event.durationSeconds === null)
    return t(
      'Volanie skončilo bez spojenia: {0} → {1}. {2}',
      event.callerName,
      event.recipientName,
      t(event.reason),
    );
  const duration = `${Math.floor(event.durationSeconds / 60)}:${String(event.durationSeconds % 60).padStart(2, '0')}`;
  return t(
    'Hovor skončil: {0} ↔ {1}. Trvanie: {2}. {3}',
    event.callerName,
    event.recipientName,
    duration,
    t(event.reason),
  );
}
