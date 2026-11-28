'use client';
import {
  DispatcherFeedbackProvider,
  DispatcherFeedbackStatus,
} from '@/app/components/ui/DispatcherFeedback';
import { useTranslation } from '@/lib/i18n/client';
import { useEffect, useRef, type ReactNode } from 'react';
export function GvdDialog({
  title,
  onClose,
  children,
  compact = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  compact?: boolean;
}) {
  const t = useTranslation();
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = root.current?.querySelector<HTMLElement>('button,input,select,textarea');
    first?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter((e) => e.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      previous?.focus();
    };
  }, []);
  return (
    <div className="gvd-dialog-backdrop">
      <section
        ref={root}
        className={`gvd-dialog ${compact ? 'gvd-tool-dialog' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <strong>{title}</strong>
          <button className="aero-btn" onClick={onClose}>
            {t('Zavrieť')}
          </button>
        </header>
        <DispatcherFeedbackProvider>
          {children}
          <div className="dialog-feedback-status">
            <DispatcherFeedbackStatus />
          </div>
        </DispatcherFeedbackProvider>
      </section>
    </div>
  );
}
