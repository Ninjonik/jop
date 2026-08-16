import type { GroupSelection, PieceOrientation } from '@/app/components/tiles/tile-catalog';

export type GridCellRef = `${string}.${number}`;

export interface PieceRecord {
  type: string;
  rotation: 0 | 180;
  mirrored: boolean;
  state: {
    groups: Record<string, GroupSelection>;
    texts: Record<string, string>;
  };
}

export interface EditorState {
  width: number;
  height: number;
  pieces: Record<string, PieceRecord>;
  map: GridCellRef[][];
  connections: Record<string, string>;
}

export interface PlacementVariant {
  tileKey: string;
  orientation: PieceOrientation;
  usedSpace: [number, number][];
  partsByKey: Record<string, number>;
}

export interface PendingPlacementPosition {
  x: number;
  y: number;
}

export interface PieceContextMenuState {
  pieceId: string;
  endpointKey: string | null;
  x: number;
  y: number;
  supportsOrientationChange: boolean;
  textKeys: string[];
  canStartConnection: boolean;
  canConnectToPending: boolean;
  canCancelPendingConnection: boolean;
  pendingConnectionEndpointKey: string | null;
  connectedPieceId: string | null;
  connectedPieceCells: [number, number][];
}
