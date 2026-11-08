'use client';
import { useTranslation } from '@/lib/i18n/client';

import type { PendingPlacementPosition, PlacementVariant } from '../types';

interface Props {
  variants: PlacementVariant[];
  position: PendingPlacementPosition | null;
  tileSize: number;
  onPick: (variant: PlacementVariant) => void;
}

export default function PlacementVariantPicker({ variants, position, tileSize, onPick }: Props) {
  const t = useTranslation();
  if (variants.length === 0 || !position) {
    return null;
  }

  return (
    <div
      className="absolute z-20 flex gap-1 border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] p-1"
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
          className="aero-btn"
        >
          {variant.orientation.rotation === 180 ? '180°' : '0°'}
          {variant.orientation.mirrored ? t(' mirror') : ''}
        </button>
      ))}
    </div>
  );
}
