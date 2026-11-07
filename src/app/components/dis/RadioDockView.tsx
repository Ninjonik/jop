'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { RadioMessage } from '@/lib/dis/records';
import { useDisResource } from '@/lib/dis/use-dis-resource';
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
        <strong>Rádiový denník DIS — {stationId || 'Vyberte stanicu'}</strong>
        <span>Obnova každé 3 s</span>
      </div>
      {(error || loadError) && (
        <p role="alert" className="p-2 text-red-700">
          {error || loadError}
        </p>
      )}
      <div className="radio-messages" aria-live="polite">
        {value.messages.length === 0 && <p>Žiadne uložené hlásenia v relácii.</p>}
        {value.messages.map((message) => (
          <div key={message.$id} className={`msg-line ${message.isUrgentOrder ? 'alert' : ''}`}>
            <span className="msg-time">
              [{new Date(message.$createdAt).toLocaleTimeString('sk-SK')}]{' '}
            </span>
            <strong>{message.senderName}</strong> → {message.targetRecipient}: {message.content}
          </div>
        ))}
      </div>
      <form onSubmit={send} className="radio-input-strip">
        <input
          aria-label="Príjemca"
          className="aero-input"
          required
          maxLength={64}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <input
          aria-label="Hlásenie"
          placeholder="Text hlásenia..."
          className="aero-input flex-1"
          required
          maxLength={1000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {['admin', 'dispatcher_manager'].includes(profile?.role || '') && (
          <label>
            <input
              type="checkbox"
              checked={urgent}
              onChange={(event) => setUrgent(event.target.checked)}
            />{' '}
            Rozkaz
          </label>
        )}
        <button className="aero-btn" disabled={busy || !sessionId || !stationId}>
          <AeroIcon name="send" />
          {busy ? 'Odosielam...' : 'Odoslať'}
        </button>
      </form>
    </div>
  );
}
