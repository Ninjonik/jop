'use client';

import type { SVGProps } from 'react';

const Sign3_3Square = ({ text, ...props }: SVGProps<SVGSVGElement> & { text?: string }) => (
  <svg viewBox="0 0 225 75" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--bg-color, #b4bbbd)" x={75} width={75} height={75} />
    <rect fill="var(--bg-color, #b4bbbd)" x={150} width={75} height={75} />
    <rect fill="var(--color-d9d9d9, #d9d9d9)" x={4.99} y={21.62} width={215.01} height={31.94} />
    <text x={112.5} y={37.5} textAnchor="middle" dominantBaseline="central" fill="var(--color-text, #000000)" fontSize="var(--size-text, 24px)">
      {text}
    </text>
  </svg>
);

export default Sign3_3Square;
