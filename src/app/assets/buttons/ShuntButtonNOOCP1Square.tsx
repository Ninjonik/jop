'use client';

import type { SVGProps } from 'react';
const ShuntButtonNOOCP1Square = ({ bottomlefttext, toplefttext, middletext, toprighttext, bottomrighttext, ...props }: SVGProps<SVGSVGElement> & { bottomlefttext?: string; toplefttext?: string; middletext?: string; toprighttext?: string; bottomrighttext?: string }) => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 75 75"
    {...props}
  >
    
    <rect fill="var(--bg-color, #b4bbbd)" x={0} width={75} height={75} />
    <rect fill="var(--stripe-color, #3b3b3b)" x={0} y={30} width={75} height={15} />
    <g>
      <circle fill="var(--detail-color, #6e6e6e)" cx={60} cy={37.5} r={10} />
      <circle fill="var(--main-color-alt, #b3b3b3)" cx={60} cy={37.5} r={8} />
      <circle style={{ animation: 'var(--shunt-button-animation, none)' }} fill="var(--color-shunt-button, #696969)" cx={60} cy={37.5} r={4.94} />
    </g>
  </svg>
);
export { ShuntButtonNOOCP1Square };
export default ShuntButtonNOOCP1Square;
