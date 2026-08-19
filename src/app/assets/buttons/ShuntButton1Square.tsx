'use client';

import type { SVGProps } from 'react';
const ShuntButton1Square = (props: SVGProps<SVGSVGElement>) => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 75 75"
    {...props}
  >
    <rect fill="var(--bg-color, #b4bbbd)" x={0} width={75} height={75} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={0} y={30} width={75} height={15} />
    <rect fill="var(--occupation-color, #6e6e6e)" x={5} y={33.5} width={41.11} height={8} rx={4} ry={4} />
    <g>
      <circle fill="var(--detail-color, #6e6e6e)" cx={60} cy={37.5} r={10} />
      <circle fill="var(--main-color-alt, #b3b3b3)" cx={60} cy={37.5} r={8} />
      <circle style={{ animation: 'var(--shunt-button-animation, none)' }} fill="var(--color-shunt-button, #acb0b3)" cx={60} cy={37.5} r={4.94} />
    </g>
  </svg>
);
export { ShuntButton1Square };
export default ShuntButton1Square;
