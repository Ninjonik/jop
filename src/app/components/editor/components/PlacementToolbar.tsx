'use client';

interface Props {
  tileKeys: string[];
  onSelect: (tileKey: string) => void;
}

export default function PlacementToolbar({ tileKeys, onSelect }: Props) {
  return (
    <div className="mb-2 flex flex-wrap gap-1 h-20">
      {tileKeys.map((tileKey) => (
        <button
          type="button"
          key={tileKey}
          onClick={() => onSelect(tileKey)}
          className="border border-neutral-700 bg-white px-2 py-0.5 text-xs text-black"
        >
          {tileKey}
        </button>
      ))}
    </div>
  );
}
