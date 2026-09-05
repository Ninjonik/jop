'use client';

import type { SVGProps } from 'react';

const Sign1_1Square = ({ text, ...props }: SVGProps<SVGSVGElement> & { text?: string }) => (
  <svg viewBox="0 0 75 75" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--color-d9d9d9, #d9d9d9)" x={4.99} y={25.35} width={65.01} height={24.3} />
    <text x={37.5} y={37.5} textAnchor="middle" dominantBaseline="central" fill="var(--color-text, #000000)" fontSize="var(--size-text, 18px)">
      {text}
    </text>
  </svg>
);

export default Sign1_1Square;
