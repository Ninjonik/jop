'use client';

import type { SVGProps } from 'react';

const TrackDiagonalLong6Square = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 150 225" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--bg-color, #b4bbbd)" y={75} width={75} height={75} />
    <rect fill="var(--bg-color, #b4bbbd)" x={75} y={75} width={75} height={75} />
    <rect fill="var(--bg-color, #b4bbbd)" x={75} y={150} width={75} height={75} />
    <polygon
      fill="var(--stripe-color, #3b3b3b)"
      points="0 30 21.61 30.01 84.54 105 147.47 180 150 180 150 195 140.48 195 75 116.96 14.61 45 0 45"
    />
    <rect
      fill="var(--occupation-color, #6e6e6e)"
      x={104.79}
      y={111.58}
      width={8}
      height={68.05}
      rx={3.82}
      ry={3.82}
      transform="translate(-68.14 103.99) rotate(-40)"
    />
    <rect
      fill="var(--occupation-color, #6e6e6e)"
      x={45.55}
      y={40.98}
      width={8}
      height={68.05}
      rx={3.82}
      ry={3.82}
      transform="translate(-36.62 49.4) rotate(-40)"
    />
  </svg>
);

export default TrackDiagonalLong6Square;
