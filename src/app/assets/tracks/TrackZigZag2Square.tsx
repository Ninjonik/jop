'use client';

import type { SVGProps } from 'react';

const TrackZigZag2Square = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 75 150" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--bg-color, #b4bbbd)" y={75} width={75} height={75} />
    <polygon
      fill="var(--stripe-color, #3b3b3b)"
      points="75 30 75 45 72.46 45 9.52 120 2.53 105 65.46 30.01 65.46 30 75 30"
    />
    <rect fill="var(--stripe-color, #3b3b3b)" y={105} width={9.52} height={15} />
    <rect
      fill="var(--occupation-color, #6e6e6e)"
      x={5}
      y={71}
      width={65}
      height={8}
      rx={4}
      ry={4}
      transform="translate(-44.06 55.52) rotate(-50)"
    />
  </svg>
);

export default TrackZigZag2Square;
