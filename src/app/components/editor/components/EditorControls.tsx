'use client';

interface Props {
  width: number;
  height: number;
  pieceIdLookup: string;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onPieceIdLookupChange: (value: string) => void;
  onFindPieceId: () => void;
  onSet: () => void;
  onImport: () => void;
  onExport: () => void;
}

export default function EditorControls({
  width,
  height,
  pieceIdLookup,
  onWidthChange,
  onHeightChange,
  onPieceIdLookupChange,
  onFindPieceId,
  onSet,
  onImport,
  onExport,
}: Props) {
  return (
    <div className="mb-2 flex items-center gap-2">
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
    </div>
  );
}
