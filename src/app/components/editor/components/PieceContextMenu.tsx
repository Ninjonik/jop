'use client';

import type { PieceContextMenuState } from '../types';

interface Props {
  contextMenu: PieceContextMenuState | null;
  onRotate: () => void;
  onMirror: () => void;
  onEditText: (textKey: string) => void;
  onRemove: () => void;
}

export default function PieceContextMenu({
  contextMenu,
  onRotate,
  onMirror,
  onEditText,
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
