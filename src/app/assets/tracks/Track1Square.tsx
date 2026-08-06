'use client';

import type { SVGProps } from 'react';
const Track1Square = (props: SVGProps<SVGSVGElement>) => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 75 75"
    {...props}
  >
    
    <rect fill="#b4bbbd" x={0} width={75} height={75} />
    <rect fill="#3b3b3b" x={0} y={30} width={75} height={15} />
    <rect fill="#6e6e6e" x={5} y={33.5} width={65} height={8} rx={4} ry={4} />
  </svg>
);
export { Track1Square };
export default Track1Square;
