'use client';
import { DocumentCenterView } from '@/app/components/dis/DocumentCenterView';
import { EddTableView } from '@/app/components/dis/EddTableView';
import { GvdEditorView } from '@/app/components/dis/GvdEditorView';
import { JopEmbeddedView } from '@/app/components/dis/JopEmbeddedView';
import { RadioDockView } from '@/app/components/dis/RadioDockView';
import { RecoveryView } from '@/app/components/dis/RecoveryView';
import { SessionControlView } from '@/app/components/dis/SessionControlView';
import { ShiftManagementView } from '@/app/components/dis/ShiftManagementView';
import { StaffManagementView } from '@/app/components/dis/StaffManagementView';
import { TpvFullView } from '@/app/components/dis/TpvFullView';
import MockControlClient from '@/app/components/mock/MockControlClient';
import RuntimeStationClient from '@/app/components/runtime/RuntimeStationClient';
import { DisAuthProvider, useDisAuth } from '@/lib/dis/auth-context';
import type { JopStationSummary } from '@/lib/dis/jop-bridge';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { Link2, Map, Moon, Pencil, Sun, TrainFront } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

type Tab =
  | 'sessions'
  | 'runtime'
  | 'edd'
  | 'tpv'
  | 'shifts'
  | 'staff'
  | 'docs'
  | 'gvd'
  | 'mock'
  | 'recovery';
