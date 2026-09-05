import type {
  GridCellRef,
  PieceRecord,
  PlacementVariant,
  StationLayout,
} from '@/lib/station/layout';

export type EditorState = StationLayout;
export type { GridCellRef, PieceRecord, PlacementVariant };

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
  isTrackCrossing: boolean;
  levelCrossingActivationRange: number | null;
  canStartConnection: boolean;
  canConnectToPending: boolean;
  canCancelPendingConnection: boolean;
  pendingConnectionEndpointKey: string | null;
  connectedPieceIds: string[];
  connectedPieceCells: [number, number][];
}
