import { aeroIcons, type AeroIconName } from './aero-icons';

export type { AeroIconName } from './aero-icons';

/** Decorative toolbar icon; the action's visible label remains its accessible name. */
export function AeroIcon({ name, size = 16 }: { name: AeroIconName; size?: 16 | 24 | 32 }) {
  const file = aeroIcons[name];
  return (
    // Original, locally bundled PNGs have dedicated 1x/2x artwork.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/aero/${size === 16 ? '16' : '32'}/${file}.png`}
      srcSet={size === 16 ? `/icons/aero/32/${file}.png 2x` : undefined}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="aero-icon"
      draggable={false}
    />
  );
}
