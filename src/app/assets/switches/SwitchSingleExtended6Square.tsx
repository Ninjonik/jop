'use client';

import type { SVGProps } from 'react';

type SwitchSingleExtendedProps = SVGProps<SVGSVGElement> & { bottomswitchtext?: string };

const SwitchSingleExtended6Square = ({ bottomswitchtext, ...props }: SwitchSingleExtendedProps) => (
  <svg viewBox="0 0 150 225" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect fill="var(--bg-color, #b4bbbd)" width={150} height={225} />
    <polygon
      fill="var(--stripe-color, #3b3b3b)"
      points="0 30 21.61 30.01 84.54 105 147.47 180 150 180 150 195 140.48 195 75 116.97 14.61 45 0 45"
    />
    <rect fill="var(--stripe-color, #3b3b3b)" y={180} width={150} height={15} />
    <rect fill="var(--occupation-bottomLeft-color, #6e6e6e)" x={5} y={183.5} width={65} height={8} rx={4} />
    <rect fill="var(--occupation-bottomLeft-color, #6e6e6e)" x={80} y={183.5} width={65} height={8} rx={4} />
    <rect
      fill="var(--occupation-middleLeft-color, #6e6e6e)"
      x={45.56}
      y={40.98}
      width={8}
      height={68.05}
      rx={3.82}
      transform="translate(-36.62 49.41) rotate(-40)"
    />
    <rect
      fill="var(--occupation-topRight-color, #6e6e6e)"
      x={104.8}
      y={111.58}
      width={8}
      height={68.05}
      rx={3.82}
      transform="translate(-68.14 104) rotate(-40)"
    />
    <path fill="var(--color-d9d9d9, #d9d9d9)" d="M150 217.5v-15h-32.73l-7.5 7.5 7.5 7.5H150Z" />
    <text
      x={133.63}
      y={210}
      textAnchor="middle"
      dominantBaseline="central"
      fill="var(--color-bottomswitchtext, #000000)"
      fontSize="var(--size-bottomswitchtext, 10px)"
    >
      {bottomswitchtext ?? 'Lower Switch Text'}
    </text>
  </svg>
);

export default SwitchSingleExtended6Square;
