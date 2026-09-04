'use client';

import type { SVGProps } from 'react';

const LevelCrossing = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 75 75" xmlns="http://www.w3.org/2000/svg" {...props}>
    <image href="/LevelCrossing.svg" width={75} height={75} />
  </svg>
);

export default LevelCrossing;
