'use client';
import { AccountSettingsSync } from '@/app/components/dis/AccountSettingsSync';
import { AudioPermissions } from '@/app/components/dis/AudioPermissions';
import { DesktopDownloads } from '@/app/components/dis/DesktopDownloads';
import { DisClock } from '@/app/components/dis/DisClock';
import { SettingsView } from '@/app/components/dis/SettingsView';
import { StationSelectionView } from '@/app/components/dis/StationSelectionView';
import { ResizablePanel } from '@/app/components/ui/ResizablePanel';
import { disFetch } from '@/lib/dis/api-client';
import type { StationClaim } from '@/lib/dis/claims';
import { canUseWorkingMode, type WorkingMode } from '@/lib/dis/permissions';
import { useLeaseClock } from '@/lib/dis/use-lease-clock';
import { useUserPreference } from '@/lib/dis/use-user-preference';
import { LanguageSelector, useLocaleTag, useTranslation } from '@/lib/i18n/client';

import { DocumentCenterView } from '@/app/components/dis/DocumentCenterView';
import { DriverDashboardView } from '@/app/components/dis/DriverDashboardView';
import { EddTableView } from '@/app/components/dis/EddTableView';
import { GvdEditorView } from '@/app/components/dis/GvdEditorView';
import { JopEmbeddedView } from '@/app/components/dis/JopEmbeddedView';
import { NetworkPreparationView } from '@/app/components/dis/NetworkPreparationView';
import { RecoveryView } from '@/app/components/dis/RecoveryView';
import { SessionChatView } from '@/app/components/dis/SessionChatView';
import { SessionControlView } from '@/app/components/dis/SessionControlView';
import { ShiftManagementView } from '@/app/components/dis/ShiftManagementView';
import { StaffManagementView } from '@/app/components/dis/StaffManagementView';
import { TpvFullView } from '@/app/components/dis/TpvFullView';
import { TrainWorkspace } from '@/app/components/dis/TrainWorkspace';
import MockControlClient from '@/app/components/mock/MockControlClient';
import RuntimeStationClient from '@/app/components/runtime/RuntimeStationClient';
import { AeroIcon, type AeroIconName } from '@/app/components/ui/AeroIcon';
import { DisAuthProvider, useDisAuth } from '@/lib/dis/auth-context';
import type { DriverTrain } from '@/lib/dis/driver-train';
import type { EddReply } from '@/lib/dis/edd';
import type { JopStationSummary } from '@/lib/dis/jop-bridge';
import { singlePlaceSessionMode } from '@/lib/dis/operating-mode';
import { isDisAdministrator } from '@/lib/dis/permissions';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useRouter } from '@/lib/navigation';
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';

