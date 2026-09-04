'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type {
  PlaceTemplateDocument,
  SessionDocument,
  SessionLineblockLink,
  SessionSchemaDocument,
  StationDocument,
} from '@/lib/station/domain';
import type { StationLayout } from '@/lib/station/layout';

import StationTopologyBoard from './StationTopologyBoard';

function getLineblockPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => piece.type === 'lineblock')
    .map(([pieceId]) => pieceId)
    .sort();
}

function getPremainSignalPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => piece.type === 'premainSignal' || piece.type === 'premainSignalNoOcp')
    .map(([pieceId]) => pieceId)
    .sort();
}

function getLineblockDefaultFlowLabel(link: SessionLineblockLink) {
  if (link.defaultFlow === 'a-receiving') {
    return `${link.a.stationId} receiving`;
  }
  if (link.defaultFlow === 'b-receiving') {
    return `${link.b.stationId} receiving`;
  }
  return 'Neutral';
}

export default function SessionMapClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('sessionId')?.trim() ?? '';
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [stations, setStations] = useState<StationDocument[]>([]);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionIdDraft, setSessionIdDraft] = useState('');
  const [stationIdDraft, setStationIdDraft] = useState('station-a');
  const [universeIdDraft, setUniverseIdDraft] = useState('');
  const [placeIdDraft, setPlaceIdDraft] = useState('');
  const [savedPlaceTemplate, setSavedPlaceTemplate] = useState<PlaceTemplateDocument | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [stationOrder, setStationOrder] = useState<string[]>([]);
  const [pendingLineblockEndpoint, setPendingLineblockEndpoint] = useState<{
    stationId: string;
    pieceId: string;
  } | null>(null);
  const [lineblockDefaultFlow, setLineblockDefaultFlow] =
    useState<SessionLineblockLink['defaultFlow']>('neutral');
  const stationLayoutInputRef = useRef<HTMLInputElement | null>(null);
  const sessionSchemaInputRef = useRef<HTMLInputElement | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.stationId === selectedStationId) ?? null,
    [selectedStationId, stations],
  );

  function openSession(nextSessionId: string) {
    router.replace(`/map?sessionId=${encodeURIComponent(nextSessionId)}`);
  }

  async function refreshSession(nextSessionId: string) {
    const [sessionResponse, stationsResponse] = await Promise.all([
      fetch(`/api/sessions/${nextSessionId}`, { cache: 'no-store' }),
      fetch(`/api/sessions/${nextSessionId}/stations`, { cache: 'no-store' }),
    ]);

    const sessionPayload = (await sessionResponse.json()) as
      { session: SessionDocument } | { error?: { message?: string } };
    const stationsPayload = (await stationsResponse.json()) as
      { stations: StationDocument[] } | { error?: { message?: string } };

    if (!sessionResponse.ok || !('session' in sessionPayload)) {
      throw new Error(
        'error' in sessionPayload
          ? (sessionPayload.error?.message ?? 'Failed to load session.')
          : 'Failed to load session.',
      );
    }

    if (!stationsResponse.ok || !('stations' in stationsPayload)) {
      throw new Error(
        'error' in stationsPayload
          ? (stationsPayload.error?.message ?? 'Failed to load session stations.')
          : 'Failed to load session stations.',
      );
    }

    setSession(sessionPayload.session);
    setStations(stationsPayload.stations);

    const nextSelectedStationId =
      selectedStationId &&
      stationsPayload.stations.some((station) => station.stationId === selectedStationId)
        ? selectedStationId
        : (stationsPayload.stations[0]?.stationId ?? '');
    setSelectedStationId(nextSelectedStationId);

    setStationOrder((current) => {
      const existing = current.filter((stationId) =>
        stationsPayload.stations.some((station) => station.stationId === stationId),
      );
      const added = stationsPayload.stations
        .map((station) => station.stationId)
        .filter((stationId) => !existing.includes(stationId));
      return [...existing, ...added];
    });
  }

  const refreshSessionEvent = useEffectEvent(async (nextSessionId: string) => {
    await refreshSession(nextSessionId);
  });

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        if (!sessionIdFromUrl) {
          if (!active) {
            return;
          }

          setSession(null);
          setStations([]);
          setSelectedStationId('');
          setError(null);
          return;
        }

        await refreshSessionEvent(sessionIdFromUrl);
        if (active) {
          setError(null);
        }
      } catch (bootstrapError) {
        if (!active) {
          return;
        }

        setError(
          bootstrapError instanceof Error ? bootstrapError.message : 'Failed to load map session.',
        );
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [sessionIdFromUrl]);

  async function createMockSession() {
    setIsBusy(true);
    try {
      const response = await fetch('/api/sessions/mock', {
        method: 'POST',
      });
      const payload = (await response.json()) as
        { session: SessionDocument } | { error?: { message?: string } };
      if (!response.ok || !('session' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to create session.')
            : 'Failed to create session.',
        );
      }
      openSession(payload.session._id);
      setError(null);
    } catch (createSessionError) {
      setError(
        createSessionError instanceof Error
          ? createSessionError.message
          : 'Failed to create session.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function createStation(layout?: StationLayout) {
    if (!session?._id || !stationIdDraft.trim()) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch('/api/stations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session._id,
          stationId: stationIdDraft.trim(),
          layout,
        }),
      });

      const payload = (await response.json()) as
        { station: StationDocument } | { error?: { message?: string } };

      if (!response.ok || !('station' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to create station.')
            : 'Failed to create station.',
        );
      }

      await refreshSession(session._id);
      setSelectedStationId(payload.station.stationId);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create station.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportStationLayout(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    try {
      const parsedLayout = JSON.parse(await file.text()) as StationLayout;
      await createStation(parsedLayout);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : 'Failed to import station JSON.',
      );
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  async function createInterStationLineblockLink(
    a: { stationId: string; pieceId: string },
    b: { stationId: string; pieceId: string },
  ) {
    if (!session?._id) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/lineblock-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session._id,
          a,
          b,
          defaultFlow: lineblockDefaultFlow,
        }),
      });

      const payload = (await response.json()) as
        { link: SessionLineblockLink } | { error?: { message?: string } };

      if (!response.ok || !('link' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to create lineblock link.')
            : 'Failed to create lineblock link.',
        );
      }

      await refreshSession(session._id);
      setError(null);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Failed to create lineblock link.');
    } finally {
      setIsBusy(false);
    }
  }

  async function updateLineblockDefaultFlow(
    linkId: string,
    defaultFlow: SessionLineblockLink['defaultFlow'],
  ) {
    if (!session?._id) return;

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/lineblock-links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultFlow }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Failed to update lineblock direction.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update lineblock direction.');
    } finally {
      setIsBusy(false);
    }
  }

  async function removeLineblockLink(link: SessionLineblockLink) {
    if (!session?._id || !window.confirm(`Remove the link between ${link.a.stationId} and ${link.b.stationId}?`)) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/lineblock-links/${link.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Failed to remove lineblock link.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove lineblock link.');
    } finally {
      setIsBusy(false);
    }
  }

  async function renameStation(stationId: string) {
    if (!session?._id) return;
    const nextStationId = window.prompt('Station ID', stationId)?.trim();
    if (!nextStationId || nextStationId === stationId) return;

    setIsBusy(true);
    try {
      const response = await fetch(`/api/stations/${session._id}/${encodeURIComponent(stationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: nextStationId }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Failed to rename station.');
      }
      setStationOrder((current) => current.map((id) => (id === stationId ? nextStationId : id)));
      setSelectedStationId(nextStationId);
      await refreshSession(session._id);
      setError(null);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Failed to rename station.');
    } finally {
      setIsBusy(false);
    }
  }

  async function removeStation(stationId: string) {
    if (!session?._id || !window.confirm(`Remove station ${stationId} and all of its lineblock links?`)) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/stations/${session._id}/${encodeURIComponent(stationId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Failed to remove station.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove station.');
    } finally {
      setIsBusy(false);
    }
  }

  function handleLineblockSelect(endpoint: { stationId: string; pieceId: string }) {
    if (!pendingLineblockEndpoint) {
      setPendingLineblockEndpoint(endpoint);
      setError(null);
      return;
    }

    if (
      pendingLineblockEndpoint.stationId === endpoint.stationId &&
      pendingLineblockEndpoint.pieceId === endpoint.pieceId
    ) {
      setPendingLineblockEndpoint(null);
      return;
    }

    const pending = pendingLineblockEndpoint;
    setPendingLineblockEndpoint(null);
    void createInterStationLineblockLink(pending, endpoint);
  }

  function moveStation(stationId: string, direction: -1 | 1) {
    setStationOrder((current) => {
      const index = current.indexOf(stationId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  const orderedStations = useMemo(
    () =>
      stationOrder
        .map((stationId) => stations.find((station) => station.stationId === stationId))
        .filter((station): station is StationDocument => Boolean(station)),
    [stationOrder, stations],
  );

  async function exportSessionSchema() {
    if (!session?._id) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/schema`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as
        { schema: SessionSchemaDocument } | { error?: { message?: string } };
      if (!response.ok || !('schema' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to export session schema.')
            : 'Failed to export session schema.',
        );
      }

      const blob = new Blob([JSON.stringify(payload.schema, null, 2)], {
        type: 'application/json',
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `${session._id}-schema.json`;
      anchor.click();
      URL.revokeObjectURL(href);
      setError(null);
    } catch (schemaError) {
      setError(
        schemaError instanceof Error ? schemaError.message : 'Failed to export session schema.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function savePlaceTemplate() {
    if (!session?._id || !universeIdDraft.trim() || !placeIdDraft.trim()) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(
        `/api/roblox/place-templates/${encodeURIComponent(placeIdDraft.trim())}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session._id, universeId: universeIdDraft.trim() }),
        },
      );
      const payload = (await response.json()) as
        { template: PlaceTemplateDocument } | { error?: { message?: string } };
      if (!response.ok || !('template' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to save Roblox place template.')
            : 'Failed to save Roblox place template.',
        );
      }
      setSavedPlaceTemplate(payload.template);
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Failed to save Roblox place template.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function loadPlaceTemplate() {
    if (!universeIdDraft.trim() || !placeIdDraft.trim()) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(
        `/api/roblox/place-templates/${encodeURIComponent(placeIdDraft.trim())}?universeId=${encodeURIComponent(universeIdDraft.trim())}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as
        { template: PlaceTemplateDocument } | { error?: { message?: string } };
      if (!response.ok || !('template' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to load Roblox map template.')
            : 'Failed to load Roblox map template.',
        );
      }

      const importResponse = await fetch('/api/sessions/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.template.schema),
      });
      const imported = (await importResponse.json()) as
        { session: SessionDocument } | { error?: { message?: string } };
      if (!importResponse.ok || !('session' in imported)) {
        throw new Error(
          'error' in imported
            ? (imported.error?.message ?? 'Failed to open map template for editing.')
            : 'Failed to open map template for editing.',
        );
      }

      setSavedPlaceTemplate(payload.template);
      openSession(imported.session._id);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load Roblox map template.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportSessionSchema(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    try {
      const schema = JSON.parse(await file.text()) as SessionSchemaDocument;
      const response = await fetch('/api/sessions/schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(schema),
      });
      const payload = (await response.json()) as
        { session: SessionDocument } | { error?: { message?: string } };
      if (!response.ok || !('session' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to import session schema.')
            : 'Failed to import session schema.',
        );
      }
      openSession(payload.session._id);
      setError(null);
    } catch (schemaError) {
      setError(
        schemaError instanceof Error ? schemaError.message : 'Failed to import session schema.',
      );
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  function handleOpenExistingSession() {
    if (!sessionIdDraft.trim()) {
      return;
    }

    openSession(sessionIdDraft.trim());
  }

  if (!sessionIdFromUrl) {
    return (
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="text-sm text-neutral-400">
          Open an existing session, create a new one, or import a saved map schema.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,240px)_auto_auto]">
          <input
            value={sessionIdDraft}
            onChange={(event) => setSessionIdDraft(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-amber-400"
            placeholder="mock-ab12cd34"
          />
          <button
            type="button"
            disabled={!sessionIdDraft.trim()}
            onClick={handleOpenExistingSession}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open Session
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void createMockSession()}
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Session
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => sessionSchemaInputRef.current?.click()}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import Map Schema
          </button>
          <Link
            href="/editor"
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white"
          >
            Open Station Editor
          </Link>
        </div>
        <div className="mt-4 grid gap-3 border-t border-neutral-800 pt-4 md:grid-cols-[minmax(0,220px)_minmax(0,220px)_auto]">
          <div className="md:col-span-3 text-sm font-medium text-neutral-200">Open saved Roblox configuration</div>
          <input
            value={universeIdDraft}
            onChange={(event) => setUniverseIdDraft(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 font-mono text-sm text-neutral-100 outline-none transition focus:border-amber-400"
            placeholder="Roblox UniverseId"
          />
          <input
            value={placeIdDraft}
            onChange={(event) => setPlaceIdDraft(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 font-mono text-sm text-neutral-100 outline-none transition focus:border-amber-400"
            placeholder="Roblox PlaceId"
          />
          <button
            type="button"
            disabled={isBusy || !universeIdDraft || !placeIdDraft}
            onClick={() => void loadPlaceTemplate()}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load Template To Edit
          </button>
        </div>
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
        <input
          ref={sessionSchemaInputRef}
          type="file"
          accept="application/json"
          onChange={(event) => void handleImportSessionSchema(event)}
          className="hidden"
        />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-neutral-400">
            {session ? `Map session ${session._id} active.` : 'Loading map session...'}
          </div>
          {session ? (
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/mock?sessionId=${encodeURIComponent(session._id)}`}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white"
              >
                Open Mock Simulator
              </Link>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void exportSessionSchema()}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export Map Schema
              </button>
            </div>
          ) : null}
        </div>
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Roblox Place Template
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          Enter a UniverseId and PlaceId, then load the saved configuration to edit it. Save Template
          writes your current stations and links back to that Roblox place.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,260px)_auto_auto]">
          <input
            value={universeIdDraft}
            onChange={(event) => setUniverseIdDraft(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 font-mono text-sm text-neutral-100 outline-none transition focus:border-amber-400"
            placeholder="Roblox UniverseId"
          />
          <input
            value={placeIdDraft}
            onChange={(event) => setPlaceIdDraft(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 font-mono text-sm text-neutral-100 outline-none transition focus:border-amber-400"
            placeholder="Roblox PlaceId"
          />
          <button
            type="button"
            disabled={isBusy || !session?._id || !universeIdDraft || !placeIdDraft}
            onClick={() => void savePlaceTemplate()}
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Template
          </button>
          <button
            type="button"
            disabled={isBusy || !universeIdDraft || !placeIdDraft}
            onClick={() => void loadPlaceTemplate()}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load Template To Edit
          </button>
        </div>
        {savedPlaceTemplate ? (
          <p className="mt-3 text-xs text-emerald-300">
            UniverseId {savedPlaceTemplate.universeId} / PlaceId {savedPlaceTemplate.placeId} saved
            at revision {savedPlaceTemplate.revision}.
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Stations In Session
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,220px)_auto_auto]">
          <input
            value={stationIdDraft}
            onChange={(event) => setStationIdDraft(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-amber-400"
            placeholder="station-b"
          />
          <button
            type="button"
            disabled={isBusy || !session?._id}
            onClick={() => void createStation()}
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Station
          </button>
          <button
            type="button"
            disabled={isBusy || !session?._id}
            onClick={() => stationLayoutInputRef.current?.click()}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import Station JSON
          </button>
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          Click a lineblock, then click a lineblock in another station to connect them. Use the station
          controls to rename or remove a station.
        </p>
        {pendingLineblockEndpoint ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            <span>
              Connecting from <span className="font-mono">{pendingLineblockEndpoint.stationId}:{pendingLineblockEndpoint.pieceId}</span> — now click the destination lineblock.
            </span>
            <button
              type="button"
              onClick={() => setPendingLineblockEndpoint(null)}
              className="rounded-full border border-amber-300/60 px-3 py-1 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        ) : null}
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {orderedStations.length === 0 ? (
            <p className="text-sm text-neutral-500">No stations yet.</p>
          ) : (
            orderedStations.map((station, index) => (
              <article
                key={station.stationId}
                className={`w-[min(34rem,85vw)] shrink-0 rounded-2xl border p-3 ${
                  station.stationId === selectedStationId
                    ? 'border-amber-400 bg-neutral-950/90'
                    : 'border-neutral-800 bg-neutral-950/70'
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedStationId(station.stationId)}
                    className="font-mono text-sm text-neutral-100"
                  >
                    {index + 1}. {station.stationId}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveStation(station.stationId, -1)}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 disabled:opacity-40"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedStations.length - 1}
                      onClick={() => moveStation(station.stationId, 1)}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 disabled:opacity-40"
                    >
                      →
                    </button>
                    <Link
                      href={session ? `/runtime/${session._id}/${station.stationId}` : '#'}
                      className="rounded-full bg-amber-400 px-3 py-1 text-xs font-medium text-neutral-950"
                    >
                      Runtime
                    </Link>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void renameStation(station.stationId)}
                      className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 disabled:opacity-40"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void removeStation(station.stationId)}
                      className="rounded-full border border-red-900 px-3 py-1 text-xs text-red-300 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <StationTopologyBoard
                  station={station}
                  pendingEndpoint={pendingLineblockEndpoint}
                  onLineblockSelect={handleLineblockSelect}
                />
              </article>
            ))
          )}
        </div>
        <input
          ref={stationLayoutInputRef}
          type="file"
          accept="application/json"
          onChange={(event) => void handleImportStationLayout(event)}
          className="hidden"
        />
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Inter-station lineblock links
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          This only chooses the initial direction for the next link you create. Each existing link can be
          changed independently below.
        </p>
        <div className="mt-3 max-w-sm">
          <select
            value={lineblockDefaultFlow}
            onChange={(event) =>
              setLineblockDefaultFlow(event.target.value as SessionLineblockLink['defaultFlow'])
            }
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
          >
            <option value="neutral">New link: neutral</option>
            <option value="a-receiving">New link: endpoint A receiving</option>
            <option value="b-receiving">New link: endpoint B receiving</option>
          </select>
        </div>
        <div className="mt-4 space-y-3">
          {Object.values(session?.topology.lineblockLinks ?? {}).length === 0 ? (
            <p className="text-sm text-neutral-500">No inter-station lineblock links configured.</p>
          ) : (
            Object.values(session?.topology.lineblockLinks ?? {}).map((link) => (
              <div
                key={link.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3"
              >
                <div className="text-sm font-medium text-neutral-100">
                  {link.a.stationId}:{link.a.pieceId} {'<->'} {link.b.stationId}:{link.b.pieceId}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <select
                    value={link.defaultFlow}
                    disabled={isBusy}
                    onChange={(event) =>
                      void updateLineblockDefaultFlow(
                        link.id,
                        event.target.value as SessionLineblockLink['defaultFlow'],
                      )
                    }
                    className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-100 disabled:opacity-40"
                    aria-label={`Default receiving station for ${link.a.stationId} and ${link.b.stationId}`}
                  >
                    <option value="neutral">Neutral</option>
                    <option value="a-receiving">{link.a.stationId} receiving</option>
                    <option value="b-receiving">{link.b.stationId} receiving</option>
                  </select>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void removeLineblockLink(link)}
                    className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-300 disabled:opacity-40"
                  >
                    Remove link
                  </button>
                  <div className="text-xs text-neutral-500">
                    {getLineblockDefaultFlowLabel(link)} / {link.createdAt}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Selected Station Summary
        </h2>
        <div className="mt-4">
          {selectedStation ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <div className="font-mono text-sm text-neutral-100">{selectedStation.stationId}</div>
              <div className="mt-2 text-xs text-neutral-500">
                {selectedStation.layout.width}x{selectedStation.layout.height}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {getLineblockPieceIds(selectedStation).map((pieceId) => (
                  <span
                    key={pieceId}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300"
                  >
                    {pieceId}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {getPremainSignalPieceIds(selectedStation).map((pieceId) => (
                  <span
                    key={pieceId}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300"
                  >
                    premain:{pieceId}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Select a station to inspect it.</p>
          )}
        </div>
      </section>
    </div>
  );
}
