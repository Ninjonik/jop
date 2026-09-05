'use client';

import type { SVGProps } from 'react';

const Sign2_2Square = ({ text, ...props }: SVGProps<SVGSVGElement> & { text?: string }) => (
  <svg viewBox="0 0 150 75" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--bg-color, #b4bbbd)" x={75} width={75} height={75} />
    <rect fill="var(--color-d9d9d9, #d9d9d9)" x={4.99} y={21.53} width={140.01} height={31.94} />
    <text x={75} y={37.5} textAnchor="middle" dominantBaseline="central" fill="var(--color-text, #000000)" fontSize="var(--size-text, 22px)">
      {text}
    </text>
  </svg>
);

export default Sign2_2Square;
