import { GvdWorkstation } from '@/app/components/dis/GvdWorkstation';
import '@/app/globals.css';
import { I18nProvider, setLocale } from '@/lib/i18n/client';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

function Preview() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <div
          className="dis-portal"
          style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
        >
          <div
            style={{
              padding: '5px 10px',
              background: 'var(--aero-caption-bottom)',
              color: 'var(--aero-text)',
              fontSize: 12,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>
              UKÁŽKOVÉ ÚDAJE / SAMPLE DATA · Bez pripojenia k hre · Obnovenie stránky vynuluje
              ukážku
            </span>
            <button
              className="aero-btn"
              onClick={() => document.documentElement.classList.toggle('dark')}
            >
              Svetlá / tmavá
            </button>
            <button className="aero-btn" onClick={() => setLocale('en')}>
              English
            </button>
            <button className="aero-btn" onClick={() => setLocale('sk')}>
              Slovensky
            </button>
          </div>
          <GvdWorkstation
            place={{
              placeId: '113144512557419',
              name: 'Kameňansko',
              stations: [
                { stationId: 'kolarovo', name: 'Kolárovo' },
                { stationId: 'vesele', name: 'Veselé' },
                { stationId: 'hlavna', name: 'Kameňansko hlavná stanica' },
              ],
            }}
          />
        </div>
      </I18nProvider>
    </BrowserRouter>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