type Scope = { sessionId: string; stationId: string };
type Network = {
  placeId: string;
  stations: JopStationSummary[];
  sessions: { sessionId: string; createdAt: string | null; status: string; isLive: boolean }[];
};
type Place = {
  placeId: string;
  name: string;
  hasTemplate: boolean;
  stations: { stationId: string; name: string }[];
};
type Places = { defaultPlaceId: string; placesComplete: boolean; places: Place[] };
function DisPortalShell() {
  const { user, profile, loading, logout, canCreateGvd, canManageStaff, canOperateStation } =
    useDisAuth();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [placeChoice, setPlaceChoice] = useState<string | null>(null);
  const {
    value: places,
    error: placesError,
    loading: placesLoading,
  } = useDisResource<Places>(
    user ? '/api/dis/places' : null,
    { defaultPlaceId: '', placesComplete: true, places: [] },
    60000,
  );
  const placeId = placeChoice === null ? places.defaultPlaceId : placeChoice;
  const selectedPlace = places.places.find((place) => place.placeId === placeId);
  const { value: networkResult, error: networkError } = useDisResource<Network>(
    user && selectedPlace
      ? `/api/dis/jop-data?placeId=${encodeURIComponent(placeId)}${showMore ? '&includeClosed=true' : ''}`
      : null,
    { placeId: '', stations: [], sessions: [] },
    20000,
  );
  const network =
    selectedPlace && networkResult.placeId === placeId
      ? networkResult
      : { placeId, stations: [], sessions: [] };
  const [tab, setTab] = useState<Tab>('sessions');
  const [scope, setScope] = useState<Scope | null>(null);
  const [tool, setTool] = useState<{ url: string; title: string } | null>(null);
  const [dark, setDark] = useState(false);
  const [clock, setClock] = useState('');
  const [radioTarget, setRadioTarget] = useState('Všetci');
  const current = (scope &&
  (!scope.sessionId || network.sessions.some((session) => session.sessionId === scope.sessionId))
    ? scope
    : null) ||
    network.stations.find((station) =>
      network.sessions.find((session) => session.sessionId === station.sessionId && session.isLive),
    ) || {
      sessionId: network.sessions.find((session) => session.isLive)?.sessionId || '',
      stationId: '',
    };
  const scopeKey = `${current.sessionId}/${current.stationId}`;
  const sessions = network.sessions.filter((session) => {
    const date = session.createdAt ? new Date(session.createdAt) : null;
    const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString('sk-SK') : '';
    return `${session.sessionId} ${dateLabel} ${session.createdAt || ''}`
      .toLocaleLowerCase()
      .includes(sessionSearch.toLocaleLowerCase());
  });
  useEffect(() => {
    if (!loading && !user) router.replace('/dis/login');
  }, [loading, user, router]);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date().toLocaleTimeString('sk-SK')), 1000);
    return () => clearInterval(timer);
  }, []);
  function openTab(next: Tab) {
    setTool(null);
    setTab(next);
  }
  function navigateTool(href: string) {
    const destination = new URL(href, window.location.origin);
    const runtime = destination.pathname.match(/^\/runtime\/([^/]+)\/([^/]+)$/);
    if (runtime) {
      launch(decodeURIComponent(runtime[1]), decodeURIComponent(runtime[2]));
      return;
    }
    if (destination.pathname === '/mock') {
      const sessionId = destination.searchParams.get('sessionId');
      if (sessionId)
        setScope({
          sessionId,
          stationId:
            network.stations.find((station) => station.sessionId === sessionId)?.stationId || '',
        });
      openTab('mock');
      return;
    }
    const titles: Record<string, string> = {
      '/editor': 'Editor staníc',
      '/map': 'Správca staníc a topológie',
      '/linker': 'Prepojovač staníc',
    };
    if (titles[destination.pathname])
      setTool({
        url: destination.pathname + destination.search,
        title: titles[destination.pathname],
      });
    else {
      setTool(null);
    }
  }
  function launch(target: string, stationId: string) {
    if (!selectedPlace) return;
    const tools: Record<string, { url: string; title: string }> = {
      editor: { url: '/editor', title: 'Editor staníc' },
      linker: { url: '/linker', title: 'Prepojovač staníc' },
      map: { url: '/map', title: 'Správca staníc a topológie' },
    };
    if (tools[target]) {
      setTool(tools[target]);
      return;
    }
    if (target === 'mock') {
      if (!current.sessionId) return;
      openTab('mock');
      return;
    }
    if (
      !network.sessions.some((session) => session.sessionId === target) ||
      !network.stations.some(
        (station) => station.sessionId === target && station.stationId === stationId,
      )
    )
      return;
    setScope({ sessionId: target, stationId });
    openTab('runtime');
  }
  if (loading || !user) return <div className="p-6">Overujem prihlásenie...</div>;
  if (!profile)
    return (
      <div className="p-6">
        Profil nie je dostupný. Kontaktujte správcu. <button onClick={logout}>Odhlásiť</button>
      </div>
    );
  const tabs: { id: Tab; title: string; visible?: boolean }[] = [
    { id: 'sessions', title: 'Relácie' },
    { id: 'runtime', title: 'Staničný pult', visible: canOperateStation },
    { id: 'edd', title: 'Dopravný denník' },
    { id: 'tpv', title: 'TPV' },
    { id: 'shifts', title: 'Šichty' },
    { id: 'staff', title: 'Personál', visible: canManageStaff },
    { id: 'docs', title: 'Dokumenty' },
    { id: 'gvd', title: 'Tvorba GVD', visible: canCreateGvd },
    { id: 'mock', title: 'Simulátor', visible: canOperateStation },
    { id: 'recovery', title: 'Obnova', visible: profile.role === 'admin' },
  ];
  return (
    <div className="dis-portal h-screen flex flex-col overflow-hidden bg-[var(--aero-bg)] text-[var(--aero-text)] text-xs">
      <div className="aero-title-bar">
        <div className="window-title">
          <TrainFront size={18} />
          <span>ZSSK DIS — Dopravný informačný systém</span>
        </div>
        <span>
          {profile.name} ({profile.callsign})
        </span>
      </div>
      <nav className="menubar flex-wrap" aria-label="Moduly DIS">
        <span className="menu-group-label">Relácia</span>
        {tabs
          .filter((item) => item.visible !== false)
          .filter((item) =>
            ['sessions', 'runtime', 'edd', 'tpv', 'mock', 'recovery'].includes(item.id),
          )
          .map((item) => (
            <button
              key={item.id}
              className={`menu-btn ${tab === item.id && !tool ? 'font-bold underline' : ''}`}
              disabled={!selectedPlace}
              onClick={() => openTab(item.id)}
            >
              {item.title}
            </button>
          ))}
        <span className="menu-group-label">Všeobecné</span>
        {tabs
          .filter(
            (item) =>
              item.visible !== false && ['shifts', 'staff', 'docs', 'gvd'].includes(item.id),
          )
          .map((item) => (
            <button
              key={item.id}
              className={`menu-btn ${tab === item.id && !tool ? 'font-bold underline' : ''}`}
              disabled={!selectedPlace}
              onClick={() => openTab(item.id)}
            >
              {item.title}
            </button>
          ))}
        <div className="ml-auto flex gap-2">
          <button
            className="aero-btn"
            onClick={() => {
              document.documentElement.classList.toggle('dark', !dark);
              setDark(!dark);
            }}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
            {dark ? 'Svetlý motív' : 'Tmavý motív'}
          </button>
          <button className="aero-btn" onClick={logout}>
            Odhlásiť
          </button>
        </div>
      </nav>
      <div className="ribbon-bar flex-wrap">
        <label>
          Miesto{' '}
          <select
            aria-label="Miesto"
            className="aero-select max-w-80"
            value={placeId}
            disabled={placesLoading && !places.places.length}
            onChange={(event) => {
              setPlaceChoice(event.target.value);
              setScope(null);
              setTool(null);
              setTab('sessions');
              setSessionSearch('');
            }}
          >
            <option value="">Vybrať miesto</option>
            {places.places.map((place) => (
              <option key={place.placeId} value={place.placeId}>
                {place.name} ({place.placeId})
              </option>
            ))}
          </select>
        </label>
        <label>
          Relácia{' '}
          <select
            aria-label="Aktívna relácia"
            className="aero-select max-w-80"
            disabled={!selectedPlace}
            value={current.sessionId}
            onChange={(event) => {
              const sessionId = event.target.value;
              setScope({
                sessionId,
                stationId:
                  network.stations.find((station) => station.sessionId === sessionId)?.stationId ||
                  '',
              });
            }}
          >
            <option value="">Vybrať reláciu</option>
            {sessions.map((session) => (
              <option key={session.sessionId} value={session.sessionId}>
                {session.isLive ? '● ' : ''}
                {session.createdAt
                  ? new Date(session.createdAt).toLocaleString('sk-SK')
                  : 'Dátum neznámy'}{' '}
                — {session.sessionId}
              </option>
            ))}
          </select>
        </label>
        <button
          className="aero-btn"
          disabled={!selectedPlace}
          onClick={() => {
            setShowMore(!showMore);
            setSessionSearch('');
            if (showMore) setScope(null);
          }}
        >
          {showMore ? 'Len živé' : 'Zobraziť ďalšie'}
        </button>
        {showMore && (
          <input
            className="aero-input"
            disabled={!selectedPlace}
            aria-label="Hľadať reláciu podľa dátumu alebo ID"
            placeholder="Hľadať dátum alebo ID"
            value={sessionSearch}
            onChange={(event) => setSessionSearch(event.target.value)}
          />
        )}
        <label>
          Stanica{' '}
          <select
            aria-label="Aktívna stanica"
            className="aero-select"
            disabled={!selectedPlace || !current.sessionId}
            value={current.stationId}
            onChange={(event) =>
              setScope({ sessionId: current.sessionId, stationId: event.target.value })
            }
          >
            <option value="">Vybrať stanicu</option>
            {network.stations
              .filter((station) => station.sessionId === current.sessionId)
              .map((station) => (
                <option key={station.stationId} value={station.stationId}>
                  {station.name}
                </option>
              ))}
          </select>
        </label>
        <button className="aero-btn" disabled={!selectedPlace} onClick={() => launch('editor', '')}>
          <Pencil size={14} />
          Editor staníc
        </button>
        <button className="aero-btn" disabled={!selectedPlace} onClick={() => launch('map', '')}>
          <Map size={14} />
          Správca staníc
        </button>
        <button className="aero-btn" disabled={!selectedPlace} onClick={() => launch('linker', '')}>
          <Link2 size={14} />
          Linker
        </button>
      </div>
      {placesError && (
        <p role="alert" className="p-2 text-red-700">
          Miesta sa nepodarilo načítať: {placesError}
        </p>
      )}
      {!places.placesComplete && (
        <p role="status" className="p-2">
          Roblox nie je dostupný; zobrazené sú uložené konfigurácie miest.
        </p>
      )}
      {networkError && (
        <p role="alert" className="p-2 text-red-700">
          {networkError}
        </p>
      )}
      <div className="workspace min-h-0">
        <aside className="sidebar-panel">
          <div className="sidebar-header">Stanice vybranej relácie</div>
          <div className="tree-content">
            {network.stations
              .filter((station) => station.sessionId === current.sessionId)
              .map((station) => (
                <button
                  key={station.stationId}
                  className={`tree-row w-full text-left ${current.stationId === station.stationId ? 'selected' : ''}`}
                  onClick={() => launch(station.sessionId, station.stationId)}
                >
                  {station.name}
                </button>
              ))}
            {!network.stations.length && <p className="p-2">Žiadne aktívne stanice.</p>}
          </div>
        </aside>
        <main className="content-panel min-w-0">
          {!selectedPlace ? (
            <p className="p-4">Najprv vyberte miesto.</p>
          ) : tool ? (
            <JopEmbeddedView {...tool} onClose={() => setTool(null)} onNavigate={navigateTool} />
          ) : (
            <>
              {tab === 'sessions' && (
                <SessionControlView key={placeId} placeId={placeId} onLaunchRuntime={launch} />
              )}
              {!current.sessionId &&
                ['runtime', 'edd', 'tpv', 'mock', 'recovery'].includes(tab) && (
                  <p className="p-4">Najprv vyberte reláciu pre zvolené miesto.</p>
                )}
              {tab === 'runtime' &&
                current.sessionId &&
                (current.sessionId && current.stationId && canOperateStation ? (
                  <RuntimeStationClient key={scopeKey} {...current} embedded />
                ) : (
                  <p className="p-4">Vyberte stanicu. Staničný pult je určený pre výpravcov.</p>
                ))}
              {tab === 'edd' && current.sessionId && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <EddTableView
                    key={scopeKey}
                    {...current}
                    placeId={placeId}
                    onSelectTrain={(train) => setRadioTarget(`${train} (Rušňovodič)`)}
                  />
                  <RadioDockView
                    key={`${scopeKey}/${radioTarget}`}
                    {...current}
                    defaultTarget={radioTarget}
                  />
                </div>
              )}
              {tab === 'tpv' && current.sessionId && (
                <TpvFullView key={scopeKey} {...current} placeId={placeId} />
              )}
              {tab === 'shifts' && <ShiftManagementView />}
              {tab === 'staff' && canManageStaff && <StaffManagementView />}
              {tab === 'docs' && <DocumentCenterView />}
              {tab === 'gvd' && canCreateGvd && (
                <GvdEditorView key={placeId} place={selectedPlace} />
              )}
              {tab === 'recovery' && current.sessionId && profile.role === 'admin' && (
                <RecoveryView
                  key={current.sessionId}
                  sessionId={current.sessionId}
                  stations={network.stations}
                />
              )}
              {tab === 'mock' && current.sessionId && canOperateStation && (
                <div className="dis-simulator flex-1 overflow-auto p-3">
                  <Suspense fallback={<p>Načítavam simulátor...</p>}>
                    <MockControlClient
                      key={current.sessionId}
                      onSessionChange={(sessionId) =>
                        setScope({
                          sessionId,
                          stationId:
                            network.stations.find((station) => station.sessionId === sessionId)
                              ?.stationId || '',
                        })
                      }
                      embedded
                      initialSessionId={current.sessionId}
                      onLaunch={launch}
                    />
                  </Suspense>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <div className="statusbar">
        <span className="status-item">{profile.role}</span>
        <span className="status-item">Stanica: {current.stationId || 'nevybraná'}</span>
        <span className="status-item">
          {networkError ? 'Chyba načítania siete' : `Stanice: ${network.stations.length}`}
        </span>
        <span className="status-clock">{clock}</span>
      </div>
    </div>
  );
}
export default function DisPortalPage() {
  return (
    <DisAuthProvider>
      <DisPortalShell />
    </DisAuthProvider>
  );
}
