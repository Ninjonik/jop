'use client';

import type { SVGProps } from 'react';
const TrackNOOCP1Square = ({ text, ...props }: SVGProps<SVGSVGElement> & { text?: string }) => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 75 75"
    {...props}
  >
    
    <rect fill="var(--bg-color, #b4bbbd)" x={0} width={75} height={75} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={0} y={30} width={75} height={15} />
  </svg>
);
export { TrackNOOCP1Square };
export default TrackNOOCP1Square;
