'use client';

import type { PlacementVariant, PendingPlacementPosition } from '../types';

interface Props {
  variants: PlacementVariant[];
  position: PendingPlacementPosition | null;
  tileSize: number;
  onPick: (variant: PlacementVariant) => void;
}

export default function PlacementVariantPicker({
  variants,
  position,
  tileSize,
  onPick,
}: Props) {
  if (variants.length === 0 || !position) {
    return null;
  }

  return (
    <div
      className="absolute z-20 flex gap-1 border border-neutral-800 bg-white p-1"
      style={{
        left: position.x * tileSize,
        top: Math.max(0, position.y * tileSize - 40),
      }}
    >
      {variants.map((variant) => (
        <button
          type="button"
          key={`${variant.tileKey}-${variant.orientation.rotation}-${variant.orientation.mirrored}`}
          onClick={() => onPick(variant)}
          className="border border-neutral-700 px-2 py-0.5 text-xs text-black"
        >
          {variant.orientation.rotation === 180 ? '180°' : '0°'}
          {variant.orientation.mirrored ? ' mirror' : ''}
        </button>
      ))}
    </div>
  );
}
