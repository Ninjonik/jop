import type { ReactNode } from 'react';

export const metadata = {
  referrer: 'no-referrer',
  title: 'ZSSK DIS — Dopravný Informačný Systém',
  description: 'Interný informačný systém ZSSK pre výpravcov a rušňovodičov',
};

export default function DisLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
