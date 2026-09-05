'use client';

import type { LayoutExpansionDirection } from '../utils';

interface Props {
  width: number;
  height: number;
  pieceIdLookup: string;
  jopPieceLinksInput: string;
  jopPieceLinksError: string | null;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onPieceIdLookupChange: (value: string) => void;
  onFindPieceId: () => void;
  onJopPieceLinksInputChange: (value: string) => void;
  onHighlightJopPieceLinks: () => void;
  onSet: () => void;
  onExpand: (direction: LayoutExpansionDirection) => void;
  onImport: () => void;
  onExport: () => void;
}

export default function EditorControls({
  width,
  height,
  pieceIdLookup,
  jopPieceLinksInput,
  jopPieceLinksError,
  onWidthChange,
  onHeightChange,
  onPieceIdLookupChange,
  onFindPieceId,
  onJopPieceLinksInputChange,
  onHighlightJopPieceLinks,
  onSet,
  onExpand,
  onImport,
  onExport,
}: Props) {
  return (
    <div className="mb-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={width}
          onChange={(event) => onWidthChange(Number(event.target.value) || 1)}
          className="w-16 border border-neutral-500 bg-white px-1 py-0.5 text-sm text-black"
        />
        <input
          type="number"
          min={1}
          value={height}
          onChange={(event) => onHeightChange(Number(event.target.value) || 1)}
          className="w-16 border border-neutral-500 bg-white px-1 py-0.5 text-sm text-black"
        />
        <button type="button" onClick={onSet} className="border border-neutral-700 bg-white px-2 py-0.5 text-sm text-black">
          set
        </button>
        <div className="grid grid-cols-3 gap-px text-sm text-black">
          <span />
          <button type="button" onClick={() => onExpand('top')} className="border border-neutral-700 bg-white px-2 py-0.5" aria-label="Expand upward">↑</button>
          <span />
          <button type="button" onClick={() => onExpand('left')} className="border border-neutral-700 bg-white px-2 py-0.5" aria-label="Expand left">←</button>
          <span className="px-1 text-xs"></span>
          <button type="button" onClick={() => onExpand('right')} className="border border-neutral-700 bg-white px-2 py-0.5" aria-label="Expand right">→</button>
          <span />
          <button type="button" onClick={() => onExpand('bottom')} className="border border-neutral-700 bg-white px-2 py-0.5" aria-label="Expand downward">↓</button>
          <span />
        </div>
        <button type="button" onClick={onImport} className="border border-neutral-700 bg-white px-2 py-0.5 text-sm text-black">
          import
        </button>
        <button type="button" onClick={onExport} className="border border-neutral-700 bg-white px-2 py-0.5 text-sm text-black">
          export
        </button>
        <input
          type="text"
          value={pieceIdLookup}
          onChange={(event) => onPieceIdLookupChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onFindPieceId();
            }
          }}
          placeholder="piece id"
          className="w-40 border border-neutral-500 bg-white px-1 py-0.5 text-sm text-black"
        />
        <button
          type="button"
          onClick={onFindPieceId}
          className="border border-neutral-700 bg-white px-2 py-0.5 text-sm text-black"
        >
          find
        </button>
        <textarea
            value={jopPieceLinksInput}
            onChange={(event) => onJopPieceLinksInputChange(event.target.value)}
            placeholder="JOPPieceLinks as JSON"
            className="w-96 resize-y border border-neutral-500 bg-white px-2 py-1 font-mono text-xs text-black"
            rows={1}
        />
        <div className="flex flex-col gap-2">
          <button
              type="button"
              onClick={onHighlightJopPieceLinks}
              className="border border-neutral-700 bg-white px-2 py-1 text-sm text-black"
          >
            highlight links
          </button>
          {jopPieceLinksError ? (
              <div className="max-w-72 border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
                {jopPieceLinksError}
              </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
