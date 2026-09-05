'use client';

import type { SVGProps } from 'react';

const Buffer1Square = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 75 75" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--stripe-color, #3b3b3b)" y={30} width={33.05} height={15} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={33.05} y={18.59} width={8.91} height={37.81} />
  </svg>
);

export default Buffer1Square;
