import { EddTableView } from '@/app/components/dis/EddTableView';
import '@/app/globals.css';
import { I18nProvider, setLocale } from '@/lib/i18n/client';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { simulateFailure } from './api';
import { setStation } from './auth';
function Preview() {
  const [stationId, select] = useState('kolarovo');
  return (
    <BrowserRouter>
      <I18nProvider>
        <div
          className="dis-portal"
          style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
        >
          <div className="edd-toolbar">
            <strong>EDD · UKÁŽKOVÉ ÚDAJE / SAMPLE DATA</strong>
            <span>Bez pripojenia k hre / No game connection</span>
            <select
              aria-label="Preview station"
              className="aero-select"
              value={stationId}
              onChange={(e) => {
                setStation(e.target.value);
                select(e.target.value);
              }}
            >
              <option value="kolarovo">Kolárovo — Novák</option>
              <option value="vesele">Veselé — Kováč</option>
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
            <button className="aero-btn" onClick={simulateFailure}>
              Test: ďalšie uloženie zlyhá
            </button>
          </div>
          <EddTableView sessionId="edd-preview" stationId={stationId} placeId="113144512557419" />
        </div>
      </I18nProvider>
    </BrowserRouter>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
