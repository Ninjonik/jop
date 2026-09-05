'use client';

import type { SVGProps } from 'react';
const LevelCrossingEnd = (props: SVGProps<SVGSVGElement>) => (
  <svg
    id="Layer_1"
    data-name="Layer 1"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 75 75"
    {...props}
  >
    <defs>
      <style>
        {
          '\n      .cls-1 {\n        fill: #3b3b3b;\n      }\n\n      .cls-2 {\n        fill: #b4bbbd;\n      }\n    '
        }
      </style>
    </defs>
    <rect className="cls-2" width={75} height={75} />
    <polygon
      className="cls-1"
      points="66.74 17.08 62.41 19.58 52.55 2.5 52.55 0 57.55 0 57.55 1.16 66.74 17.08"
    />
    <polygon
      className="cls-1"
      points="22.45 0 22.45 2.5 12.59 19.58 8.26 17.08 17.45 1.16 17.45 0 22.45 0"
    />
  </svg>
);
export default LevelCrossingEnd;
