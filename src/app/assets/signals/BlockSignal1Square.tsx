'use client';

import type { SVGProps } from 'react';

import Entry1Square from './Entry1Square';

/**
 * An automatic block signal has the same panel representation as an entry
 * signal. Keeping this wrapper separate gives the domain its own tile key.
 */
export default function BlockSignal1Square(props: SVGProps<SVGSVGElement> & { text?: string }) {
  return <Entry1Square {...props} />;
}
