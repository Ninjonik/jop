'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';

import type { StateGroupRegistry, TileCatalog } from '@/app/components/tiles/tile-catalog';
import type { PlaceTemplateDocument, PlaceTemplateSummary } from '@/lib/station/domain';

import { DEFAULT_HEIGHT, DEFAULT_WIDTH } from './constants';
import EditorControls from './components/EditorControls';
import PlacementToolbar from './components/PlacementToolbar';
import StationCanvas from './components/StationCanvas';
import { useResponsiveTileSize } from './hooks/useResponsiveTileSize';
import type {
  EditorState,
  PieceContextMenuState,
  PlacementVariant,
  PendingPlacementPosition,
} from './types';
import {
  buildPlacementVariants,
  canPieceUseInPlaceOrientation,
  canPiecesConnect,
  createId,
  createInitialEditorState,
  createPieceRecord,
  expandStationLayout,
  getAllConnectionEndpointKeysForPiece,
  getAllowedPlacements,
  getConnectedPieceIdsForEndpointKey,
  getConnectionEndpointKey,
  getConnectionPieceId,
  getLevelCrossingConnectionKey,
  getPieceCells,
  getPrivolavaciaConnectionKey,
  isLineblockPieceType,
  isPrivolavaciaCounterPieceType,
  isPrivolavaciaSignalPieceType,
  isPremainSignalPieceType,
  isTrackCrossingPieceType,
  isTrackPieceType,
  isSwitchButtonPieceType,
  isSwitchPieceType,
  parseCellRef,
  toCellKey,
  type LayoutExpansionDirection,
} from './utils';

interface Props {
  tiles: TileCatalog;
  stateGroups: StateGroupRegistry;
}

