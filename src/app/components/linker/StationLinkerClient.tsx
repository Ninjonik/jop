'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';

import TileSvg from '@/app/components/tiles/TileSvg';
import type { StateGroupRegistry, TileCatalog } from '@/app/components/tiles/tile-catalog';
import { FILLER_TILE_KEY } from '@/app/components/editor/constants';
import { useResponsiveTileSize } from '@/app/components/editor/hooks/useResponsiveTileSize';
import type { EditorState } from '@/app/components/editor/types';
import { getRenderablePieces, parseCellRef, toCellKey } from '@/app/components/editor/utils';

type LinkEntry = {
  stationId: string;
  pieceId: string;
  traversalState?: string;
};

interface Props {
  tiles: TileCatalog;
  stateGroups: StateGroupRegistry;
}

export default function StationLinkerClient({ tiles, stateGroups }: Props) {
  const [stationId, setStationId] = useState('');
  const [layout, setLayout] = useState<EditorState | null>(null);
  const [selectedPieceIds, setSelectedPieceIds] = useState<string[]>([]);
  const [copiedPieceIds, setCopiedPieceIds] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [lastCopiedCount, setLastCopiedCount] = useState(0);
  const [ctrlSelectionActive, setCtrlSelectionActive] = useState(false);
  const [selectedTraversalIndex, setSelectedTraversalIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedPieceIdsRef = useRef<string[]>([]);

  const boardWidth = layout?.width ?? 16;
  const tileSize = useResponsiveTileSize(boardWidth);

  const renderablePieces = useMemo(() => (layout ? getRenderablePieces(layout) : []), [layout]);
  const selectedPieceIdSet = useMemo(() => new Set(selectedPieceIds), [selectedPieceIds]);
  const copiedPieceIdSet = useMemo(() => new Set(copiedPieceIds), [copiedPieceIds]);

  const selectedCount = selectedPieceIds.length;
  const copiedCount = copiedPieceIds.length;

  const selectedTraversalOptions = useMemo(() => {
    if (!layout || selectedPieceIds.length === 0) {
      return ['none'];
    }

    const options = new Set<string>(['none']);
    selectedPieceIds.forEach((pieceId) => {
      const piece = layout.pieces[pieceId];
      const traversable = piece ? tiles[piece.type]?.traversable : false;
      if (!traversable || typeof traversable !== 'object') {
        return;
      }

      Object.keys(traversable).forEach((stateKey) => {
        options.add(stateKey);
      });
    });

    return Array.from(options);
  }, [layout, selectedPieceIds, tiles]);

  const effectiveTraversalIndex = Math.min(
    selectedTraversalIndex,
    Math.max(0, selectedTraversalOptions.length - 1),
  );
  const selectedTraversalState = selectedTraversalOptions[effectiveTraversalIndex] ?? 'none';

  const buildPayload = useCallback(
    (pieceIds: string[]): LinkEntry[] =>
      pieceIds.map((pieceId) => ({
        ...(function () {
          const piece = layout?.pieces[pieceId];
          const traversable = piece ? tiles[piece.type]?.traversable : false;
          const supportsSelectedTraversal =
            selectedTraversalState !== 'none' &&
            traversable &&
            typeof traversable === 'object' &&
            selectedTraversalState in traversable;

        return {
            stationId: stationId.trim().toLowerCase(),
            pieceId,
            ...(supportsSelectedTraversal ? { traversalState: selectedTraversalState } : {}),
          };
        })(),
      })),
    [layout, selectedTraversalState, stationId, tiles],
  );

  useEffect(() => {
    selectedPieceIdsRef.current = selectedPieceIds;
  }, [selectedPieceIds]);

  const copyPieceIds = useCallback(async (pieceIds: string[]) => {
    const normalizedStationId = stationId.trim().toLowerCase();
    if (!normalizedStationId) {
      setCopyStatus('Set stationId first.');
      return;
    }

    if (pieceIds.length === 0) {
      return;
    }

    const payload = JSON.stringify(buildPayload(pieceIds), null, 2);

    try {
      await navigator.clipboard.writeText(payload);
      setCopiedPieceIds((current) => Array.from(new Set([...current, ...pieceIds])));
      setSelectedPieceIds([]);
      setLastCopiedCount(pieceIds.length);
      setCopyStatus(`Copied ${pieceIds.length} tile link${pieceIds.length === 1 ? '' : 's'}.`);
    } catch {
      setCopyStatus('Clipboard copy failed.');
    }
  }, [buildPayload, stationId]);

  useEffect(() => {
    const cycleTraversal = (direction: -1 | 1) => {
      if (selectedTraversalOptions.length <= 1) {
        return;
      }

      setSelectedTraversalIndex((current) => {
        const start = Math.min(current, Math.max(0, selectedTraversalOptions.length - 1));
        const next = start + direction;
        if (next < 0) {
          return selectedTraversalOptions.length - 1;
        }
        if (next >= selectedTraversalOptions.length) {
          return 0;
        }
        return next;
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') {
        setCtrlSelectionActive(true);
        return;
      }

      if (!ctrlSelectionActive) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleTraversal(-1);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleTraversal(1);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Control' && event.key !== 'Meta') {
        return;
      }

      setCtrlSelectionActive(false);
      const pieceIds = selectedPieceIdsRef.current;
      if (pieceIds.length > 0) {
        void copyPieceIds(pieceIds);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [copyPieceIds, ctrlSelectionActive, selectedTraversalOptions.length]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const parsed = JSON.parse(await file.text()) as EditorState;
    setLayout({
      ...parsed,
      connections: parsed.connections ?? {},
    });
    setSelectedPieceIds([]);
    setCopiedPieceIds([]);
    setLastCopiedCount(0);
    setCopyStatus(null);
    setCtrlSelectionActive(false);
    setSelectedTraversalIndex(0);
    event.target.value = '';
  };

  const handleTileClick = (x: number, y: number, event: MouseEvent<HTMLButtonElement>) => {
    if (!layout) {
      return;
    }

    const { pieceId } = parseCellRef(layout.map[y][x]);
    const piece = layout.pieces[pieceId];
    if (!piece || piece.type === FILLER_TILE_KEY) {
      return;
    }

    setCopyStatus(null);
    if (event.ctrlKey || event.metaKey) {
      setCtrlSelectionActive(true);
      setSelectedPieceIds((current) => {
        const alreadySelected = current.includes(pieceId);
        return alreadySelected ? current.filter((id) => id !== pieceId) : [...current, pieceId];
      });
      return;
    }

    setCtrlSelectionActive(false);
    setSelectedPieceIds([pieceId]);
    setSelectedTraversalIndex(0);
    void copyPieceIds([pieceId]);
  };

  const handleTileContextMenu = (x: number, y: number, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (!layout) {
      return;
    }

    const { pieceId } = parseCellRef(layout.map[y][x]);
    const piece = layout.pieces[pieceId];
    if (!piece || piece.type === FILLER_TILE_KEY) {
      return;
    }

    setCopyStatus(null);
    setCopiedPieceIds((current) => {
      const targetPieceIds = selectedPieceIdSet.has(pieceId) ? selectedPieceIds : [pieceId];
      if (targetPieceIds.length === 0) {
        return current;
      }

      const next = current.filter((id) => !targetPieceIds.includes(id));
      return next.length === current.length ? current : next;
    });
  };

  return (
    <main className="flex min-h-screen flex-col bg-neutral-300 p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-neutral-500 bg-neutral-200 p-3">
        <div className="flex min-w-52 flex-col gap-1">
          <label htmlFor="station-id" className="text-sm font-medium text-neutral-800">
            Station ID
          </label>
          <input
            id="station-id"
            type="text"
            value={stationId}
            onChange={(event) => setStationId(event.target.value)}
            placeholder="station-a"
            className="rounded border border-neutral-500 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-600"
          />
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-neutral-600 bg-white px-4 py-2 text-sm text-neutral-900 hover:bg-neutral-100"
        >
          Import station JSON
        </button>

        <div className="text-sm text-neutral-800">
          Selected: {selectedCount} | Copied: {copiedCount}
        </div>

        <div className="text-sm text-neutral-700">
          Click copies immediately. Hold `Ctrl` to build a group, use left/right arrows to pick traversal, then release `Ctrl` to copy. Right click clears copied state.
        </div>
      </div>

      {copyStatus ? <div className="mb-3 text-sm text-neutral-800">{copyStatus}</div> : null}

      <div className="relative flex flex-1 items-start justify-center overflow-auto bg-neutral-400">
        {layout ? (
          <div
            className="relative shrink-0 bg-neutral-500"
            style={{
              width: layout.width * tileSize,
              height: layout.height * tileSize,
              marginTop: 'auto',
              marginBottom: 'auto',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.2) 1px, transparent 1px)',
                backgroundSize: `${tileSize}px ${tileSize}px`,
              }}
            />

            {selectedPieceIds.length > 0 ? (
              <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded border border-neutral-800/70 bg-neutral-950/80 px-4 py-2 text-center text-sm text-white">
                <div>Traversal</div>
                <div className="font-mono text-base">
                  {selectedTraversalState === 'none' ? 'none' : selectedTraversalState}
                </div>
                <div className="mt-1 text-xs text-neutral-300">
                  Last copied: {lastCopiedCount}
                </div>
              </div>
            ) : null}

            {renderablePieces.map(({ pieceId, anchorX, anchorY }) => {
              const piece = layout.pieces[pieceId];
              const tile = tiles[piece.type];

              return (
                <div
                  key={pieceId}
                  className="pointer-events-none absolute"
                  style={{
                    left: anchorX * tileSize,
                    top: anchorY * tileSize,
                    width: tile.space.x * tileSize,
                    height: tile.space.y * tileSize,
                  }}
                >
                  <TileSvg
                    tileKey={piece.type}
                    tile={tile}
                    stateGroups={stateGroups}
                    selections={piece.state.groups}
                    textValues={piece.state.texts}
                    orientation={{
                      rotation: piece.rotation,
                      mirrored: piece.mirrored,
                    }}
                    className="h-full w-full object-contain"
                  />
                </div>
              );
            })}

            {layout.map.map((row, y) =>
              row.map((value, x) => {
                const { pieceId } = parseCellRef(value);
                const piece = layout.pieces[pieceId];
                const filler = piece?.type === FILLER_TILE_KEY;
                const selected = selectedPieceIdSet.has(pieceId);
                const copied = copiedPieceIdSet.has(pieceId);

                return (
                  <button
                    type="button"
                    key={toCellKey(x, y)}
                    onClick={(event) => handleTileClick(x, y, event)}
                    onContextMenu={(event) => handleTileContextMenu(x, y, event)}
                    className={`absolute border ${
                      copied
                        ? 'border-emerald-700 bg-emerald-500/35'
                        : selected
                          ? `border-sky-600 ${ctrlSelectionActive ? 'bg-sky-500/35' : 'bg-sky-400/30'}`
                          : 'border-transparent'
                    } ${filler ? 'cursor-default' : 'cursor-pointer'}`}
                    style={{
                      left: x * tileSize,
                      top: y * tileSize,
                      width: tileSize,
                      height: tileSize,
                    }}
                  />
                );
              }),
            )}
          </div>
        ) : (
          <div className="m-auto text-sm text-neutral-800">Import a station JSON to start.</div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleImport}
        className="hidden"
      />
    </main>
  );
}