type Tab =
  | 'settings'
  | 'preparation'
  | 'sessions'
  | 'driver'
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
const tabIcons: Record<Tab, AeroIconName> = {
  settings: 'settings',
  preparation: 'network',
  sessions: 'launch',
  driver: 'train',
  runtime: 'network',
  edd: 'table',
  tpv: 'chart',
  shifts: 'calendar',
  staff: 'staff',
  docs: 'documents',
  gvd: 'edit',
  mock: 'play',
  recovery: 'settings',
};
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
function WorkspaceView({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className="flex flex-1 flex-col min-h-0 overflow-hidden"
      hidden={!active}
      style={!active ? { display: 'none' } : undefined}
    >
      {children}
    </div>
  );
}
function DisPortalShell() {
  const t = useTranslation();
  const leaseNow = useLeaseClock();
  const localeTag = useLocaleTag();
  const {
    user,
    profile,
    loading,
    authError,
    retryAuth,
    logout,
    canCreateGvd,
    canManageStaff,
    canOperateStation,
  } = useDisAuth();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);
  const [workingMode, setWorkingMode] = useState<WorkingMode | null>(null);
  const [claimError, setClaimError] = useState('');
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
  const placeId = singlePlaceSessionMode
    ? places.defaultPlaceId || places.places[0]?.placeId || ''
    : placeChoice === null
      ? places.defaultPlaceId
      : placeChoice;
  const selectedPlace = places.places.find((place) => place.placeId === placeId);
  const { value: networkResult, error: networkError } = useDisResource<Network>(
    user && selectedPlace
      ? `/api/dis/jop-data?placeId=${encodeURIComponent(placeId)}${!singlePlaceSessionMode && showMore ? '&includeClosed=true' : ''}`
      : null,
    { placeId: '', stations: [], sessions: [] },
    20000,
  );
  const network =
    selectedPlace && networkResult.placeId === placeId
      ? {
          ...networkResult,
          sessions: singlePlaceSessionMode
            ? networkResult.sessions.filter((session) => session.isLive)
            : networkResult.sessions,
        }
      : { placeId, stations: [], sessions: [] };
  const [tab, setTab] = useState<Tab>('sessions');
  const [visitedViews, setVisitedViews] = useState<Partial<Record<Tab, boolean>>>({
    sessions: true,
  });
  function selectTab(next: Tab) {
    setVisitedViews((visited) => (visited[next] ? visited : { ...visited, [next]: true }));
    setTab(next);
  }
  const [scope, setScope] = useState<Scope | null>(null);
  const [tool, setTool] = useState<{ url: string; title: string } | null>(null);
  const [appearance, setAppearance] = useUserPreference('appearance', { dark: false });
  const dark = appearance.dark;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  const [chatToOpen, setChatToOpen] = useState<{ stationId: string; request: number }>();
  const [eddReply, setEddReply] = useState<EddReply>();
  const [driverSelection, setDriverSelection] = useState<{
    sessionId: string;
    train: DriverTrain | null;
  }>();
  const selectedScope =
    scope && network.sessions.some((session) => session.sessionId === scope.sessionId)
      ? scope
      : null;
  // Remember the automatic choice so later polling cannot replace it with another session.
  if (!selectedScope?.sessionId && network.sessions.length === 1) {
    const sessionId = network.sessions[0].sessionId;
    setScope({
      sessionId,
      stationId:
        network.stations.find((station) => station.sessionId === sessionId)?.stationId || '',
    });
  }
  const current = selectedScope || { sessionId: '', stationId: '' };
  const hasSession = Boolean(selectedPlace && current.sessionId);
  const {
    value: control,
    refresh: refreshClaims,
    error: claimsError,
  } = useDisResource<{ claims: StationClaim[] }>(
    user && current.sessionId
      ? `/api/dis/station-claims?${new URLSearchParams({ sessionId: current.sessionId })}`
      : null,
    { claims: [] },
    10000,
  );
  const ownClaims = control.claims.filter(
    (claim) =>
      claim.sessionId === current.sessionId &&
      claim.userId === profile?.userId &&
      claim.expiresAt > leaseNow,
  );
  const ownsStation = ownClaims.some((claim) => claim.stationId === current.stationId);
  async function releaseStation(stationId: string) {
    try {
      await disFetch('/api/dis/station-claims', {
        method: 'DELETE',
        body: JSON.stringify({ sessionId: current.sessionId, stationId }),
      });
      await refreshClaims();
      if (stationId === current.stationId) {
        const next = ownClaims.find((claim) => claim.stationId !== stationId);
        if (next) setScope({ sessionId: next.sessionId, stationId: next.stationId });
        else openTab('sessions');
      }
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Stanicu sa nepodarilo uvoľniť.');
    }
  }
  const onDriverTrainChange = useCallback(
    (train: DriverTrain | null) => {
      setDriverSelection({ sessionId: current.sessionId, train });
    },
    [current.sessionId],
  );
  const sessionStations = network.stations.filter(
    (station) => station.sessionId === current.sessionId,
  );
  const hasStation =
    hasSession && sessionStations.some((station) => station.stationId === current.stationId);
  const scopeKey = `${current.sessionId}/${current.stationId}`;
  const sessions = network.sessions.filter((session) => {
    const date = session.createdAt ? new Date(session.createdAt) : null;
    const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(localeTag) : '';
    return `${session.sessionId} ${dateLabel} ${session.createdAt || ''}`
      .toLocaleLowerCase()
      .includes(sessionSearch.toLocaleLowerCase());
  });
  useEffect(() => {
    if (!loading && !user && !authError) router.replace('/dis/login');
  }, [loading, user, authError, router]);
  function openTab(next: Tab) {
    setTool(null);
    selectTab(next);
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
    if (titles[destination.pathname]) {
      selectTab('preparation');
      setTool({
        url: destination.pathname + destination.search,
        title: titles[destination.pathname],
      });
    } else {
      setTool(null);
    }
  }
  async function launch(target: string, stationId: string) {
    const tools: Record<string, { url: string; title: string }> = {
      editor: { url: '/editor', title: 'Editor staníc' },
      linker: { url: '/linker', title: 'Prepojovač staníc' },
      map: { url: '/map', title: 'Správca staníc a topológie' },
    };
    if (tools[target]) {
      selectTab('preparation');
      setTool(tools[target]);
      return;
    }
    if (!selectedPlace) return;
    if (target === 'mock') {
      if (!current.sessionId) return;
      openTab('mock');
      return;
    }
    if (
      !isDisAdministrator(profile?.role) &&
      (!network.sessions.some((session) => session.sessionId === target) ||
        !network.stations.some(
          (station) => station.sessionId === target && station.stationId === stationId,
        ))
    )
      return;
    setClaimError('');
    if (isDisAdministrator(profile?.role) && workingMode === 'admin') {
      setScope({ sessionId: target, stationId });
      openTab('runtime');
      return;
    }
    try {
      await disFetch('/api/dis/station-claims', {
        method: 'POST',
        body: JSON.stringify({ sessionId: target, stationId }),
      });
      setScope({ sessionId: target, stationId });
      await refreshClaims();
      openTab('runtime');
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Stanicu sa nepodarilo prevziať.');
    }
  }
  if (authError && !loading)
    return (
      <div className="dis-portal flex min-h-screen items-center justify-center bg-[var(--aero-bg)] p-4 text-[var(--aero-text)]">
        <section className="border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] p-4">
          <p role="alert">{t(authError)}</p>
          <button className="aero-btn mt-3" onClick={() => void retryAuth()}>
            <AeroIcon name="refresh" />
            {t('Skúsiť znova')}
          </button>
        </section>
      </div>
    );
  if (loading || !user) return <div className="p-6">{t('Overujem prihlásenie...')}</div>;
  if (!profile)
    return (
      <div className="p-6">
        {' '}
        {t('Profil nie je dostupný. Kontaktujte správcu.')}{' '}
        <button onClick={logout}>{t('Odhlásiť')}</button>
      </div>
    );
  const tabs: { id: Tab; title: string; visible?: boolean }[] = [
    { id: 'settings', title: 'Nastavenia' },
    { id: 'sessions', title: 'Relácie' },
    { id: 'driver', title: 'Môj vlak', visible: hasSession && workingMode === 'driver' },
    {
      id: 'runtime',
      title: 'Staničný pult',
      visible:
        hasSession &&
        canOperateStation &&
        (workingMode === 'dispatcher' ||
          (workingMode === 'admin' && isDisAdministrator(profile.role))),
    },
    {
      id: 'edd',
      visible: hasStation && ownsStation && workingMode === 'dispatcher',
      title: 'Dopravný denník',
    },
    { id: 'tpv', title: 'TPV', visible: hasSession },
    { id: 'shifts', title: 'Šichty' },
    { id: 'staff', title: 'Personál', visible: canManageStaff && workingMode === 'admin' },
    { id: 'docs', title: 'Dokumenty' },
    {
      id: 'preparation',
      title: 'Príprava siete',
      visible: workingMode === 'admin' && canCreateGvd,
    },
    { id: 'gvd', title: 'Tvorba GVD', visible: canCreateGvd && workingMode === 'admin' },
    {
      id: 'mock',
      title: 'Simulátor',
      visible: hasSession && canOperateStation && workingMode === 'admin',
    },
    {
      id: 'recovery',
      title: 'Obnova',
      visible: hasSession && isDisAdministrator(profile.role) && workingMode === 'admin',
    },
  ];
  const activeTab = tabs.find((item) => item.id === tab)?.visible === false ? 'sessions' : tab;
  return (
    <TrainWorkspace
      key={current.sessionId}
      sessionId={current.sessionId}
      active={activeTab === 'edd' || activeTab === 'tpv'}
    >
      <div className="dis-portal h-screen flex flex-col overflow-hidden bg-[var(--aero-bg)] text-[var(--aero-text)] text-xs">
        <AccountSettingsSync />
        {hasSession && workingMode === 'dispatcher' && (
          <nav className="train-workspace-switch" aria-label={t('Riadenie dopravy')}>
            {(['runtime', 'edd', 'tpv'] as const).map((id) => (
              <button
                key={id}
                className="aero-btn"
                aria-pressed={activeTab === id}
                onClick={() => setTab(id)}
              >
                <AeroIcon name={tabIcons[id]} />
                {t(id === 'runtime' ? 'Staničný pult' : id === 'edd' ? 'Dopravný denník' : 'TPV')}
              </button>
            ))}
          </nav>
        )}
        <AudioPermissions sessionId={current.sessionId} />
        <div className="aero-title-bar dis-main-title-bar">
          <div className="window-title">
            <AeroIcon name="train" size={24} />
            <span>{t('ZSSK DIS — Dopravný informačný systém')}</span>
          </div>
          <span className="ml-auto">
            {profile.name} ({profile.callsign})
          </span>
          <DisClock sessionId={current.sessionId} canManage={canManageStaff} />
        </div>
        <nav hidden={!workingMode} className="menubar flex-wrap" aria-label={t('Moduly DIS')}>
          <button className="menu-btn" onClick={() => setWorkingMode(null)}>
            <AeroIcon name="staff" />
            {t('Zmeniť pracovnú pozíciu')}
          </button>
          <span className="menu-group-label">{t('Relácia')}</span>
          {tabs
            .filter((item) => item.visible !== false)
            .filter((item) =>
              ['sessions', 'driver', 'runtime', 'edd', 'tpv', 'mock', 'recovery'].includes(item.id),
            )
            .map((item) => (
              <button
                key={item.id}
                className={`menu-btn ${activeTab === item.id && !tool ? 'font-bold underline' : ''}`}
                disabled={!selectedPlace}
                onClick={() => openTab(item.id)}
              >
                <AeroIcon name={tabIcons[item.id]} /> {t(item.title)}
              </button>
            ))}
          <span className="menu-group-label">{t('Všeobecné')}</span>
          {tabs
            .filter(
              (item) =>
                item.visible !== false &&
                ['settings', 'shifts', 'staff', 'docs', 'gvd', 'preparation'].includes(item.id),
            )
            .map((item) => (
              <button
                key={item.id}
                className={`menu-btn ${activeTab === item.id && !tool ? 'font-bold underline' : ''}`}
                disabled={!['preparation', 'settings'].includes(item.id) && !selectedPlace}
                onClick={() => openTab(item.id)}
              >
                <AeroIcon name={tabIcons[item.id]} /> {t(item.title)}
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <DesktopDownloads />
            <LanguageSelector />
            <button
              className="aero-btn"
              onClick={() => {
                document.documentElement.classList.toggle('dark', !dark);
                setAppearance({ dark: !dark });
              }}
            >
              <AeroIcon name={dark ? 'sun' : 'moon'} />
              {dark ? t('Svetlý motív') : t('Tmavý motív')}
            </button>
            <button className="aero-btn" onClick={logout}>
              <AeroIcon name="logout" /> {t('Odhlásiť')}{' '}
            </button>
          </div>
        </nav>
        {!singlePlaceSessionMode && !['preparation', 'settings'].includes(activeTab) && !tool && (
          <div className="ribbon-bar flex-wrap">
            <label>
              {' '}
              {t('Sieť')}{' '}
              <select
                aria-label={t('Sieť')}
                className="aero-select max-w-80"
                value={placeId}
                disabled={placesLoading && !places.places.length}
                onChange={(event) => {
                  setPlaceChoice(event.target.value);
                  setScope(null);
                  setTool(null);
                  selectTab('sessions');
                  setSessionSearch('');
                }}
              >
                <option value="">{t('Vybrať sieť')}</option>
                {places.places.map((place) => (
                  <option key={place.placeId} value={place.placeId}>
                    {place.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedPlace && (
              <>
                <label>
                  {' '}
                  {t('Relácia')}{' '}
                  <select
                    aria-label={t('Aktívna relácia')}
                    className="aero-select max-w-80"
                    disabled={!selectedPlace}
                    value={current.sessionId}
                    onChange={(event) => {
                      const sessionId = event.target.value;
                      setScope({
                        sessionId,
                        stationId:
                          network.stations.find((station) => station.sessionId === sessionId)
                            ?.stationId || '',
                      });
                    }}
                  >
                    <option value="">{t('Vybrať reláciu')}</option>
                    {sessions.map((session) => (
                      <option key={session.sessionId} value={session.sessionId}>
                        {session.isLive ? '● ' : ''}
                        {session.createdAt
                          ? new Date(session.createdAt).toLocaleString(localeTag)
                          : t('Dátum neznámy')}{' '}
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
                  {showMore ? t('Len živé') : t('Zobraziť ďalšie')}
                </button>
                {showMore && (
                  <input
                    className="aero-input"
                    disabled={!selectedPlace}
                    aria-label={t('Hľadať reláciu podľa dátumu alebo ID')}
                    placeholder={t('Hľadať dátum alebo ID')}
                    value={sessionSearch}
                    onChange={(event) => setSessionSearch(event.target.value)}
                  />
                )}
                {hasSession && sessionStations.length > 0 && (
                  <label>
                    {' '}
                    {t('Stanica')}{' '}
                    <select
                      aria-label={t('Aktívna stanica')}
                      className="aero-select"
                      disabled={!selectedPlace || !current.sessionId}
                      value={workingMode === 'dispatcher' && !ownsStation ? '' : current.stationId}
                      onChange={(event) =>
                        setScope({ sessionId: current.sessionId, stationId: event.target.value })
                      }
                    >
                      <option value="">{t('Vybrať stanicu')}</option>
                      {sessionStations
                        .filter(
                          (station) =>
                            workingMode !== 'dispatcher' ||
                            ownClaims.some((claim) => claim.stationId === station.stationId),
                        )
                        .map((station) => (
                          <option key={station.stationId} value={station.stationId}>
                            {station.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        )}
        {activeTab !== 'preparation' && t(placesError) && (
          <p role="alert" className="p-2 text-red-700">
            {' '}
            {t('Siete sa nepodarilo načítať:')} {t(placesError)}
          </p>
        )}
        {activeTab !== 'preparation' && !places.placesComplete && (
          <p role="status" className="p-2">
            {' '}
            {t('Roblox nie je dostupný; zobrazené sú uložené siete.')}{' '}
          </p>
        )}
        {activeTab !== 'preparation' && t(networkError) && (
          <p role="alert" className="p-2 text-red-700">
            {t(networkError)}
          </p>
        )}
        <div className="workspace min-h-0">
          <main className="content-panel min-h-0 min-w-0">
            {!workingMode ? (
              <div className="working-mode-selection">
                <h1>{t('Vyberte pracovnú pozíciu')}</h1>
                <div className="working-mode-options">
                  {(['admin', 'dispatcher', 'driver'] as const).map((mode) => (
                    <button
                      key={mode}
                      className="aero-btn working-mode-choice"
                      disabled={!canUseWorkingMode(profile.role, mode)}
                      onClick={() => {
                        setWorkingMode(mode);
                        openTab(mode === 'driver' ? 'driver' : 'sessions');
                      }}
                    >
                      <AeroIcon
                        name={
                          mode === 'admin'
                            ? 'settings'
                            : mode === 'dispatcher'
                              ? 'network'
                              : 'train'
                        }
                        size={32}
                      />
                      <strong>
                        {t(
                          mode === 'admin'
                            ? 'Administratíva'
                            : mode === 'dispatcher'
                              ? 'Výpravca'
                              : 'Rušňovodič a vlakový personál',
                        )}
                      </strong>
                      <span>
                        {t(
                          mode === 'admin'
                            ? 'Správa, GVD a dokumenty'
                            : mode === 'dispatcher'
                              ? 'Výber stanice a riadenie dopravy'
                              : 'Môj vlak a cestovný poriadok',
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <p>{t(profile.role)}</p>
                <button className="aero-btn" onClick={logout}>
                  <AeroIcon name="logout" />
                  {t('Odhlásiť')}
                </button>
              </div>
            ) : (
              <>
                {tool && (
                  <JopEmbeddedView
                    {...tool}
                    onClose={() => setTool(null)}
                    onNavigate={navigateTool}
                  />
                )}
                {!tool && activeTab === 'preparation' && (
                  <NetworkPreparationView onOpenTool={(target) => launch(target, '')} />
                )}
                {!tool && activeTab === 'settings' && <SettingsView />}
                {!tool &&
                  !selectedPlace &&
                  activeTab !== 'settings' &&
                  activeTab !== 'preparation' && <p className="p-4">{t('Najprv vyberte sieť.')}</p>}
                {selectedPlace && (
                  <WorkspaceView
                    active={!tool && activeTab !== 'settings' && activeTab !== 'preparation'}
                  >
                    {visitedViews.sessions && (
                      <WorkspaceView active={activeTab === 'sessions'}>
                        {workingMode === 'dispatcher' ? (
                          <StationSelectionView
                            placeId={placeId}
                            sessionId={current.sessionId}
                            stations={sessionStations}
                            claims={control.claims}
                            userId={profile.userId}
                            canTakeOver={
                              isDisAdministrator(profile.role) && workingMode === 'dispatcher'
                            }
                            onSelect={launch}
                            error={claimError || claimsError || ''}
                          />
                        ) : (
                          <SessionControlView
                            key={placeId}
                            placeId={placeId}
                            showSessionControls={!singlePlaceSessionMode}
                            onLaunchRuntime={launch}
                            canLaunchSimulator={hasSession && canOperateStation}
                            canInspectInternalStations={isDisAdministrator(profile.role)}
                          />
                        )}
                      </WorkspaceView>
                    )}
                    {visitedViews.driver && hasSession && workingMode === 'driver' && (
                      <WorkspaceView active={activeTab === 'driver'}>
                        <DriverDashboardView
                          key={current.sessionId}
                          sessionId={current.sessionId}
                          onTrainChange={onDriverTrainChange}
                        />
                      </WorkspaceView>
                    )}
                    {!current.sessionId &&
                      ['runtime', 'edd', 'tpv', 'mock', 'recovery'].includes(activeTab) && (
                        <p className="p-4">{t('Najprv vyberte reláciu pre vybranú sieť.')}</p>
                      )}
                    {visitedViews.runtime &&
                      current.sessionId &&
                      canOperateStation &&
                      (workingMode === 'dispatcher' ||
                        (workingMode === 'admin' && isDisAdministrator(profile.role))) && (
                        <WorkspaceView active={activeTab === 'runtime'}>
                          {current.sessionId &&
                          current.stationId &&
                          (isDisAdministrator(profile.role) ||
                            (canOperateStation && ownsStation)) ? (
                            <>
                              <div
                                className="ribbon-bar flex-wrap"
                                role="group"
                                aria-label={t('Ovládané stanice')}
                              >
                                {ownClaims.map((claim) => (
                                  <span key={claim.stationId} className="station-control-tab">
                                    <button
                                      className="aero-btn"
                                      aria-pressed={claim.stationId === current.stationId}
                                      onClick={() =>
                                        setScope({
                                          sessionId: claim.sessionId,
                                          stationId: claim.stationId,
                                        })
                                      }
                                    >
                                      {sessionStations.find((s) => s.stationId === claim.stationId)
                                        ?.name || claim.stationId}
                                    </button>
                                    <button
                                      className="aero-btn"
                                      onClick={() => void releaseStation(claim.stationId)}
                                      aria-label={t('Uvoľniť stanicu {0}', claim.stationId)}
                                    >
                                      <AeroIcon name="close" />
                                    </button>
                                  </span>
                                ))}
                                <button className="aero-btn" onClick={() => openTab('sessions')}>
                                  <AeroIcon name="add" />
                                  {t('Ďalšia stanica')}
                                </button>
                              </div>
                              <RuntimeStationClient
                                key={scopeKey}
                                {...current}
                                embedded
                                readOnly={
                                  workingMode === 'admin' && isDisAdministrator(profile.role)
                                }
                              />
                            </>
                          ) : (
                            <StationSelectionView
                              placeId={placeId}
                              sessionId={current.sessionId}
                              stations={sessionStations}
                              claims={control.claims}
                              userId={profile.userId}
                              canTakeOver={
                                isDisAdministrator(profile.role) && workingMode === 'dispatcher'
                              }
                              onSelect={launch}
                              error={claimError || claimsError || ''}
                            />
                          )}
                        </WorkspaceView>
                      )}
                    {visitedViews.edd && current.sessionId && workingMode === 'dispatcher' && (
                      <div
                        className="flex flex-1 flex-col min-h-0 overflow-hidden"
                        hidden={activeTab !== 'edd'}
                        style={activeTab !== 'edd' ? { display: 'none' } : undefined}
                      >
                        {ownsStation ? (
                          <EddTableView
                            key={scopeKey}
                            {...current}
                            placeId={placeId}
                            active={activeTab === 'edd'}
                            reply={eddReply}
                            onOpenChat={(stationId) =>
                              setChatToOpen({ stationId, request: Date.now() })
                            }
                          />
                        ) : (
                          <p className="p-3">
                            {t('Pre prístup k EDD najprv prevezmite stanicu v riadení dopravy.')}
                          </p>
                        )}
                      </div>
                    )}
                    {visitedViews.tpv && current.sessionId && (
                      <div
                        className="flex flex-1 flex-col min-h-0 overflow-hidden"
                        hidden={activeTab !== 'tpv'}
                        style={activeTab !== 'tpv' ? { display: 'none' } : undefined}
                      >
                        <TpvFullView
                          key={scopeKey}
                          {...current}
                          placeId={placeId}
                          active={activeTab === 'tpv'}
                        />
                      </div>
                    )}
                    {visitedViews.shifts && (
                      <WorkspaceView active={activeTab === 'shifts'}>
                        <ShiftManagementView />
                      </WorkspaceView>
                    )}
                    {!tool &&
                      activeTab === 'staff' &&
                      canManageStaff &&
                      workingMode === 'admin' && <StaffManagementView />}
                    {!tool && activeTab === 'docs' && <DocumentCenterView />}
                    {!tool && activeTab === 'gvd' && canCreateGvd && workingMode === 'admin' && (
                      <GvdEditorView
                        key={placeId}
                        place={selectedPlace}
                        sessionId={current.sessionId}
                      />
                    )}
                    {visitedViews.recovery &&
                      workingMode === 'admin' &&
                      current.sessionId &&
                      isDisAdministrator(profile.role) && (
                        <WorkspaceView active={activeTab === 'recovery'}>
                          <RecoveryView
                            key={current.sessionId}
                            sessionId={current.sessionId}
                            stations={network.stations}
                          />
                        </WorkspaceView>
                      )}
                    {visitedViews.mock &&
                      current.sessionId &&
                      canOperateStation &&
                      workingMode === 'admin' && (
                        <WorkspaceView active={activeTab === 'mock'}>
                          <div className="dis-simulator flex-1 overflow-auto p-3">
                            <Suspense fallback={<p> {t('Načítavam simulátor...')} </p>}>
                              <MockControlClient
                                key={current.sessionId}
                                onSessionChange={(sessionId) =>
                                  setScope({
                                    sessionId,
                                    stationId:
                                      network.stations.find(
                                        (station) => station.sessionId === sessionId,
                                      )?.stationId || '',
                                  })
                                }
                                embedded
                                initialSessionId={current.sessionId}
                                onLaunch={launch}
                              />
                            </Suspense>
                          </div>
                        </WorkspaceView>
                      )}
                  </WorkspaceView>
                )}
              </>
            )}
          </main>
          {hasSession && workingMode && activeTab !== 'preparation' && (
            <ResizablePanel
              id="communication"
              title={t('Komunikácia')}
              edge="right"
              defaultSize={350}
              responsive
            >
              <SessionChatView
                key={`${current.sessionId}/${workingMode}/${workingMode === 'dispatcher' && ownsStation ? current.stationId : 'self'}`}
                sessionId={current.sessionId}
                stationId={workingMode === 'dispatcher' && ownsStation ? current.stationId : ''}
                contactToOpen={chatToOpen}
                onEddReply={(reply) => {
                  setEddReply(reply);
                  selectTab('edd');
                }}
                driverTrain={
                  driverSelection?.sessionId === current.sessionId
                    ? driverSelection.train
                    : undefined
                }
              />
            </ResizablePanel>
          )}
        </div>
        <div className="statusbar">
          <a
            className="status-item"
            href="https://www.fatcow.com/free-icons"
            target="_blank"
            rel="noopener noreferrer"
            title={t('Farm-Fresh icons © FatCow Web Hosting · CC BY 3.0')}
          >
            {' '}
            {t('Ikony: FatCow')}{' '}
          </a>
          <span className="status-item">{t(profile.role)}</span>
          {hasStation && (
            <span className="status-item">
              {t('Stanica:')}{' '}
              {sessionStations.find((station) => station.stationId === current.stationId)?.name ||
                t('nevybraná')}
            </span>
          )}
          <span className="status-item">
            {networkError ? t('Chyba načítania siete') : t('Stanice: {0}', network.stations.length)}
          </span>
        </div>
      </div>
    </TrainWorkspace>
  );
}
export default function DisPortalPage() {
  return (
    <DisAuthProvider>
      <DisPortalShell />
    </DisAuthProvider>
  );
}
