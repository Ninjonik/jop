'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type {
  PlaceTemplateDocument,
  PlaceTemplateSummary,
  SessionDocument,
  SessionLineblockLink,
  SessionSchemaDocument,
  StationDocument,
} from '@/lib/station/domain';
import { stationIdSchema } from '@/lib/station/domain';
import { isLineblockPieceType, type StationLayout } from '@/lib/station/layout';

import { isPublicStation } from '@/lib/station/visibility';
import StationNetworkCanvas from './StationNetworkCanvas';

function getLineblockPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => isLineblockPieceType(piece.type))
    .map(([pieceId]) => pieceId)
    .sort();
}

export default function SessionMapClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('sessionId')?.trim() ?? '';
  const universeIdFromUrl = searchParams.get('universeId')?.trim() ?? '';
  const placeIdFromUrl = searchParams.get('placeId')?.trim() ?? '';
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [stations, setStations] = useState<StationDocument[]>([]);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionIdDraft, setSessionIdDraft] = useState('');
  const [stationIdDraft, setStationIdDraft] = useState('');
  const [universeIdDraft, setUniverseIdDraft] = useState(universeIdFromUrl);
  const [placeIdDraft, setPlaceIdDraft] = useState(placeIdFromUrl);
  const [savedPlaceTemplate, setSavedPlaceTemplate] = useState<PlaceTemplateDocument | null>(null);
  const [savedPlaceTemplates, setSavedPlaceTemplates] = useState<
    (PlaceTemplateSummary & { name?: string | null })[]
  >([]);
  const [destinations, setDestinations] = useState<
    { universeId: string; placeId: string; name: string }[]
  >([]);
  const [namesComplete, setNamesComplete] = useState(true);
  const [savedPlaceTemplatesLoading, setSavedPlaceTemplatesLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [stationOrder, setStationOrder] = useState<string[]>([]);
  const [pendingLineblockEndpoint, setPendingLineblockEndpoint] = useState<{
    stationId: string;
    pieceId: string;
  } | null>(null);
  const [lineblockDefaultFlow, setLineblockDefaultFlow] =
    useState<SessionLineblockLink['defaultFlow']>('neutral');
  const [tab, setTab] = useState<'stations' | 'links' | 'save'>('stations');
  const [stationSearch, setStationSearch] = useState('');
  const [linkFrom, setLinkFrom] = useState('');
  const [linkTo, setLinkTo] = useState('');
  const [notice, setNotice] = useState('');
  const stationLayoutInputRef = useRef<HTMLInputElement | null>(null);
  const sessionSchemaInputRef = useRef<HTMLInputElement | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.stationId === selectedStationId) ?? null,
    [selectedStationId, stations],
  );

  useEffect(() => {
    let active = true;

    void fetch('/api/roblox/place-templates', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as
          | {
              templates: (PlaceTemplateSummary & { name?: string | null })[];
              destinations: { universeId: string; placeId: string; name: string }[];
              namesComplete: boolean;
            }
          | { error?: { message?: string } };
        if (!response.ok || !('templates' in payload)) {
          throw new Error(
            'error' in payload
              ? (payload.error?.message ?? 'Nepodarilo sa načítať uložené siete.')
              : 'Nepodarilo sa načítať uložené siete.',
          );
        }
        if (active) {
          setSavedPlaceTemplates(payload.templates);
          setDestinations(payload.destinations);
          setNamesComplete(payload.namesComplete);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'Nepodarilo sa načítať uložené siete.',
          );
        }
      })
      .finally(() => {
        if (active) {
          setSavedPlaceTemplatesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function openSession(
    nextSessionId: string,
    templateIdentity?: { universeId: string; placeId: string },
  ) {
    const params = new URLSearchParams({ sessionId: nextSessionId });
    if (templateIdentity) {
      params.set('universeId', templateIdentity.universeId);
      params.set('placeId', templateIdentity.placeId);
    }
    router.replace(`/map?${params.toString()}`);
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
          ? (sessionPayload.error?.message ?? 'Nepodarilo sa načítať sieť.')
          : 'Nepodarilo sa načítať sieť.',
      );
    }

    if (!stationsResponse.ok || !('stations' in stationsPayload)) {
      throw new Error(
        'error' in stationsPayload
          ? (stationsPayload.error?.message ?? 'Nepodarilo sa načítať stanice.')
          : 'Nepodarilo sa načítať stanice.',
      );
    }

    setSession(sessionPayload.session);
    setStations(stationsPayload.stations);

    const nextSelectedStationId =
      selectedStationId &&
      stationsPayload.stations.some(
        (station) => station.stationId === selectedStationId && isPublicStation(station.stationId),
      )
        ? selectedStationId
        : (stationsPayload.stations.find((station) => isPublicStation(station.stationId))
            ?.stationId ?? '');
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
          bootstrapError instanceof Error ? bootstrapError.message : 'Nepodarilo sa otvoriť sieť.',
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
            ? (payload.error?.message ?? 'Nepodarilo sa vytvoriť sieť.')
            : 'Nepodarilo sa vytvoriť sieť.',
        );
      }
      openSession(payload.session._id);
      setError(null);
    } catch (createSessionError) {
      setError(
        createSessionError instanceof Error
          ? createSessionError.message
          : 'Nepodarilo sa vytvoriť sieť.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function createStation(layout?: StationLayout) {
    if (!session?._id || !stationIdDraft.trim()) {
      return;
    }

    if (!stationIdSchema.safeParse(stationIdDraft).success) {
      setError(
        'Názov môže mať najviac 64 znakov. Použite písmená bez diakritiky, číslice, pomlčky alebo podčiarkovníky.',
      );
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
            ? (payload.error?.message ?? 'Nepodarilo sa pridať stanicu.')
            : 'Nepodarilo sa pridať stanicu.',
        );
      }

      await refreshSession(session._id);
      setSelectedStationId(payload.station.stationId);
      setStationIdDraft('');
      setNotice(
        `Stanica ${payload.station.stationId} bola pridaná. Koľajisko môžete upraviť v editore.`,
      );
      setError(null);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Nepodarilo sa pridať stanicu.',
      );
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
        importError instanceof Error
          ? importError.message
          : 'Súbor stanice sa nepodarilo načítať. Vyberte plán exportovaný z editora.',
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
            ? (payload.error?.message ?? 'Stanice sa nepodarilo prepojiť.')
            : 'Stanice sa nepodarilo prepojiť.',
        );
      }

      await refreshSession(session._id);
      setLinkFrom('');
      setLinkTo('');
      setNotice(`Stanice ${a.stationId} a ${b.stationId} boli prepojené.`);
      setError(null);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Stanice sa nepodarilo prepojiť.');
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
        throw new Error(payload.error?.message ?? 'Nepodarilo sa zmeniť počiatočný smer trate.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Nepodarilo sa zmeniť počiatočný smer trate.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function removeLineblockLink(link: SessionLineblockLink) {
    if (
      !session?._id ||
      !window.confirm(`Odstrániť prepojenie medzi ${link.a.stationId} a ${link.b.stationId}?`)
    ) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/lineblock-links/${link.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Nepodarilo sa odstrániť prepojenie.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : 'Nepodarilo sa odstrániť prepojenie.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function renameStation(stationId: string) {
    if (!session?._id) return;
    const nextStationId = window.prompt('Nový názov stanice', stationId)?.trim();
    if (!nextStationId || nextStationId === stationId) return;
    if (!stationIdSchema.safeParse(nextStationId).success) {
      setError(
        'Použite názov bez medzier a diakritiky, najviac 64 znakov. Slová môžete oddeliť pomlčkou.',
      );
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(
        `/api/stations/${session._id}/${encodeURIComponent(stationId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationId: nextStationId }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Stanicu sa nepodarilo premenovať.');
      }
      setStationOrder((current) => current.map((id) => (id === stationId ? nextStationId : id)));
      setSelectedStationId(nextStationId);
      await refreshSession(session._id);
      setError(null);
    } catch (renameError) {
      setError(
        renameError instanceof Error ? renameError.message : 'Stanicu sa nepodarilo premenovať.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function removeStation(stationId: string) {
    if (
      !session?._id ||
      !window.confirm(`Odstrániť stanicu ${stationId} aj všetky jej prepojenia?`)
    ) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(
        `/api/stations/${session._id}/${encodeURIComponent(stationId)}`,
        {
          method: 'DELETE',
        },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? 'Stanicu sa nepodarilo odstrániť.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : 'Stanicu sa nepodarilo odstrániť.',
      );
    } finally {
      setIsBusy(false);
    }
  }

  function handleLineblockSelect(endpoint: { stationId: string; pieceId: string }) {
    if (isBusy) return;
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
    if (pending.stationId === endpoint.stationId) {
      setError('Vyberte traťový súhlas v inej stanici.');
      return;
    }
    setPendingLineblockEndpoint(null);
    void createInterStationLineblockLink(pending, endpoint);
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
            ? (payload.error?.message ?? 'Zálohu siete sa nepodarilo stiahnuť.')
            : 'Zálohu siete sa nepodarilo stiahnuť.',
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
        schemaError instanceof Error ? schemaError.message : 'Zálohu siete sa nepodarilo stiahnuť.',
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
            ? (payload.error?.message ?? 'Sieť sa nepodarilo uložiť.')
            : 'Sieť sa nepodarilo uložiť.',
        );
      }
      setSavedPlaceTemplate(payload.template);
      setNotice('Sieť bola uložená.');
      setSavedPlaceTemplates((current) => [
        payload.template,
        ...current.filter((template) => template._id !== payload.template._id),
      ]);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Sieť sa nepodarilo uložiť.');
    } finally {
      setIsBusy(false);
    }
  }

  async function loadPlaceTemplate(
    templateIdentity?: Pick<PlaceTemplateSummary, 'universeId' | 'placeId'>,
  ) {
    const universeId = templateIdentity?.universeId ?? universeIdDraft.trim();
    const placeId = templateIdentity?.placeId ?? placeIdDraft.trim();
    if (!universeId || !placeId) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(
        `/api/roblox/place-templates/${encodeURIComponent(placeId)}?universeId=${encodeURIComponent(universeId)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as
        { template: PlaceTemplateDocument } | { error?: { message?: string } };
      if (!response.ok || !('template' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Sieť sa nepodarilo načítať.')
            : 'Sieť sa nepodarilo načítať.',
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
            ? (imported.error?.message ?? 'Konfiguráciu sa nepodarilo otvoriť na úpravu.')
            : 'Konfiguráciu sa nepodarilo otvoriť na úpravu.',
        );
      }

      setSavedPlaceTemplate(payload.template);
      setUniverseIdDraft(payload.template.universeId);
      setPlaceIdDraft(payload.template.placeId);
      openSession(imported.session._id, {
        universeId: payload.template.universeId,
        placeId: payload.template.placeId,
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Sieť sa nepodarilo načítať.');
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
            ? (payload.error?.message ??
                'Súbor siete sa nepodarilo načítať. Vyberte zálohu exportovanú zo správcu.')
            : 'Súbor siete sa nepodarilo načítať. Vyberte zálohu exportovanú zo správcu.',
        );
      }
      openSession(payload.session._id);
      setError(null);
    } catch (schemaError) {
      setError(
        schemaError instanceof Error
          ? schemaError.message
          : 'Súbor siete sa nepodarilo načítať. Vyberte zálohu exportovanú zo správcu.',
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

  const links = Object.values(session?.topology.lineblockLinks ?? {}).filter(
    (link) => isPublicStation(link.a.stationId) && isPublicStation(link.b.stationId),
  );
  const endpoints = orderedStations
    .filter((station) => isPublicStation(station.stationId))
    .flatMap((station) =>
      getLineblockPieceIds(station).map((pieceId) => ({
        stationId: station.stationId,
        pieceId,
        label:
          station.layout.pieces[pieceId].state.texts.name ||
          Object.values(station.layout.pieces[pieceId].state.texts).find((text) => text.trim()) ||
          pieceId,
      })),
    );
  const visibleStations = orderedStations.filter(
    (station) =>
      isPublicStation(station.stationId) &&
      station.stationId.toLocaleLowerCase().includes(stationSearch.toLocaleLowerCase()),
  );
  const selectedDestination = destinations.find(
    (destination) =>
      destination.universeId === universeIdDraft && destination.placeId === placeIdDraft,
  );
  const templateFields = (
    <label className="grid max-w-lg gap-1">
      Uložiť pre
      <select
        className="aero-select w-full"
        aria-label="Uložiť pre"
        value={selectedDestination ? JSON.stringify([universeIdDraft, placeIdDraft]) : ''}
        onChange={(event) => {
          const destination = destinations.find(
            (item) => JSON.stringify([item.universeId, item.placeId]) === event.target.value,
          );
          if (destination) {
            setUniverseIdDraft(destination.universeId);
            setPlaceIdDraft(destination.placeId);
          }
        }}
      >
        <option value="">Vyberte zo zoznamu</option>
        {destinations.map((destination) => (
          <option
            key={JSON.stringify([destination.universeId, destination.placeId])}
            value={JSON.stringify([destination.universeId, destination.placeId])}
          >
            {destination.name}
          </option>
        ))}
      </select>
      {!namesComplete && (
        <span role="status" className="text-[var(--aero-text-muted)]">
          Niektoré názvy sa nepodarilo načítať z Roblox. Skúste stránku obnoviť.
        </span>
      )}
    </label>
  );
  const savedTemplatePicker = (
    <div className="border border-[var(--aero-panel-border)]">
      <div className="manager-heading">Uložené siete</div>
      {savedPlaceTemplatesLoading ? (
        <p className="p-4" role="status">
          Načítavam siete…
        </p>
      ) : savedPlaceTemplates.length === 0 ? (
        <p className="p-4 text-[var(--aero-text-muted)]">
          Zatiaľ nemáte uloženú sieť. Začnite vytvorením novej siete.
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-left manager-table">
            <thead>
              <tr>
                <th>Názov</th>
                <th>Posledná zmena</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {savedPlaceTemplates.map((template) => (
                <tr key={template._id}>
                  <td>
                    <strong>
                      {template.name ||
                        destinations.find(
                          (destination) =>
                            destination.universeId === template.universeId &&
                            destination.placeId === template.placeId,
                        )?.name ||
                        'Názov sa nepodarilo načítať'}
                    </strong>
                  </td>
                  <td>{new Date(template.updatedAt).toLocaleString('sk-SK')}</td>
                  <td>
                    <button
                      className="aero-btn"
                      disabled={isBusy}
                      onClick={() => void loadPlaceTemplate(template)}
                    >
                      <AeroIcon name="open" />
                      Otvoriť sieť
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
  return (
    <div className="station-manager flex min-h-0 flex-1 flex-col text-xs">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aero-ribbon-border)] bg-[var(--aero-ribbon-bg)] px-3 py-2">
        <strong>Správa staníc a tratí</strong>
        <span className="mr-auto text-[var(--aero-text-muted)]">
          {session
            ? `${stations.filter((station) => isPublicStation(station.stationId)).length} staníc · ${links.length} prepojení`
            : 'Vyberte sieť alebo vytvorte novú sieť'}
        </span>
        {session && (
          <>
            <button
              className="aero-btn"
              disabled={isBusy}
              onClick={() =>
                void refreshSession(session._id).catch((error: unknown) =>
                  setError(error instanceof Error ? error.message : 'Obnovenie sa nepodarilo.'),
                )
              }
            >
              <AeroIcon name="refresh" />
              Obnoviť
            </button>
            <button className="aero-btn" onClick={() => setTab('save')}>
              <AeroIcon name="save" />
              Uložiť sieť…
            </button>
          </>
        )}
      </div>
      {error && (
        <div role="alert" className="m-3 border border-red-300 bg-red-50 p-2 text-red-800">
          {error}
        </div>
      )}
      {isBusy && (
        <div role="status" className="border-b border-[var(--aero-panel-border)] px-3 py-1">
          Spracúvam požiadavku…
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between border-b border-[var(--aero-panel-border)] px-3 py-2"
        >
          {notice}
          <button className="aero-btn" onClick={() => setNotice('')}>
            <AeroIcon name="close" />
            Zavrieť
          </button>
        </div>
      )}
      {!sessionIdFromUrl ? (
        <div className="space-y-4 p-4">
          <div>
            <h2 className="mb-1 font-semibold">Ktorú sieť chcete upraviť?</h2>
            <p className="text-[var(--aero-text-muted)]">
              Otvorte uloženú sieť. Potom môžete pridávať stanice, upravovať koľajiská a prepájať
              susedné stanice.
            </p>
          </div>
          {savedTemplatePicker}
          <div className="flex flex-wrap items-center gap-3">
            <button className="aero-btn" disabled={isBusy} onClick={() => void createMockSession()}>
              <AeroIcon name="add" />
              Vytvoriť novú sieť
            </button>
            <span className="text-[var(--aero-text-muted)]">
              Začnete s prázdnym zoznamom staníc.
            </span>
          </div>
          <details className="border border-[var(--aero-panel-border)] p-3">
            <summary className="cursor-pointer font-semibold">Ďalšie možnosti otvorenia</summary>
            <div className="mt-3 space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1">
                  ID existujúcej siete
                  <input
                    className="aero-input"
                    value={sessionIdDraft}
                    onChange={(event) => setSessionIdDraft(event.target.value)}
                  />
                </label>
                <button
                  className="aero-btn"
                  disabled={isBusy || !sessionIdDraft.trim()}
                  onClick={handleOpenExistingSession}
                >
                  <AeroIcon name="open" />
                  Otvoriť sieť
                </button>
              </div>
              <button
                className="aero-btn"
                disabled={isBusy}
                onClick={() => sessionSchemaInputRef.current?.click()}
              >
                <AeroIcon name="open" />
                Načítať sieť zo súboru…
              </button>
              <div className="space-y-2">
                {templateFields}
                <button
                  className="aero-btn"
                  disabled={isBusy || !universeIdDraft || !placeIdDraft}
                  onClick={() => void loadPlaceTemplate()}
                >
                  <AeroIcon name="open" />
                  Otvoriť vybranú sieť
                </button>
              </div>
            </div>
          </details>
        </div>
      ) : !session ? (
        <p className="p-4" role="status">
          {error ? 'Sieť sa nepodarilo otvoriť.' : 'Načítavam sieť…'}
        </p>
      ) : (
        <>
          <nav
            aria-label="Časti správcu"
            className="flex flex-wrap gap-1 border-b border-[var(--aero-panel-border)] bg-[var(--aero-menubar-bg)] px-3 py-2"
          >
            {(
              [
                ['stations', 'Stanice'],
                ['links', 'Prepojenia staníc'],
                ['save', 'Uloženie a súbory'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`aero-btn ${tab === id ? 'active' : ''}`}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                <AeroIcon name={id === 'stations' ? 'train' : id === 'links' ? 'link' : 'save'} />{' '}
                {label}
              </button>
            ))}
          </nav>
          {tab === 'stations' && (
            <div className="grid min-h-0 flex-1 md:grid-cols-[250px_minmax(0,1fr)]">
              <aside className="border-b border-[var(--aero-panel-border)] bg-[var(--grid-row-alt)] md:border-r md:border-b-0">
                <div className="manager-heading">Stanice v sieti</div>
                <label className="m-2 grid gap-1">
                  Vyhľadať stanicu
                  <input
                    className="aero-input w-full"
                    value={stationSearch}
                    onChange={(event) => setStationSearch(event.target.value)}
                  />
                </label>
                <div className="max-h-80 overflow-auto">
                  {visibleStations.map((station) => (
                    <button
                      key={station.stationId}
                      className={`manager-station w-full px-3 py-2 text-left ${selectedStationId === station.stationId ? 'manager-selected' : ''}`}
                      aria-pressed={selectedStationId === station.stationId}
                      onClick={() => setSelectedStationId(station.stationId)}
                    >
                      <strong className="block">{station.stationId}</strong>
                      <span className="text-[var(--aero-text-muted)]">
                        {getLineblockPieceIds(station).length} traťových súhlasov
                      </span>
                    </button>
                  ))}
                  {!visibleStations.length && (
                    <p className="p-3 text-[var(--aero-text-muted)]">
                      {stations.length
                        ? 'Žiadna stanica nezodpovedá hľadaniu.'
                        : 'Sieť je prázdna. Pridajte prvú stanicu nižšie.'}
                    </p>
                  )}
                </div>
                <form
                  className="space-y-2 border-t border-[var(--aero-panel-border)] p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createStation();
                  }}
                >
                  <label className="grid gap-1 font-semibold">
                    Nová stanica
                    <input
                      className="aero-input w-full font-normal"
                      required
                      maxLength={64}
                      aria-describedby="station-name-help"
                      value={stationIdDraft}
                      placeholder="Napr. Bratislava-hlavna"
                      onChange={(event) => setStationIdDraft(event.target.value)}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button className="aero-btn" disabled={isBusy || !stationIdDraft.trim()}>
                      <AeroIcon name="add" />
                      Pridať stanicu
                    </button>
                    <button
                      type="button"
                      className="aero-btn"
                      disabled={isBusy || !stationIdDraft.trim()}
                      onClick={() => stationLayoutInputRef.current?.click()}
                    >
                      <AeroIcon name="open" />
                      Zo súboru…
                    </button>
                  </div>
                  <p id="station-name-help" className="text-[var(--aero-text-muted)]">
                    Názov bez medzier a diakritiky, napr. Bratislava-hlavna. Pridajte prázdne
                    koľajisko alebo načítajte plán zo súboru.
                  </p>
                </form>
              </aside>
              <div className="min-w-0">
                {selectedStation && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aero-panel-border)] p-2">
                    <strong className="mr-auto">{selectedStation.stationId}</strong>
                    <Link
                      className="aero-btn"
                      href={`/runtime/${encodeURIComponent(session._id)}/${encodeURIComponent(selectedStation.stationId)}`}
                    >
                      <AeroIcon name="train" />
                      Staničný pult
                    </Link>
                    <button
                      className="aero-btn"
                      disabled={isBusy}
                      onClick={() => void renameStation(selectedStation.stationId)}
                    >
                      <AeroIcon name="edit" />
                      Premenovať…
                    </button>
                    <button
                      className="aero-btn"
                      disabled={isBusy}
                      onClick={() => void removeStation(selectedStation.stationId)}
                    >
                      <AeroIcon name="delete" />
                      Odstrániť…
                    </button>
                  </div>
                )}
                {pendingLineblockEndpoint && (
                  <div
                    role="status"
                    className="border-b border-[var(--grid-row-selected-border)] bg-[var(--grid-row-selected-top)] p-2"
                  >
                    Vybraný traťový súhlas: {pendingLineblockEndpoint.stationId}. Teraz kliknite na
                    súhlas v susednej stanici.
                    <button
                      className="aero-btn ml-2"
                      onClick={() => setPendingLineblockEndpoint(null)}
                    >
                      <AeroIcon name="close" />
                      Zrušiť výber
                    </button>
                  </div>
                )}
                <StationNetworkCanvas
                  stations={orderedStations.filter((station) => isPublicStation(station.stationId))}
                  links={links}
                  sessionId={session._id}
                  selectedStationId={selectedStationId}
                  pendingEndpoint={pendingLineblockEndpoint}
                  busy={isBusy}
                  onSelect={setSelectedStationId}
                  onLineblockSelect={handleLineblockSelect}
                />
              </div>
            </div>
          )}
          {tab === 'links' && (
            <section className="space-y-4 p-3">
              <div>
                <h2 className="font-semibold">Prepojenia susedných staníc</h2>
                <p className="mt-1 text-[var(--aero-text-muted)]">
                  Vyberte traťový súhlas na oboch koncoch trate. Stanice musia mať tieto prvky
                  vložené v koľajisku.
                </p>
              </div>
              <form
                className="space-y-3 border border-[var(--aero-panel-border)] p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const a = endpoints.find(
                    (endpoint) =>
                      JSON.stringify([endpoint.stationId, endpoint.pieceId]) === linkFrom,
                  );
                  const b = endpoints.find(
                    (endpoint) => JSON.stringify([endpoint.stationId, endpoint.pieceId]) === linkTo,
                  );
                  if (a && b && a.stationId !== b.stationId)
                    void createInterStationLineblockLink(a, b);
                }}
              >
                <h3 className="font-semibold">Nové prepojenie</h3>
                <div className="flex flex-wrap gap-3">
                  <label className="grid gap-1">
                    Prvá stanica a traťový súhlas
                    <select
                      className="aero-select max-w-full"
                      value={linkFrom}
                      onChange={(event) => {
                        setLinkFrom(event.target.value);
                        setLinkTo('');
                      }}
                      required
                    >
                      <option value="">Vyberte prvý koniec trate</option>
                      {endpoints.map((endpoint) => (
                        <option
                          key={JSON.stringify([endpoint.stationId, endpoint.pieceId])}
                          value={JSON.stringify([endpoint.stationId, endpoint.pieceId])}
                        >
                          {endpoint.stationId} — {endpoint.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    Druhá stanica a traťový súhlas
                    <select
                      className="aero-select max-w-full"
                      value={linkTo}
                      onChange={(event) => setLinkTo(event.target.value)}
                      required
                      disabled={!linkFrom}
                    >
                      <option value="">Vyberte druhý koniec trate</option>
                      {endpoints
                        .filter(
                          (endpoint) =>
                            endpoint.stationId !== (JSON.parse(linkFrom || '[]') as string[])[0],
                        )
                        .map((endpoint) => (
                          <option
                            key={JSON.stringify([endpoint.stationId, endpoint.pieceId])}
                            value={JSON.stringify([endpoint.stationId, endpoint.pieceId])}
                          >
                            {endpoint.stationId} — {endpoint.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    Počiatočný smer
                    <select
                      className="aero-select"
                      value={lineblockDefaultFlow}
                      onChange={(event) =>
                        setLineblockDefaultFlow(
                          event.target.value as SessionLineblockLink['defaultFlow'],
                        )
                      }
                    >
                      <option value="neutral">Neutrálny</option>
                      <option value="a-receiving">Prijíma prvá stanica</option>
                      <option value="b-receiving">Prijíma druhá stanica</option>
                    </select>
                  </label>
                </div>
                <button className="aero-btn" disabled={isBusy || !linkFrom || !linkTo}>
                  <AeroIcon name="link" />
                  Prepojiť stanice
                </button>
                {endpoints.length === 0 && (
                  <p>Najprv pridajte traťové súhlasy v editore koľajiska.</p>
                )}
              </form>
              <div className="overflow-auto border border-[var(--aero-panel-border)]">
                <table className="manager-table w-full text-left">
                  <thead>
                    <tr>
                      <th>Prvá stanica</th>
                      <th>Druhá stanica</th>
                      <th>Počiatočný smer</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((link) => (
                      <tr key={link.id}>
                        <td>
                          {link.a.stationId}
                          <div className="text-[var(--aero-text-muted)]">
                            {
                              endpoints.find(
                                (endpoint) =>
                                  endpoint.stationId === link.a.stationId &&
                                  endpoint.pieceId === link.a.pieceId,
                              )?.label
                            }
                          </div>
                        </td>
                        <td>
                          {link.b.stationId}
                          <div className="text-[var(--aero-text-muted)]">
                            {
                              endpoints.find(
                                (endpoint) =>
                                  endpoint.stationId === link.b.stationId &&
                                  endpoint.pieceId === link.b.pieceId,
                              )?.label
                            }
                          </div>
                        </td>
                        <td>
                          <select
                            className="aero-select"
                            aria-label={`Počiatočný smer: ${link.a.stationId} – ${link.b.stationId}`}
                            disabled={isBusy}
                            value={link.defaultFlow}
                            onChange={(event) =>
                              void updateLineblockDefaultFlow(
                                link.id,
                                event.target.value as SessionLineblockLink['defaultFlow'],
                              )
                            }
                          >
                            <option value="neutral">Neutrálny</option>
                            <option value="a-receiving">Prijíma {link.a.stationId}</option>
                            <option value="b-receiving">Prijíma {link.b.stationId}</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className="aero-btn"
                            disabled={isBusy}
                            onClick={() => void removeLineblockLink(link)}
                          >
                            <AeroIcon name="delete" />
                            Odstrániť…
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!links.length && (
                      <tr>
                        <td colSpan={4}>Zatiaľ nie sú prepojené žiadne stanice.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[var(--aero-text-muted)]">
                Počiatočný smer sa použije pri spustení siete. Každé prepojenie má vlastné
                nastavenie.
              </p>
            </section>
          )}
          {tab === 'save' && (
            <section className="space-y-4 p-3">
              <div className="space-y-3 border border-[var(--aero-panel-border)] p-3">
                <h2 className="font-semibold">Uložiť sieť</h2>
                <p>
                  Uložia sa všetky stanice, ich koľajiská a prepojenia pre vybranú sieť.
                  Predchádzajúca uložená sieť sa nahradí.
                </p>
                {templateFields}
                <button
                  className="aero-btn"
                  disabled={isBusy || !universeIdDraft || !placeIdDraft}
                  onClick={() => void savePlaceTemplate()}
                >
                  <AeroIcon name="save" />
                  Uložiť sieť
                </button>
                {savedPlaceTemplate && (
                  <p className="text-[var(--aero-text-muted)]">
                    {selectedDestination?.name || 'Sieť'} · verzia {savedPlaceTemplate.revision}
                  </p>
                )}
              </div>
              <div className="space-y-3 border border-[var(--aero-panel-border)] p-3">
                <h2 className="font-semibold">Záloha siete a skúšobná prevádzka</h2>
                <p>
                  Stiahnite celú sieť do súboru alebo otvorte simulátor na overenie jej fungovania.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="aero-btn"
                    disabled={isBusy}
                    onClick={() => void exportSessionSchema()}
                  >
                    <AeroIcon name="download" />
                    Stiahnuť zálohu siete
                  </button>
                  <Link
                    className="aero-btn"
                    href={`/mock?sessionId=${encodeURIComponent(session._id)}`}
                  >
                    <AeroIcon name="play" />
                    Otvoriť simulátor
                  </Link>
                </div>
              </div>
              <details className="border border-[var(--aero-panel-border)] p-3">
                <summary className="cursor-pointer">Otvoriť inú sieť</summary>
                <div className="mt-3">{savedTemplatePicker}</div>
              </details>
            </section>
          )}
        </>
      )}
      <input
        ref={stationLayoutInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleImportStationLayout(event)}
        className="hidden"
      />
      <input
        ref={sessionSchemaInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleImportSessionSchema(event)}
        className="hidden"
      />
      <footer className="mt-auto border-t border-[var(--status-border)] bg-[var(--status-bg)] px-3 py-1 text-[11px] text-[var(--aero-text-muted)]">
        {session
          ? 'Zmeny siete sa ukladajú priebežne. Pre použitie v Roblox uložte aj sieť.'
          : 'Správa sietí'}
        {isBusy ? ' · Pracujem…' : ''}
      </footer>
    </div>
  );
}