export default function StationEditorClient({ tiles, stateGroups }: Props) {
  const placementVariants = useMemo(() => buildPlacementVariants(tiles), [tiles]);
  const [draftWidth, setDraftWidth] = useState(DEFAULT_WIDTH);
  const [draftHeight, setDraftHeight] = useState(DEFAULT_HEIGHT);
  const [pieceIdLookup, setPieceIdLookup] = useState('');
  const [jopPieceLinksInput, setJopPieceLinksInput] = useState('');
  const [jopPieceLinksError, setJopPieceLinksError] = useState<string | null>(null);
  const [showTraversablePaths, setShowTraversablePaths] = useState(false);
  const [editorState, setEditorState] = useState<EditorState>(() =>
    createInitialEditorState(DEFAULT_WIDTH, DEFAULT_HEIGHT, tiles, stateGroups)
  );
  const [placeTemplates, setPlaceTemplates] = useState<PlaceTemplateSummary[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [openedTemplate, setOpenedTemplate] = useState<PlaceTemplateDocument | null>(null);
  const [selectedTemplateStationId, setSelectedTemplateStationId] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<[number, number][]>([]);
  const [pendingVariants, setPendingVariants] = useState<PlacementVariant[]>([]);
  const [pendingPosition, setPendingPosition] = useState<PendingPlacementPosition | null>(null);
  const [contextMenu, setContextMenu] = useState<PieceContextMenuState | null>(null);
  const [pendingConnectionEndpointKey, setPendingConnectionEndpointKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tileSize = useResponsiveTileSize(editorState.width);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/roblox/place-templates');
      if (!response.ok) {
        setTemplateError('Could not load saved layouts.');
        return;
      }
      const body = await response.json() as { templates: PlaceTemplateSummary[] };
      setPlaceTemplates(body.templates);
    })();
  }, []);

  const allowedPlacements = useMemo(
    () => getAllowedPlacements(editorState, selectedCells, placementVariants),
    [editorState, placementVariants, selectedCells]
  );

  const toolbarTileKeys = useMemo(
    () => Array.from(new Set(allowedPlacements.map((variant) => variant.tileKey))),
    [allowedPlacements]
  );

  const clearPlacementUi = () => {
    setPendingVariants([]);
    setPendingPosition(null);
  };

  const clearContextMenu = () => {
    setContextMenu(null);
  };

  const handleFindPieceId = () => {
    const pieceId = pieceIdLookup.trim();
    if (!pieceId || !editorState.pieces[pieceId]) {
      return;
    }

    clearPlacementUi();
    clearContextMenu();
    setPendingConnectionEndpointKey(null);
    setSelectedCells(getPieceCells(editorState, pieceId));
  };

  const handleHighlightJopPieceLinks = () => {
    try {
      const parsed = JSON.parse(jopPieceLinksInput) as Array<{ pieceId?: string }>;
      if (!Array.isArray(parsed)) {
        throw new Error('JOPPieceLinks must be a JSON array.');
      }

      const nextSelectedCells: [number, number][] = [];
      const seen = new Set<string>();

      parsed.forEach((entry) => {
        const pieceId = typeof entry?.pieceId === 'string' ? entry.pieceId.trim() : '';
        if (!pieceId || !editorState.pieces[pieceId]) {
          return;
        }

        getPieceCells(editorState, pieceId).forEach(([x, y]) => {
          const key = `${x},${y}`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          nextSelectedCells.push([x, y]);
        });
      });

      clearPlacementUi();
      clearContextMenu();
      setPendingConnectionEndpointKey(null);
      setSelectedCells(nextSelectedCells);
      setJopPieceLinksError(null);
    } catch (error) {
      setSelectedCells([]);
      setJopPieceLinksError(error instanceof Error ? error.message : 'Invalid JOPPieceLinks JSON.');
    }
  };

  const applyPlacement = (variant: PlacementVariant) => {
    const tile = tiles[variant.tileKey];
    const minX = Math.min(...selectedCells.map(([x]) => x));
    const minY = Math.min(...selectedCells.map(([, y]) => y));
    const pieceId = createId();

    setEditorState((current) => {
      const nextPieces = { ...current.pieces };
      const nextMap = current.map.map((row) => [...row]);
      const nextConnections = { ...current.connections };

      selectedCells.forEach(([x, y]) => {
        const { pieceId: previousPieceId } = parseCellRef(nextMap[y][x]);
        getAllConnectionEndpointKeysForPiece(current, previousPieceId).forEach((endpointKey) => {
          const linkedEndpointKey = nextConnections[endpointKey];
          if (linkedEndpointKey) {
            delete nextConnections[linkedEndpointKey];
            delete nextConnections[endpointKey];
          }
        });
        if (pendingConnectionEndpointKey && getConnectionPieceId(pendingConnectionEndpointKey) === previousPieceId) {
          setPendingConnectionEndpointKey(null);
        }
        delete nextPieces[previousPieceId];
      });

      nextPieces[pieceId] = {
        ...createPieceRecord(variant.tileKey, tile, stateGroups),
        rotation: variant.orientation.rotation,
        mirrored: variant.orientation.mirrored,
      };

      variant.usedSpace.forEach(([dx, dy]) => {
        nextMap[minY + dy][minX + dx] = `${pieceId}.${variant.partsByKey[toCellKey(dx, dy)]}`;
      });

      return {
        ...current,
        pieces: nextPieces,
        map: nextMap,
        connections: nextConnections,
      };
    });

    clearPlacementUi();
    clearContextMenu();
    setSelectedCells([]);
  };

  const handleTileClick = (x: number, y: number, event: MouseEvent<HTMLButtonElement>) => {
    clearPlacementUi();
    clearContextMenu();

    setSelectedCells((current) => {
      const key = toCellKey(x, y);
      const alreadySelected = current.some(([cx, cy]) => toCellKey(cx, cy) === key);

      if (event.ctrlKey || event.metaKey) {
        return alreadySelected
          ? current.filter(([cx, cy]) => toCellKey(cx, cy) !== key)
          : [...current, [x, y]];
      }

      return alreadySelected && current.length === 1 ? current : [[x, y]];
    });
  };

  const handleToolbarTileClick = (tileKey: string) => {
    const variants = allowedPlacements.filter((variant) => variant.tileKey === tileKey);
    if (variants.length === 0) {
      return;
    }

    if (variants.length === 1) {
      applyPlacement(variants[0]);
      return;
    }

    const minX = Math.min(...selectedCells.map(([x]) => x));
    const minY = Math.min(...selectedCells.map(([, y]) => y));
    setPendingVariants(variants);
    setPendingPosition({ x: minX, y: minY });
    clearContextMenu();
  };

  const handleResetBoard = () => {
    setEditorState(createInitialEditorState(draftWidth, draftHeight, tiles, stateGroups));
    setSelectedCells([]);
    clearPlacementUi();
    clearContextMenu();
    setPendingConnectionEndpointKey(null);
  };

  const handleExpandBoard = (direction: LayoutExpansionDirection) => {
    setEditorState((current) => expandStationLayout(current, direction, 1, tiles, stateGroups));
    setDraftWidth(editorState.width + (direction === 'left' || direction === 'right' ? 1 : 0));
    setDraftHeight(editorState.height + (direction === 'top' || direction === 'bottom' ? 1 : 0));
    setSelectedCells([]);
    clearPlacementUi();
    clearContextMenu();
    setPendingConnectionEndpointKey(null);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(editorState, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'station.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const parsed = JSON.parse(await file.text()) as EditorState;
    setEditorState({
      ...parsed,
      connections: parsed.connections ?? {},
    });
    setDraftWidth(parsed.width);
    setDraftHeight(parsed.height);
    setSelectedCells([]);
    clearPlacementUi();
    clearContextMenu();
    setPendingConnectionEndpointKey(null);
    setJopPieceLinksError(null);
    event.target.value = '';
  };

  const handleTileContextMenu = (x: number, y: number, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearPlacementUi();

    const { pieceId, part } = parseCellRef(editorState.map[y][x]);
    const piece = editorState.pieces[pieceId];

    if (!piece) {
      clearContextMenu();
      return;
    }

    if (piece.type === 'filler') {
      clearContextMenu();
      return;
    }

    const tile = tiles[piece.type];
    const supportsOrientationChange = tile ? canPieceUseInPlaceOrientation(tile) : false;
    const textKeys = Object.keys(tile?.texts ?? {});
    const endpointKey = getConnectionEndpointKey(editorState, pieceId, part);
    const connectedPieceIds = getConnectedPieceIdsForEndpointKey(editorState, endpointKey);
    const connectedPieceCells = connectedPieceIds.flatMap((connectedPieceId) =>
      getPieceCells(editorState, connectedPieceId),
    );
    const pendingPiece = pendingConnectionEndpointKey
      ? editorState.pieces[getConnectionPieceId(pendingConnectionEndpointKey)]
      : null;
    const eligibleType =
      isSwitchPieceType(piece.type) ||
      isSwitchButtonPieceType(piece.type) ||
      isLineblockPieceType(piece.type) ||
      isPremainSignalPieceType(piece.type) ||
      isPrivolavaciaCounterPieceType(piece.type) ||
      isPrivolavaciaSignalPieceType(piece.type) ||
      isTrackCrossingPieceType(piece.type);
    const canStartConnection =
      eligibleType &&
      Boolean(endpointKey) &&
      (connectedPieceIds.length === 0 ||
        isPrivolavaciaCounterPieceType(piece.type) ||
        isTrackCrossingPieceType(piece.type));
    const canCancelPendingConnection = pendingConnectionEndpointKey === endpointKey;
    const canConnectToPending = Boolean(
      endpointKey &&
        pendingConnectionEndpointKey &&
        pendingConnectionEndpointKey !== endpointKey &&
        pendingPiece &&
        canPiecesConnect(pendingPiece.type, piece.type) &&
        (
          (isPrivolavaciaCounterPieceType(pendingPiece.type) &&
            isPrivolavaciaSignalPieceType(piece.type) &&
            connectedPieceIds.length === 0) ||
          (isPrivolavaciaCounterPieceType(piece.type) &&
            isPrivolavaciaSignalPieceType(pendingPiece.type) &&
            !editorState.connections[pendingConnectionEndpointKey]) ||
          (isTrackCrossingPieceType(pendingPiece.type) &&
            isTrackPieceType(piece.type) &&
            connectedPieceIds.length === 0) ||
          (isTrackCrossingPieceType(piece.type) &&
            isTrackPieceType(pendingPiece.type) &&
            !editorState.connections[pendingConnectionEndpointKey]) ||
          (!isPrivolavaciaCounterPieceType(pendingPiece.type) &&
            !isPrivolavaciaCounterPieceType(piece.type) &&
            !isTrackCrossingPieceType(pendingPiece.type) &&
            !isTrackCrossingPieceType(piece.type) &&
            connectedPieceIds.length === 0 &&
            !editorState.connections[pendingConnectionEndpointKey])
        )
    );

    setSelectedCells([]);
    setContextMenu({
      pieceId,
      endpointKey,
      x: event.clientX,
      y: event.clientY,
      supportsOrientationChange,
      isTrackCrossing: isTrackCrossingPieceType(piece.type),
      textKeys,
      canStartConnection,
      canConnectToPending,
      canCancelPendingConnection,
      pendingConnectionEndpointKey,
      connectedPieceIds,
      connectedPieceCells,
    });
  };

  const updateContextPiece = (updater: (piece: EditorState['pieces'][string]) => EditorState['pieces'][string]) => {
    if (!contextMenu) {
      return;
    }

    setEditorState((current) => {
      const piece = current.pieces[contextMenu.pieceId];
      if (!piece) {
        return current;
      }

      return {
        ...current,
        pieces: {
          ...current.pieces,
          [contextMenu.pieceId]: updater(piece),
        },
      };
    });

    clearContextMenu();
  };

  const handleContextMenuRotate = () => {
    updateContextPiece((piece) => ({
      ...piece,
      rotation: piece.rotation === 0 ? 180 : 0,
    }));
  };

  const handleContextMenuMirror = () => {
    updateContextPiece((piece) => ({
      ...piece,
      mirrored: !piece.mirrored,
    }));
  };

  const handleContextMenuEditText = (textKey: string) => {
    if (!contextMenu) {
      return;
    }

    const piece = editorState.pieces[contextMenu.pieceId];
    if (!piece) {
      clearContextMenu();
      return;
    }

    const currentValue = piece.state.texts[textKey] ?? '';
    const nextValue = window.prompt(`Set ${textKey}`, currentValue);

    if (nextValue === null) {
      clearContextMenu();
      return;
    }

    updateContextPiece((currentPiece) => ({
      ...currentPiece,
      state: {
        ...currentPiece.state,
        texts: {
          ...currentPiece.state.texts,
          [textKey]: nextValue,
        },
      },
    }));
  };

  const loadTemplateStation = (template: PlaceTemplateDocument, stationId: string) => {
    const station = template.schema.stations.find((candidate) => candidate.stationId === stationId);
    if (!station) return;
    const layout = station.layout as EditorState;
    setEditorState({ ...layout, connections: layout.connections ?? {} });
    setDraftWidth(layout.width);
    setDraftHeight(layout.height);
    setSelectedCells([]);
    clearPlacementUi();
    clearContextMenu();
    setPendingConnectionEndpointKey(null);
    setJopPieceLinksError(null);
  };

  const handleOpenTemplate = async () => {
    const templateSummary = placeTemplates.find((template) => template._id === selectedTemplateKey);
    if (!templateSummary) return;
    const response = await fetch(
      `/api/roblox/place-templates/${encodeURIComponent(templateSummary.placeId)}?universeId=${encodeURIComponent(templateSummary.universeId)}`,
    );
    if (!response.ok) {
      setTemplateError('Could not open the saved layout.');
      return;
    }
    const body = await response.json() as { template: PlaceTemplateDocument };
    const stationId = body.template.schema.stations[0]?.stationId;
    if (!stationId) {
      setTemplateError('This saved layout has no stations.');
      return;
    }
    setOpenedTemplate(body.template);
    setSelectedTemplateStationId(stationId);
    setTemplateError(null);
    loadTemplateStation(body.template, stationId);
  };

  const handleSelectTemplateStation = (stationId: string) => {
    setSelectedTemplateStationId(stationId);
    if (openedTemplate) loadTemplateStation(openedTemplate, stationId);
  };

  const handleSaveTemplateStation = async () => {
    if (!openedTemplate || !selectedTemplateStationId) return;
    const response = await fetch(
      `/api/roblox/place-templates/${encodeURIComponent(openedTemplate.placeId)}/stations/${encodeURIComponent(selectedTemplateStationId)}`,
      {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ universeId: openedTemplate.universeId, layout: editorState }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      window.alert(body?.error?.message ?? 'Could not save the saved layout.');
      return;
    }
    const body = await response.json() as { template: PlaceTemplateDocument };
    setOpenedTemplate(body.template);
    setPlaceTemplates((current) => current.map((template) =>
      template._id === body.template._id
        ? { ...template, revision: body.template.revision, updatedAt: body.template.updatedAt }
        : template,
    ));
    window.alert(`Saved ${selectedTemplateStationId} to ${body.template.universeId}/${body.template.placeId}.`);
  };

  const handleContextMenuEditLevelCrossingTimings = () => {
    if (!contextMenu) return;
    const piece = editorState.pieces[contextMenu.pieceId];
    if (!piece) return;
    const current = piece.levelCrossingTimings ?? {};
    const fields: Array<[keyof NonNullable<typeof piece.levelCrossingTimings>, string, number]> = [
      ['warningSeconds', 'Warning before barriers lower (seconds; blank = 8)', 8],
      ['lowerSeconds', 'Barrier lowering duration (seconds; blank = 10)', 10],
      ['raiseSeconds', 'Barrier raising duration (seconds; blank = 7)', 7],
      ['whiteDelaySeconds', 'White return delay (seconds; blank = immediate)', 0],
    ];
    const next: NonNullable<typeof piece.levelCrossingTimings> = {};
    for (const [key, label] of fields) {
      const value = window.prompt(label, current[key]?.toString() ?? '');
      if (value === null) return;
      const parsed = value.trim() === '' ? undefined : Number(value);
      if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0)) {
        window.alert('Timings must be zero or more seconds, or blank for the default.');
        return;
      }
      if (parsed !== undefined) next[key] = parsed;
    }
    updateContextPiece((currentPiece) => ({
      ...currentPiece,
      levelCrossingTimings: Object.keys(next).length > 0 ? next : undefined,
    }));
  };

  const handleContextMenuRemove = () => {
    if (!contextMenu) {
      return;
    }

    setEditorState((current) => {
      const nextPieces = { ...current.pieces };
      const nextMap = current.map.map((row) => [...row]);
      const nextConnections = { ...current.connections };
      const fillerTile = tiles.filler;
      const targetPiece = current.pieces[contextMenu.pieceId];

      if (!targetPiece || !fillerTile || targetPiece.type === 'filler') {
        return current;
      }

      getAllConnectionEndpointKeysForPiece(current, contextMenu.pieceId).forEach((endpointKey) => {
        const linkedEndpointKey = nextConnections[endpointKey];
        if (linkedEndpointKey) {
          delete nextConnections[linkedEndpointKey];
          delete nextConnections[endpointKey];
        }
      });

      nextMap.forEach((row, y) => {
        row.forEach((value, x) => {
          const { pieceId } = parseCellRef(value);
          if (pieceId !== contextMenu.pieceId) {
            return;
          }

          const fillerPieceId = createId();
          nextPieces[fillerPieceId] = createPieceRecord('filler', fillerTile, stateGroups);
          nextMap[y][x] = `${fillerPieceId}.0`;
        });
      });

      delete nextPieces[contextMenu.pieceId];

      return {
        ...current,
        pieces: nextPieces,
        map: nextMap,
        connections: nextConnections,
      };
    });

    if (
      pendingConnectionEndpointKey &&
      getConnectionPieceId(pendingConnectionEndpointKey) === contextMenu.pieceId
    ) {
      setPendingConnectionEndpointKey(null);
    }

    clearContextMenu();
  };

  const handleContextMenuStartConnection = () => {
    if (!contextMenu) {
      return;
    }

    if (!contextMenu.endpointKey) {
      return;
    }

    setPendingConnectionEndpointKey(contextMenu.endpointKey);
    clearContextMenu();
  };

  const handleContextMenuCancelConnection = () => {
    setPendingConnectionEndpointKey(null);
    clearContextMenu();
  };

  const handleContextMenuConnect = () => {
    const targetEndpointKey = contextMenu?.endpointKey;

    if (!targetEndpointKey || !pendingConnectionEndpointKey || pendingConnectionEndpointKey === targetEndpointKey) {
      return;
    }

    setEditorState((current) => {
      const sourcePiece = current.pieces[getConnectionPieceId(pendingConnectionEndpointKey)];
      const targetPiece = current.pieces[contextMenu.pieceId];

      if (!sourcePiece || !targetPiece || !canPiecesConnect(sourcePiece.type, targetPiece.type)) {
        return current;
      }

      if (
        isPrivolavaciaCounterPieceType(sourcePiece.type) &&
        isPrivolavaciaSignalPieceType(targetPiece.type)
      ) {
        if (current.connections[targetEndpointKey]) {
          return current;
        }

        const syntheticEndpointKey = getPrivolavaciaConnectionKey(
          getConnectionPieceId(pendingConnectionEndpointKey),
          contextMenu.pieceId,
        );
        return {
          ...current,
          connections: {
            ...current.connections,
            [syntheticEndpointKey]: targetEndpointKey,
            [targetEndpointKey]: syntheticEndpointKey,
          },
        };
      }

      if (isTrackCrossingPieceType(sourcePiece.type) && isTrackPieceType(targetPiece.type)) {
        if (current.connections[targetEndpointKey]) {
          return current;
        }

        const syntheticEndpointKey = getLevelCrossingConnectionKey(
          getConnectionPieceId(pendingConnectionEndpointKey),
          contextMenu.pieceId,
        );
        return {
          ...current,
          connections: {
            ...current.connections,
            [syntheticEndpointKey]: targetEndpointKey,
            [targetEndpointKey]: syntheticEndpointKey,
          },
        };
      }

      if (isTrackCrossingPieceType(targetPiece.type) && isTrackPieceType(sourcePiece.type)) {
        if (current.connections[pendingConnectionEndpointKey]) {
          return current;
        }

        const syntheticEndpointKey = getLevelCrossingConnectionKey(
          contextMenu.pieceId,
          getConnectionPieceId(pendingConnectionEndpointKey),
        );
        return {
          ...current,
          connections: {
            ...current.connections,
            [syntheticEndpointKey]: pendingConnectionEndpointKey,
            [pendingConnectionEndpointKey]: syntheticEndpointKey,
          },
        };
      }

      if (
        isPrivolavaciaCounterPieceType(targetPiece.type) &&
        isPrivolavaciaSignalPieceType(sourcePiece.type)
      ) {
        if (current.connections[pendingConnectionEndpointKey]) {
          return current;
        }

        const syntheticEndpointKey = getPrivolavaciaConnectionKey(contextMenu.pieceId, getConnectionPieceId(pendingConnectionEndpointKey));
        return {
          ...current,
          connections: {
            ...current.connections,
            [syntheticEndpointKey]: pendingConnectionEndpointKey,
            [pendingConnectionEndpointKey]: syntheticEndpointKey,
          },
        };
      }

      if (
        current.connections[pendingConnectionEndpointKey] ||
        current.connections[targetEndpointKey]
      ) {
        return current;
      }

      return {
        ...current,
        connections: {
          ...current.connections,
          [pendingConnectionEndpointKey]: targetEndpointKey,
          [targetEndpointKey]: pendingConnectionEndpointKey,
        },
      };
    });

    setPendingConnectionEndpointKey(null);
    clearContextMenu();
  };

  const handleContextMenuDisconnect = () => {
    if (!contextMenu || contextMenu.connectedPieceIds.length === 0) {
      return;
    }

    const disconnectMenu = contextMenu;

    setEditorState((current) => {
      if (!disconnectMenu.endpointKey) {
        return current;
      }

      const nextConnections = { ...current.connections };
      const piece = current.pieces[disconnectMenu.pieceId];
      if (!piece) {
        return current;
      }

      if (isPrivolavaciaCounterPieceType(piece.type)) {
        Object.keys(nextConnections)
          .filter((endpointKey) => endpointKey.startsWith(`${disconnectMenu.pieceId}:pn:`))
          .forEach((endpointKey) => {
            const linkedEndpointKey = nextConnections[endpointKey];
            if (linkedEndpointKey) {
              delete nextConnections[linkedEndpointKey];
            }
            delete nextConnections[endpointKey];
          });
      } else if (isTrackCrossingPieceType(piece.type)) {
        Object.keys(nextConnections)
          .filter((endpointKey) => endpointKey.startsWith(`${disconnectMenu.pieceId}:level-crossing:`))
          .forEach((endpointKey) => {
            const linkedEndpointKey = nextConnections[endpointKey];
            if (linkedEndpointKey) {
              delete nextConnections[linkedEndpointKey];
            }
            delete nextConnections[endpointKey];
          });
      } else {
        const linkedEndpointKey = nextConnections[disconnectMenu.endpointKey];
        if (!linkedEndpointKey) {
          return current;
        }
        delete nextConnections[disconnectMenu.endpointKey];
        delete nextConnections[linkedEndpointKey];
      }

      return {
        ...current,
        connections: nextConnections,
      };
    });

    if (
      pendingConnectionEndpointKey === disconnectMenu.endpointKey ||
      pendingConnectionEndpointKey === disconnectMenu.pendingConnectionEndpointKey
    ) {
      setPendingConnectionEndpointKey(null);
    }

    clearContextMenu();
  };

  return (
    <main
      className="flex min-h-screen flex-col overflow-hidden bg-neutral-300 p-4"
      onClick={() => clearContextMenu()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <section className="mb-2 flex flex-wrap items-center gap-2 border border-neutral-500 bg-neutral-200 p-2 text-sm text-black">
        <span>saved layout</span>
        <select
          value={selectedTemplateKey}
          onChange={(event) => setSelectedTemplateKey(event.target.value)}
          className="max-w-96 border border-neutral-500 bg-white px-1 py-0.5"
        >
          <option value="">select Universe / Place</option>
          {placeTemplates.map((template) => (
            <option key={template._id} value={template._id}>
              {template.universeId} / {template.placeId} (rev {template.revision})
            </option>
          ))}
        </select>
        <button type="button" onClick={handleOpenTemplate} disabled={!selectedTemplateKey} className="border border-neutral-700 bg-white px-2 py-0.5 disabled:opacity-50">
          open
        </button>
        {openedTemplate ? (
          <>
            <select
              value={selectedTemplateStationId}
              onChange={(event) => handleSelectTemplateStation(event.target.value)}
              className="border border-neutral-500 bg-white px-1 py-0.5"
            >
              {openedTemplate.schema.stations.map((station) => (
                <option key={station.stationId} value={station.stationId}>{station.stationId}</option>
              ))}
            </select>
            <span>editing {openedTemplate.universeId} / {openedTemplate.placeId}, rev {openedTemplate.revision}</span>
          </>
        ) : null}
        {templateError ? <span className="text-red-700">{templateError}</span> : null}
      </section>
      <EditorControls
        width={draftWidth}
        height={draftHeight}
        pieceIdLookup={pieceIdLookup}
        jopPieceLinksInput={jopPieceLinksInput}
        jopPieceLinksError={jopPieceLinksError}
        onWidthChange={setDraftWidth}
        onHeightChange={setDraftHeight}
        onPieceIdLookupChange={setPieceIdLookup}
        onFindPieceId={handleFindPieceId}
        onJopPieceLinksInputChange={setJopPieceLinksInput}
        onHighlightJopPieceLinks={handleHighlightJopPieceLinks}
        showTraversablePaths={showTraversablePaths}
        onShowTraversablePathsChange={setShowTraversablePaths}
        onSet={handleResetBoard}
        onExpand={handleExpandBoard}
        onImport={() => fileInputRef.current?.click()}
        onExport={handleExport}
        onSave={openedTemplate && selectedTemplateStationId ? handleSaveTemplateStation : undefined}
        saveLabel={openedTemplate && selectedTemplateStationId ? `save ${selectedTemplateStationId}` : undefined}
      />
      <PlacementToolbar
        tileKeys={toolbarTileKeys}
        tiles={tiles}
        stateGroups={stateGroups}
        onSelect={handleToolbarTileClick}
      />
      <StationCanvas
        editorState={editorState}
        tiles={tiles}
        stateGroups={stateGroups}
        tileSize={tileSize}
        selectedCells={selectedCells}
        pendingVariants={pendingVariants}
        pendingPosition={pendingPosition}
        onTileClick={handleTileClick}
        onTileContextMenu={handleTileContextMenu}
        onVariantPick={applyPlacement}
        contextMenu={contextMenu}
        pendingConnectionPieceId={pendingConnectionEndpointKey}
        showTraversablePaths={showTraversablePaths}
        onContextMenuRotate={handleContextMenuRotate}
        onContextMenuMirror={handleContextMenuMirror}
        onContextMenuEditText={handleContextMenuEditText}
        onContextMenuEditLevelCrossingTimings={handleContextMenuEditLevelCrossingTimings}
        onContextMenuStartConnection={handleContextMenuStartConnection}
        onContextMenuCancelConnection={handleContextMenuCancelConnection}
        onContextMenuConnect={handleContextMenuConnect}
        onContextMenuDisconnect={handleContextMenuDisconnect}
        onContextMenuRemove={handleContextMenuRemove}
      />
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
