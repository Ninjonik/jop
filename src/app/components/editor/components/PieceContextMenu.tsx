'use client';

import type { PieceContextMenuState } from '../types';

interface Props {
  contextMenu: PieceContextMenuState | null;
  pendingConnectionPieceId: string | null;
  onRotate: () => void;
  onMirror: () => void;
  onEditText: (textKey: string) => void;
  onStartConnection: () => void;
  onCancelConnection: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}

export default function PieceContextMenu({
  contextMenu,
  pendingConnectionPieceId,
  onRotate,
  onMirror,
  onEditText,
  onStartConnection,
  onCancelConnection,
  onConnect,
  onDisconnect,
  onRemove,
}: Props) {
  if (!contextMenu) {
    return null;
  }

  return (
    <div
      className="fixed z-30 flex min-w-24 flex-col border border-neutral-800 bg-white shadow-md"
      style={{
        left: contextMenu.x,
        top: contextMenu.y,
      }}
    >
      <div className="border-b border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-mono text-sm text-black">
        {contextMenu.pieceId}
      </div>
      {contextMenu.supportsOrientationChange ? (
        <>
          <button
            type="button"
            onClick={onRotate}
            className="border-b border-neutral-300 px-2 py-1 text-left text-sm text-black"
          >
            rotate
          </button>
          <button
            type="button"
            onClick={onMirror}
            className="border-b border-neutral-300 px-2 py-1 text-left text-sm text-black"
          >
            mirror
          </button>
        </>
      ) : null}
      {contextMenu.textKeys.map((textKey) => (
        <button
          key={textKey}
          type="button"
          onClick={() => onEditText(textKey)}
          className="border-b border-neutral-300 px-2 py-1 text-left text-sm text-black"
        >
          {`edit ${textKey}`}
        </button>
      ))}
      {contextMenu.connectedPieceId ? (
        <button
          type="button"
          onClick={onDisconnect}
          className="border-b border-neutral-300 px-2 py-1 text-left text-sm text-black"
        >
          {`connected: ${contextMenu.connectedPieceCells
            .map(([x, y]) => `${x},${y}`)
            .join(' | ')}`}
        </button>
      ) : null}
      {contextMenu.canCancelPendingConnection ? (
        <button
          type="button"
          onClick={onCancelConnection}
          className="border-b border-neutral-300 px-2 py-1 text-left text-sm text-black"
        >
          cancel selection
        </button>
      ) : null}
      {contextMenu.canConnectToPending ? (
        <button
          type="button"
          onClick={onConnect}
          className="border-b border-neutral-300 px-2 py-1 text-left text-sm text-black"
        >
          {`connect to ${contextMenu.pendingConnectionEndpointKey ?? pendingConnectionPieceId}`}
        </button>
      ) : null}
      {contextMenu.canStartConnection ? (
        <button
          type="button"
          onClick={onStartConnection}
          className="border-b border-neutral-300 px-2 py-1 text-left text-sm text-black"
        >
          start selection
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="px-2 py-1 text-left text-sm text-black"
      >
        remove
      </button>
    </div>
  );
}
