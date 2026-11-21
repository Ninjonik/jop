'use client';

import { useDisAuth } from '@/lib/dis/auth-context';
import { useTranslation } from '@/lib/i18n/client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AeroIcon } from './AeroIcon';

type Edge = 'left' | 'right' | 'top' | 'bottom';
type Layout = { size: number; collapsed: boolean };
const ResizablePanelContext = createContext({ collapsed: false, expand: () => {} });
export function useResizablePanel() {
  return useContext(ResizablePanelContext);
}

function readLayout(key: string, defaultSize: number): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Number.isFinite(saved.size) && typeof saved.collapsed === 'boolean')
      return { size: Math.max(60, Math.min(10000, saved.size)), collapsed: saved.collapsed };
  } catch {
    /* A disabled or invalid store must not prevent using the panel. */
  }
  return { size: defaultSize, collapsed: false };
}

/** Keep children mounted while collapsed: audio, subscriptions and drafts stay alive. */
export function ResizablePanel({
  id,
  title,
  edge,
  defaultSize,
  children,
  responsive = false,
}: {
  id: string;
  title: string;
  edge: Edge;
  defaultSize: number;
  children: ReactNode;
  responsive?: boolean;
}) {
  const t = useTranslation();
  const { profile } = useDisAuth();
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 850px)').matches);
  const position = responsive && narrow ? (edge === 'right' ? 'bottom' : 'top') : edge;
  const vertical = position === 'left' || position === 'right';
  const key = `dis-panel:${profile?.userId || 'local'}:${id}:${position}`;
  const initialSize = responsive && narrow ? Math.min(defaultSize, 240) : defaultSize;
  const [saved, setSaved] = useState(() => ({ key, layout: readLayout(key, initialSize) }));
  const layout = saved.key === key ? saved.layout : readLayout(key, initialSize);
  const current = useRef(layout);
  useEffect(() => {
    current.current = layout;
  }, [layout]);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ start: number; size: number } | null>(null);
  const contentId = useId();
  useEffect(() => {
    const media = window.matchMedia('(max-width: 850px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null)
        setSaved({ key, layout: readLayout(key, initialSize) });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key, initialSize]);

  const save = (next: Layout, persist = true) => {
    current.current = next;
    setSaved({ key, layout: next });
    if (persist) {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Keep the current layout. */
      }
    }
  };
  const expandAction = useRef<() => void>(() => {});
  useEffect(() => {
    expandAction.current = () => save({ ...current.current, collapsed: false });
  });
  const expand = useCallback(() => expandAction.current(), []);
  const resize = (size: number, persist = true) => {
    const parent = panel.current?.parentElement?.getBoundingClientRect();
    const available = parent ? (vertical ? parent.width : parent.height) : 1200;
    const clamped = Math.min(10000, Math.max(60, available * 0.7), Math.max(0, size));
    save(
      {
        size: clamped < 40 ? current.current.size : Math.max(60, clamped),
        collapsed: clamped < 40,
      },
      persist,
    );
  };
  const toggle = () => save({ ...current.current, collapsed: !current.current.collapsed });

  return (
    <section
      ref={panel}
      className={`aero-resizable-panel is-${position}${layout.collapsed ? ' is-collapsed' : ''}`}
      aria-label={title}
      style={{
        flexBasis: layout.collapsed ? 24 : layout.size,
        ...(vertical
          ? { width: layout.collapsed ? 24 : layout.size }
          : { height: layout.collapsed ? 24 : layout.size }),
      }}
    >
      <div
        className="aero-panel-splitter"
        role="separator"
        tabIndex={0}
        aria-label={t('Zmeniť veľkosť panela {0}', title)}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        aria-controls={contentId}
        aria-valuemin={0}
        aria-valuemax={10000}
        aria-valuenow={layout.collapsed ? 0 : Math.round(layout.size)}
        title={t('Potiahnutím zmeníte veľkosť. Dvojklik panel zbalí alebo rozbalí.')}
        onDoubleClick={toggle}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = panel.current!.getBoundingClientRect();
          drag.current = {
            start: vertical ? event.clientX : event.clientY,
            size: vertical ? rect.width : rect.height,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const delta = (vertical ? event.clientX : event.clientY) - drag.current.start;
          resize(
            drag.current.size + (position === 'right' || position === 'bottom' ? -delta : delta),
            false,
          );
        }}
        onLostPointerCapture={() => {
          if (drag.current) {
            drag.current = null;
            save(current.current);
          }
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={(event) => {
          const decrease = vertical ? 'ArrowLeft' : 'ArrowUp';
          const increase = vertical ? 'ArrowRight' : 'ArrowDown';
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          } else if (event.key === 'Home') {
            event.preventDefault();
            save({ ...current.current, collapsed: true });
          } else if (event.key === decrease || event.key === increase) {
            event.preventDefault();
            const direction =
              (event.key === increase ? 1 : -1) *
              (position === 'right' || position === 'bottom' ? -1 : 1);
            resize((layout.collapsed ? 24 : layout.size) + direction * (event.shiftKey ? 50 : 20));
          }
        }}
      />
      <button
        type="button"
        className="aero-panel-caption"
        aria-expanded={!layout.collapsed}
        aria-controls={contentId}
        title={t(layout.collapsed ? 'Rozbaliť' : 'Zbaliť')}
        onClick={toggle}
      >
        <AeroIcon name={layout.collapsed ? 'expand' : 'collapse'} />
        <span>{title}</span>
      </button>
      <div id={contentId} className="aero-panel-body" hidden={layout.collapsed}>
        <ResizablePanelContext.Provider value={{ collapsed: layout.collapsed, expand }}>
          {children}
        </ResizablePanelContext.Provider>
      </div>
    </section>
  );
}
