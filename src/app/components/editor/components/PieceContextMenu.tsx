'use client';

import { useLayoutEffect, useRef, useState } from 'react';

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

const VIEWPORT_MARGIN = 8;

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!contextMenu) {
      return;
    }

    const updatePosition = () => {
      const menu = menuRef.current;
      if (!menu) {
        return;
      }

      const { width, height } = menu.getBoundingClientRect();
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(contextMenu.x, window.innerWidth - width - VIEWPORT_MARGIN),
      );
      const opensAbove = contextMenu.y + height > window.innerHeight - VIEWPORT_MARGIN;
      const top = opensAbove
        ? Math.max(VIEWPORT_MARGIN, contextMenu.y - height)
        : Math.max(VIEWPORT_MARGIN, contextMenu.y);

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [contextMenu]);

  if (!contextMenu) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-30 flex min-w-24 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto border border-neutral-800 bg-white shadow-md"
      style={{
        left: position.left,
        top: position.top,
        maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
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
      {contextMenu.connectedPieceIds.length > 0 ? (
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
