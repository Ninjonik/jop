'use client';

import type { SVGProps } from 'react';

const TrackCrossing1Square = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 75 75" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--stripe-color, #3b3b3b)" y={30} width={75} height={15} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={52.55} width={5} height={27.5} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={52.55} y={47.5} width={5} height={27.5} />
    <rect fill="var(--occupation-color, #6e6e6e)" x={5} y={33.5} width={65} height={8} rx={4} ry={4} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={17.45} width={5} height={27.5} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={17.45} y={47.5} width={5} height={27.5} />
  </svg>
);

export default TrackCrossing1Square;
