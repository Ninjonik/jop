'use client';
import { useLocaleTag, useTranslation } from '@/lib/i18n/client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type AutocompleteOption = { value: string; label: string; description?: string };

/** One input and one suggestion list, shared by station and train selection. */
export function AeroAutocomplete({
  value,
  options,
  label,
  placeholder,
  onInput,
  onSelect,
  disabled = false,
  placement = 'down',
  portal = false,
}: {
  value: string;
  options: AutocompleteOption[];
  label: string;
  placeholder?: string;
  onInput: (value: string) => void;
  onSelect: (option: AutocompleteOption) => void;
  disabled?: boolean;
  placement?: 'up' | 'down';
  portal?: boolean;
}) {
  const t = useTranslation();
  const localeTag = useLocaleTag();
  const listId = useId();
  const [search, setSearch] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!portal || !open) return;
    const align = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 8;
      const up = below < 160 && rect.top > below;
      setPosition({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        right: 'auto',
        top: up ? 'auto' : rect.bottom,
        bottom: up ? window.innerHeight - rect.top : 'auto',
        maxHeight: Math.max(40, Math.min(240, up ? rect.top - 8 : below)),
        zIndex: 1000,
      });
    };
    align();
    window.addEventListener('scroll', align, true);
    window.addEventListener('resize', align);
    return () => {
      window.removeEventListener('scroll', align, true);
      window.removeEventListener('resize', align);
    };
  }, [portal, open]);
  const searchKey = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase(localeTag);
  const matches = options.filter((option) =>
    searchKey(`${option.label} ${option.description || ''}`).includes(searchKey(search || '')),
  );
  function select(option: AutocompleteOption) {
    onSelect(option);
    setSearch(null);
    setOpen(false);
    setActive(-1);
  }
  const suggestions = (
    <ul
      id={listId}
      role="listbox"
      aria-label={label}
      style={portal ? position : undefined}
      className={`aero-autocomplete-options ${!portal && placement === 'up' ? 'aero-autocomplete-up' : ''}`}
    >
      {matches.map((option, index) => (
        <li
          key={option.value}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === active}
          className={index === active ? 'active' : ''}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => select(option)}
        >
          {option.label}
          {option.description && (
            <span className="ml-2 text-[var(--aero-text-muted)]">{option.description}</span>
          )}
        </li>
      ))}
      {!matches.length && <li role="presentation">{t('Žiadne zodpovedajúce možnosti.')}</li>}
    </ul>
  );
  return (
    <div className="relative min-w-40">
      <input
        ref={input}
        className="aero-input w-full"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={search ?? options.find((option) => option.value === value)?.label ?? value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setSearch(null);
          setActive(-1);
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          onInput(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((previous) =>
              matches.length
                ? (previous + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
                  matches.length
                : -1,
            );
            const next = matches.length
              ? (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length
              : -1;
            document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
          } else if (event.key === 'Enter' && open) {
            const match = matches[active] || (matches.length === 1 ? matches[0] : undefined);
            if (match) {
              event.preventDefault();
              select(match);
            } else setOpen(false);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setSearch(null);
            setActive(-1);
          }
        }}
      />
      {open && (portal ? createPortal(suggestions, document.body) : suggestions)}
    </div>
  );
}
