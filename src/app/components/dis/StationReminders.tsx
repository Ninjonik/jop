'use client';
import { disFetch } from '@/lib/dis/api-client';
import type { StationReminder } from '@/lib/dis/station-reminders';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useTranslation } from '@/lib/i18n/client';
import { useRef, useState } from 'react';
import { AeroIcon } from '../ui/AeroIcon';
export function StationReminders({
  sessionId,
  stationId,
  width,
  height,
  tileSize,
}: {
  sessionId: string;
  stationId: string;
  width: number;
  height: number;
  tileSize: number;
}) {
  const t = useTranslation();
  const { value, error, refresh } = useDisResource<{ reminders: StationReminder[] }>(
    `/api/dis/station-reminders?${new URLSearchParams({ sessionId, stationId })}`,
    { reminders: [] },
    10000,
  );
  const [selected, setSelected] = useState<StationReminder | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<StationReminder | null>(null);
  const tools = useRef<HTMLDetailsElement>(null);
  function edit(reminder: StationReminder) {
    setSelected(reminder);
    if (tools.current) tools.current.open = true;
  }
  const drag = useRef<{ reminder: StationReminder; x: number; y: number } | null>(null);
  async function submit(reminder: StationReminder, remove = false) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await disFetch('/api/dis/station-reminders', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          stationId,
          ...(remove ? { action: 'delete', id: reminder.id } : { action: 'save', reminder }),
        }),
      });
      await refresh();
      setSelected(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Pripomienku sa nepodarilo uložiť.');
    } finally {
      setBusy(false);
      setPreview(null);
    }
  }
  return (
    <>
      <details ref={tools} className="reminder-tools" onPointerDown={(e) => e.stopPropagation()}>
        <summary>{t('Značky a poznámky')}</summary>
        <div className="flex flex-wrap gap-1">
          {(['maintenance', 'note', 'cover'] as const).map((kind) => (
            <button
              className="aero-btn"
              key={kind}
              disabled={busy}
              onClick={() =>
                setSelected({
                  id: crypto.randomUUID(),
                  kind,
                  x: Math.min(1, width - 0.1),
                  y: Math.min(1, height - 0.1),
                  text:
                    kind === 'maintenance'
                      ? 'Na zariadení sa pracuje'
                      : kind === 'cover'
                        ? 'Neobsluhovať'
                        : '',
                })
              }
            >
              <AeroIcon name="add" />
              {t(
                kind === 'maintenance'
                  ? 'Výstražná značka'
                  : kind === 'note'
                    ? 'Papierová poznámka'
                    : 'Kryt tlačidla',
              )}
            </button>
          ))}
        </div>
        {selected && (
          <div className="space-y-1">
            <label>
              {t('Text pripomienky')}
              <textarea
                className="aero-input w-full"
                maxLength={240}
                value={selected.text}
                onChange={(e) => setSelected({ ...selected, text: e.target.value })}
              />
            </label>
            <div className="flex gap-1 flex-wrap">
              <button className="aero-btn" disabled={busy} onClick={() => void submit(selected)}>
                <AeroIcon name="save" />
                {t('Uložiť')}
              </button>
              <button className="aero-btn" onClick={() => setSelected(null)}>
                {t('Zrušiť')}
              </button>
              {value.reminders.some((r) => r.id === selected.id) && (
                <button
                  className="aero-btn"
                  disabled={busy}
                  onClick={() => void submit(selected, true)}
                >
                  <AeroIcon name="delete" />
                  {t('Odstrániť')}
                </button>
              )}
            </div>
          </div>
        )}
        {(notice || error) && <p role="alert">{t(notice || error)}</p>}
        <p>{t('Presuňte značku myšou. Dvojklik otvorí úpravu. Šípky posúvajú označenú značku.')}</p>
      </details>
      {value.reminders.map((saved) => {
        const reminder = preview?.id === saved.id ? preview : saved;
        return (
          <button
            key={saved.id}
            type="button"
            className={`station-reminder reminder-${reminder.kind}`}
            style={{
              left: reminder.x * tileSize,
              top: reminder.y * tileSize,
              fontSize: Math.max(8, tileSize * 0.15),
              width: tileSize * (reminder.kind === 'note' ? 2.5 : 1.4),
              minHeight: tileSize * 0.65,
            }}
            title={t('Upraviť pripomienku')}
            aria-label={`${t('Pripomienka')}: ${reminder.text}`}
            disabled={busy}
            onDoubleClick={() => edit(saved)}
            onKeyDown={(e) => {
              const offsets: Record<string, [number, number]> = {
                ArrowLeft: [-0.1, 0],
                ArrowRight: [0.1, 0],
                ArrowUp: [0, -0.1],
                ArrowDown: [0, 0.1],
              };
              const offset = offsets[e.key];
              if (offset) {
                e.preventDefault();
                void submit({
                  ...saved,
                  x: Math.max(0, Math.min(width - 0.1, saved.x + offset[0])),
                  y: Math.max(0, Math.min(height - 0.1, saved.y + offset[1])),
                });
              } else if (e.key === 'Enter') edit(saved);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { reminder: saved, x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (!start || start.reminder.id !== saved.id) return;
              setPreview({
                ...saved,
                x: Math.max(0, Math.min(width - 0.1, saved.x + (e.clientX - start.x) / tileSize)),
                y: Math.max(0, Math.min(height - 0.1, saved.y + (e.clientY - start.y) / tileSize)),
              });
            }}
            onPointerCancel={() => {
              drag.current = null;
              setPreview(null);
            }}
            onPointerUp={(e) => {
              if (!drag.current) return;
              drag.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
              if (preview?.id === saved.id) void submit(preview);
            }}
          >
            {reminder.kind === 'maintenance' && (
              <span className="reminder-stripe" aria-hidden="true" />
            )}
            {reminder.text || t('Poznámka')}
          </button>
        );
      })}
    </>
  );
}
