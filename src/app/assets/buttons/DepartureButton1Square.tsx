'use client';

import type { SVGProps } from 'react';
const DepartureButton1Square = (props: SVGProps<SVGSVGElement>) => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 75 75"
    {...props}
  >
    
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
    <rect fill="var(--stripe-color, #3b3b3b)" y={30} width={75} height={15} />
    <circle fill="var(--detail-color, #6e6e6e)" cx={19.35} cy={37.5} r={10} />
    <circle fill="var(--main-color-alt, #b3b3b3)" cx={19.35} cy={37.5} r={8} />
    <circle style={{ animation: 'var(--departure-button-animation, none)' }} fill="var(--color-departure-button, #121f1e)" cx={19.35} cy={37.5} r={4.94} />
    <circle fill="var(--detail-color, #6e6e6e)" cx={55.65} cy={37.5} r={10} />
    <circle fill="var(--main-color-alt, #b3b3b3)" cx={55.65} cy={37.5} r={8} />
    <circle style={{ animation: 'var(--shunt-button-animation, none)' }} fill="var(--color-shunt-button, #696969)" cx={55.65} cy={37.5} r={4.94} />
  </svg>
);
export { DepartureButton1Square };
export default DepartureButton1Square;
