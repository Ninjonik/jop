import { ChatMessageView } from '@/app/components/dis/ChatMessageView';
import { EddTableView } from '@/app/components/dis/EddTableView';
import { TpvFullView } from '@/app/components/dis/TpvFullView';
import { TrainWorkspace } from '@/app/components/dis/TrainWorkspace';
import { ResizablePanel } from '@/app/components/ui/ResizablePanel';
import '@/app/globals.css';
import type { EddReply } from '@/lib/dis/edd';
import { I18nProvider, setLocale, useTranslation } from '@/lib/i18n/client';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  advancePreviewClock,
  disFetch,
  previewChatHistory,
  previewPlainMessage,
  simulateFailure,
} from './api';
import { setStation } from './auth';
import './preview.css';
function Preview() {
  const [view, setView] = useState<'edd' | 'tpv'>('edd');
  const [stationId, select] = useState('kolarovo');
  const [multiple, setMultiple] = useState(true);
  const [target, setTarget] = useState('vesele');
  const [reply, setReply] = useState<EddReply>();
  return (
    <BrowserRouter>
      <I18nProvider>
        <TrainWorkspace sessionId="edd-preview" active>
          <div
            className="dis-portal"
            style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
          >
            <div className="edd-toolbar">
              <strong>EDD · UKÁŽKOVÉ ÚDAJE / SAMPLE DATA</strong>
              <span>Bez pripojenia k hre / No game connection</span>
              <button className="aero-btn" onClick={() => setView('edd')}>
                EDD
              </button>
              <button className="aero-btn" onClick={() => setView('tpv')}>
                TPV
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={(e) => {
                    setMultiple(e.target.checked);
                    setReply(undefined);
                    if (!e.target.checked) {
                      select('kolarovo');
                      setStation('kolarovo');
                      setTarget('vesele');
                    }
                  }}
                />{' '}
                Prevzaté obe stanice / Own both stations
              </label>
              <select
                aria-label="Preview station"
                className="aero-select"
                value={stationId}
                onChange={(e) => {
                  setStation(e.target.value);
                  select(e.target.value);
                  setReply(undefined);
                  setTarget(e.target.value === 'kolarovo' ? 'vesele' : 'kolarovo');
                }}
              >
                <option value="kolarovo">Kolárovo — Novák</option>
                {multiple && <option value="vesele">Veselé — Kováč</option>}
              </select>
              <button className="aero-btn" onClick={() => setLocale('sk')}>
                Slovensky
              </button>
              <button className="aero-btn" onClick={() => setLocale('en')}>
                English
              </button>
              <button
                className="aero-btn"
                onClick={() => document.documentElement.classList.toggle('dark')}
              >
                Svetlá / tmavá
              </button>
              <button className="aero-btn" onClick={advancePreviewClock}>
                Test: +1 min
              </button>
              <button className="aero-btn" onClick={simulateFailure}>
                Test: ďalšie uloženie zlyhá
              </button>
            </div>
            <div
              className="edd-preview-workspace"
              style={{ display: view === 'edd' ? '' : 'none' }}
            >
              <EddTableView
                sessionId="edd-preview"
                stationId={stationId}
                placeId="113144512557419"
                active={view === 'edd'}
                reply={reply}
                onOpenChat={setTarget}
              />
              <PreviewChat
                key={stationId}
                stationId={stationId}
                target={target}
                onReply={setReply}
              />
            </div>
            <div
              className="tpv-preview-split"
              style={{ display: view === 'tpv' ? undefined : 'none' }}
            >
              <TpvFullView
                sessionId="edd-preview"
                stationId={stationId}
                placeId="113144512557419"
                active={view === 'tpv'}
              />
              <ResizablePanel
                id="tpv-preview-communication"
                title="Komunikácia"
                edge="right"
                defaultSize={300}
                responsive
              >
                <PreviewChat stationId={stationId} target={target} onReply={setReply} />
              </ResizablePanel>
            </div>
          </div>
        </TrainWorkspace>
      </I18nProvider>
    </BrowserRouter>
  );
}
function PreviewChat({
  stationId,
  target,
  onReply,
}: {
  stationId: string;
  target: string;
  onReply: (reply: EddReply) => void;
}) {
  const t = useTranslation();
  const [, refresh] = useState(0);
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = setInterval(() => refresh((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);
  const messages = previewChatHistory(stationId, target);
  return (
    <aside className="edd-preview-chat">
      <div className="edd-toolbar">
        <strong>
          {t('Komunikácia')} — {target === 'vesele' ? 'Veselé' : 'Kolárovo'}
        </strong>
      </div>
      <div className="session-chat-log" role="log" aria-label={t('Správy vo vybranom rozhovore')}>
        {!messages.length && <p>{t('Zatiaľ žiadne správy.')}</p>}
        {messages.map((message) => (
          <ChatMessageView
            key={message._id}
            message={message}
            actionsVisible={message._id === messages.at(-1)?._id}
            stationId={stationId}
            onEddReply={onReply}
            offerAnswered={messages.some(
              (reply) =>
                reply.edd?.replyToId === message.edd?.id &&
                ['accept', 'wait', 'cancel'].includes(reply.edd?.kind || ''),
            )}
            onAcknowledge={(id) =>
              void disFetch('/api/dis/edd', {
                method: 'POST',
                body: JSON.stringify({
                  sessionId: 'edd-preview',
                  stationId,
                  command: 'receive',
                  id,
                  acknowledge: true,
                }),
              }).then(() => refresh((n) => n + 1))
            }
          />
        ))}
      </div>
      <form
        className="edd-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          previewPlainMessage(stationId, target, text);
          setText('');
          refresh((n) => n + 1);
        }}
      >
        <input
          className="aero-input"
          aria-label={t('Text správy')}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Napíšte správu…')}
        />
        <button className="aero-btn">{t('Odoslať správu')}</button>
      </form>
    </aside>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
