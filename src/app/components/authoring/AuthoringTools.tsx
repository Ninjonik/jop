'use client';
import { useTranslation } from '@/lib/i18n/client';

import { ResizablePanel } from '@/app/components/ui/ResizablePanel';
import { type ReactNode } from 'react';

export default function AuthoringTools({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  const t = useTranslation();

  return (
    <ResizablePanel id={id} title={t(title)} edge="top" defaultSize={240}>
      {children}
    </ResizablePanel>
  );
}
