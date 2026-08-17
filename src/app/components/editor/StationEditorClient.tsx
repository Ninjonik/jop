'use client';

import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';

import type { StateGroupRegistry, TileCatalog } from '@/app/components/tiles/tile-catalog';

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
  getAllConnectionEndpointKeysForPiece,
  getAllowedPlacements,
  getConnectionEndpointKey,
  getConnectionPieceId,
  getPieceCells,
  isLineblockPieceType,
  isPremainSignalPieceType,
  isSwitchButtonPieceType,
  isSwitchPieceType,
  parseCellRef,
  toCellKey,
} from './utils';

interface Props {
  tiles: TileCatalog;
  stateGroups: StateGroupRegistry;
}

export default function StationEditorClient({ tiles, stateGroups }: Props) {
  const placementVariants = useMemo(() => buildPlacementVariants(tiles), [tiles]);
  const [draftWidth, setDraftWidth] = useState(DEFAULT_WIDTH);
  const [draftHeight, setDraftHeight] = useState(DEFAULT_HEIGHT);
  const [editorState, setEditorState] = useState<EditorState>(() =>
    createInitialEditorState(DEFAULT_WIDTH, DEFAULT_HEIGHT, tiles, stateGroups)
  );
  const [selectedCells, setSelectedCells] = useState<[number, number][]>([]);
  const [pendingVariants, setPendingVariants] = useState<PlacementVariant[]>([]);
  const [pendingPosition, setPendingPosition] = useState<PendingPlacementPosition | null>(null);
  const [contextMenu, setContextMenu] = useState<PieceContextMenuState | null>(null);
  const [pendingConnectionEndpointKey, setPendingConnectionEndpointKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tileSize = useResponsiveTileSize(editorState.width);

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
    const connectedEndpointKey = endpointKey ? editorState.connections[endpointKey] ?? null : null;
    const connectedPieceId = connectedEndpointKey ? getConnectionPieceId(connectedEndpointKey) : null;
    const connectedPieceCells = connectedPieceId ? getPieceCells(editorState, connectedPieceId) : [];
    const pendingPiece = pendingConnectionEndpointKey
      ? editorState.pieces[getConnectionPieceId(pendingConnectionEndpointKey)]
      : null;
    const eligibleType =
      isSwitchPieceType(piece.type) ||
      isSwitchButtonPieceType(piece.type) ||
      isLineblockPieceType(piece.type) ||
      isPremainSignalPieceType(piece.type);
    const canStartConnection = eligibleType && Boolean(endpointKey) && !connectedPieceId;
    const canCancelPendingConnection = pendingConnectionEndpointKey === endpointKey;
    const canConnectToPending = Boolean(
      endpointKey &&
        pendingConnectionEndpointKey &&
        pendingConnectionEndpointKey !== endpointKey &&
        pendingPiece &&
        !connectedPieceId &&
        !editorState.connections[pendingConnectionEndpointKey] &&
        canPiecesConnect(pendingPiece.type, piece.type)
    );

    setSelectedCells([]);
    setContextMenu({
      pieceId,
      endpointKey,
      x: event.clientX,
      y: event.clientY,
      supportsOrientationChange,
      textKeys,
      canStartConnection,
      canConnectToPending,
      canCancelPendingConnection,
      pendingConnectionEndpointKey,
      connectedPieceId,
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

      if (
        !sourcePiece ||
        !targetPiece ||
        current.connections[pendingConnectionEndpointKey] ||
        current.connections[targetEndpointKey] ||
        !canPiecesConnect(sourcePiece.type, targetPiece.type)
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
    if (!contextMenu?.connectedPieceId) {
      return;
    }

    setEditorState((current) => {
      if (!contextMenu.endpointKey) {
        return current;
      }

      const linkedEndpointKey = current.connections[contextMenu.endpointKey];
      if (!linkedEndpointKey) {
        return current;
      }

      const nextConnections = { ...current.connections };
      delete nextConnections[contextMenu.endpointKey];
      delete nextConnections[linkedEndpointKey];

      return {
        ...current,
        connections: nextConnections,
      };
    });

    if (
      pendingConnectionEndpointKey === contextMenu.endpointKey ||
      pendingConnectionEndpointKey === contextMenu.pendingConnectionEndpointKey
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
      <EditorControls
        width={draftWidth}
        height={draftHeight}
        onWidthChange={setDraftWidth}
        onHeightChange={setDraftHeight}
        onSet={handleResetBoard}
        onImport={() => fileInputRef.current?.click()}
        onExport={handleExport}
      />
      <PlacementToolbar tileKeys={toolbarTileKeys} onSelect={handleToolbarTileClick} />
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
        onContextMenuRotate={handleContextMenuRotate}
        onContextMenuMirror={handleContextMenuMirror}
        onContextMenuEditText={handleContextMenuEditText}
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
