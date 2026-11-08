'use client';
import { useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';

import type { SessionLineblockLink, StationDocument } from '@/lib/station/domain';
import {
  arrangeStationNetwork,
  networkCardHeight,
  networkCardWidth,
} from '@/lib/station/network-layout';
import Link from 'next/link';
import { useRef, useState } from 'react';
import StationTopologyBoard from './StationTopologyBoard';

type Endpoint = { stationId: string; pieceId: string };

export default function StationNetworkCanvas({
  stations,
  links,
  sessionId,
  selectedStationId,
  pendingEndpoint,
  busy,
  onSelect,
  onLineblockSelect,
}: {
  stations: StationDocument[];
  links: SessionLineblockLink[];
  sessionId: string;
  selectedStationId: string;
  pendingEndpoint: Endpoint | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onLineblockSelect: (endpoint: Endpoint) => void;
}) {
  const t = useTranslation();
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const network = arrangeStationNetwork(
    stations.map((station) => station.stationId),
    links,
  );
  function focusSelected() {
    const position = network.positions.get(selectedStationId);
    if (position)
      viewport.current?.scrollTo({
        left: Math.max(0, position.x * zoom - 24),
        top: Math.max(0, position.y * zoom - 40),
        behavior: 'smooth',
      });
  }
  return (
    <section className="min-w-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aero-panel-border)] p-2">
        <strong className="mr-auto">{t('Prehľad siete')}</strong>
        <button
          className="aero-btn"
          disabled={zoom <= 0.4}
          onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))}
          aria-label={t('Oddialiť')}
        >
          <AeroIcon name="zoomOut" />−
        </button>
        <button className="aero-btn" onClick={() => setZoom(1)} aria-label={t('Obnoviť veľkosť')}>
          <AeroIcon name="zoomReset" />
          {Math.round(zoom * 100)} %
        </button>
        <button
          className="aero-btn"
          disabled={zoom >= 1.6}
          onClick={() => setZoom((value) => Math.min(1.6, value + 0.2))}
          aria-label={t('Priblížiť')}
        >
          <AeroIcon name="zoomIn" />+
        </button>
        <button className="aero-btn" disabled={!selectedStationId} onClick={focusSelected}>
          <AeroIcon name="search" /> {t('Nájsť vybranú stanicu')}{' '}
        </button>
      </div>
      <p className="border-b border-[var(--aero-panel-border)] px-3 py-2 text-[var(--aero-text-muted)]">
        {' '}
        {t(
          'Posúvajte prehľad do strán aj nadol. Kliknite na traťový súhlas v jednej stanici a potom v druhej, aby ste ich prepojili.',
        )}{' '}
      </p>
      <div
        ref={viewport}
        tabIndex={0}
        aria-label={t('Posúvateľná sieť staníc')}
        className="h-[65vh] min-h-96 overflow-auto bg-[var(--grid-row-alt)]"
      >
        {!stations.length ? (
          <p className="p-6">{t('Pridajte prvú stanicu pomocou formulára vľavo.')}</p>
        ) : (
          <div style={{ width: network.width * zoom, height: network.height * zoom }}>
            <div
              className="relative origin-top-left"
              style={{ width: network.width, height: network.height, transform: `scale(${zoom})` }}
            >
              {network.sections.map((section, index) => (
                <h3
                  key={index}
                  className="absolute left-6 font-semibold"
                  style={{ top: section.y }}
                >
                  {section.label === 'waiting' ? t('Čakajú na pripojenie') : t('Prepojené stanice')}
                </h3>
              ))}
              <svg
                width={network.width}
                height={network.height}
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
              >
                {links.map((link) => {
                  const a = network.positions.get(link.a.stationId);
                  const b = network.positions.get(link.b.stationId);
                  if (!a || !b) return null;
                  const leftToRight = a.x < b.x;
                  const sameColumn = a.x === b.x;
                  const ax = a.x + (leftToRight || sameColumn ? networkCardWidth : 0);
                  const bx = b.x + (leftToRight ? 0 : networkCardWidth);
                  const ay = a.y + networkCardHeight / 2;
                  const by = b.y + networkCardHeight / 2;
                  const bend = sameColumn ? ax + 40 : (ax + bx) / 2;
                  return (
                    <path
                      key={link.id}
                      d={`M ${ax} ${ay} C ${bend} ${ay}, ${bend} ${by}, ${bx} ${by}`}
                      fill="none"
                      stroke="var(--aero-text-muted)"
                      strokeWidth={3}
                    >
                      <title>
                        {link.a.stationId} ↔ {link.b.stationId}
                      </title>
                    </path>
                  );
                })}
              </svg>
              {stations.map((station) => {
                const position = network.positions.get(station.stationId)!;
                const neighbors = [
                  ...new Set(
                    links.flatMap((link) =>
                      link.a.stationId === station.stationId
                        ? [link.b.stationId]
                        : link.b.stationId === station.stationId
                          ? [link.a.stationId]
                          : [],
                    ),
                  ),
                ];
                return (
                  <article
                    key={station.stationId}
                    className={`absolute overflow-hidden border bg-[var(--aero-panel-bg)] ${selectedStationId === station.stationId ? 'border-[var(--btn-hover-border)] ring-1 ring-[var(--btn-hover-border)]' : 'border-[var(--aero-panel-border)]'}`}
                    style={{
                      left: position.x,
                      top: position.y,
                      width: networkCardWidth,
                      height: networkCardHeight,
                    }}
                  >
                    <div className="manager-heading flex items-center gap-2">
                      <button
                        className="aero-btn mr-auto"
                        aria-pressed={selectedStationId === station.stationId}
                        onClick={() => onSelect(station.stationId)}
                      >
                        {station.stationId}
                      </button>
                      <Link
                        className="aero-btn"
                        href={`/editor?sessionId=${encodeURIComponent(sessionId)}&stationId=${encodeURIComponent(station.stationId)}`}
                      >
                        <AeroIcon name="edit" /> {t('Upraviť koľajisko')}{' '}
                      </Link>
                    </div>
                    <StationTopologyBoard
                      overview
                      station={station}
                      pendingEndpoint={pendingEndpoint}
                      disabled={busy}
                      onLineblockSelect={onLineblockSelect}
                    />
                    <p className="px-3 py-2 text-[var(--aero-text-muted)]">
                      {neighbors.length
                        ? t('Prepojené s: {0}', neighbors.join(', '))
                        : t('Zatiaľ nepripojená. Vyberte traťový súhlas na prepojenie.')}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
