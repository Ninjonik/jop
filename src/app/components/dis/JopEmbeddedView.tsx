'use client';
import { useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { useEffect, useRef } from 'react';

export function JopEmbeddedView({
  url,
  title,
  onClose,
  onNavigate,
}: {
  url: string;
  title: string;
  onClose: () => void;
  onNavigate: (url: string) => void;
}) {
  const t = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const detach = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const syncTheme = () =>
      frame.current?.contentDocument?.documentElement.classList.toggle(
        'dark',
        document.documentElement.classList.contains('dark'),
      );
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      detach.current?.();
    };
  }, []);
  function connectNavigation() {
    detach.current?.();
    const document = frame.current?.contentDocument;
    if (!document) return;
    document.documentElement.classList.toggle(
      'dark',
      window.document.documentElement.classList.contains('dark'),
    );
    const navigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const anchor = (event.target as Element).closest('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.origin);
      if (
        destination.origin !== window.location.origin ||
        !/^\/(?:$|dis$|editor$|linker$|map$|mock$|runtime\/)/.test(destination.pathname)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      onNavigate(destination.pathname + destination.search);
    };
    document.addEventListener('click', navigate, true);
    detach.current = () => document.removeEventListener('click', navigate, true);
  }
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b bg-[var(--aero-ribbon-bg)] p-2">
        <strong>{t(title)}</strong>
        <div className="flex gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="aero-btn">
            <AeroIcon name="launch" /> {t('Samostatné okno')}{' '}
          </a>
          <button onClick={onClose} className="aero-btn">
            <AeroIcon name="close" /> {t('Zavrieť nástroj')}{' '}
          </button>
        </div>
      </div>
      <iframe
        ref={frame}
        src={url}
        onLoad={connectNavigation}
        className="w-full flex-1 border-none"
        title={t(title)}
      />
    </div>
  );
}
