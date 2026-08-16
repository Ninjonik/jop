'use client';

import type { PieceContextMenuState } from '../types';

interface Props {
  contextMenu: PieceContextMenuState | null;
  onRotate: () => void;
  onMirror: () => void;
  onRemove: () => void;
}

export default function PieceContextMenu({ contextMenu, onRotate, onMirror, onRemove }: Props) {
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
