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
  getAllowedPlacements,
  getPieceCells,
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
  const [pendingConnectionPieceId, setPendingConnectionPieceId] = useState<string | null>(null);
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
        const linkedPieceId = nextConnections[previousPieceId];
        if (linkedPieceId) {
          delete nextConnections[linkedPieceId];
          delete nextConnections[previousPieceId];
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
    setPendingConnectionPieceId(null);
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
    setPendingConnectionPieceId(null);
    event.target.value = '';
  };

  const handleTileContextMenu = (x: number, y: number, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearPlacementUi();

    const { pieceId } = parseCellRef(editorState.map[y][x]);
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
    const connectedPieceId = editorState.connections[pieceId] ?? null;
    const connectedPieceCells = connectedPieceId ? getPieceCells(editorState, connectedPieceId) : [];
    const pendingPiece = pendingConnectionPieceId
      ? editorState.pieces[pendingConnectionPieceId]
      : null;
    const eligibleType = isSwitchPieceType(piece.type) || isSwitchButtonPieceType(piece.type);
    const canStartConnection = eligibleType && !connectedPieceId;
    const canCancelPendingConnection = pendingConnectionPieceId === pieceId;
    const canConnectToPending = Boolean(
      pendingConnectionPieceId &&
        pendingConnectionPieceId !== pieceId &&
        pendingPiece &&
        !connectedPieceId &&
        !editorState.connections[pendingConnectionPieceId] &&
        canPiecesConnect(pendingPiece.type, piece.type)
    );

    setSelectedCells([]);
    setContextMenu({
      pieceId,
      x: event.clientX,
      y: event.clientY,
      supportsOrientationChange,
      textKeys,
      canStartConnection,
      canConnectToPending,
      canCancelPendingConnection,
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

      const linkedPieceId = nextConnections[contextMenu.pieceId];
      if (linkedPieceId) {
        delete nextConnections[linkedPieceId];
        delete nextConnections[contextMenu.pieceId];
      }

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

    if (pendingConnectionPieceId === contextMenu.pieceId) {
      setPendingConnectionPieceId(null);
    }

    clearContextMenu();
  };

  const handleContextMenuStartConnection = () => {
    if (!contextMenu) {
      return;
    }

    setPendingConnectionPieceId(contextMenu.pieceId);
    clearContextMenu();
  };

  const handleContextMenuCancelConnection = () => {
    setPendingConnectionPieceId(null);
    clearContextMenu();
  };

  const handleContextMenuConnect = () => {
    if (!contextMenu || !pendingConnectionPieceId || pendingConnectionPieceId === contextMenu.pieceId) {
      return;
    }

    setEditorState((current) => {
      const sourcePiece = current.pieces[pendingConnectionPieceId];
      const targetPiece = current.pieces[contextMenu.pieceId];

      if (
        !sourcePiece ||
        !targetPiece ||
        current.connections[pendingConnectionPieceId] ||
        current.connections[contextMenu.pieceId] ||
        !canPiecesConnect(sourcePiece.type, targetPiece.type)
      ) {
        return current;
      }

      return {
        ...current,
        connections: {
          ...current.connections,
          [pendingConnectionPieceId]: contextMenu.pieceId,
          [contextMenu.pieceId]: pendingConnectionPieceId,
        },
      };
    });

    setPendingConnectionPieceId(null);
    clearContextMenu();
  };

  const handleContextMenuDisconnect = () => {
    if (!contextMenu?.connectedPieceId) {
      return;
    }

    setEditorState((current) => {
      const linkedPieceId = current.connections[contextMenu.pieceId];
      if (!linkedPieceId) {
        return current;
      }

      const nextConnections = { ...current.connections };
      delete nextConnections[contextMenu.pieceId];
      delete nextConnections[linkedPieceId];

      return {
        ...current,
        connections: nextConnections,
      };
    });

    if (
      pendingConnectionPieceId === contextMenu.pieceId ||
      pendingConnectionPieceId === contextMenu.connectedPieceId
    ) {
      setPendingConnectionPieceId(null);
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
        pendingConnectionPieceId={pendingConnectionPieceId}
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
