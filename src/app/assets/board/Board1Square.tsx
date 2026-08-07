'use client';

import type { SVGProps } from 'react';
const Board1Square = ({ bottomlefttext, ...props }: SVGProps<SVGSVGElement> & { bottomlefttext?: string }) => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 75 75"
    {...props}
  >
    
    <rect fill="var(--bg-color, #b4bbbd)" width={75} height={75} />
  </svg>
);
export { Board1Square };
export default Board1Square;
