'use client';

import { useId, useState } from 'react';

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
}: {
  value: string;
  options: AutocompleteOption[];
  label: string;
  placeholder?: string;
  onInput: (value: string) => void;
  onSelect: (option: AutocompleteOption) => void;
  disabled?: boolean;
  placement?: 'up' | 'down';
}) {
  const listId = useId();
  const [search, setSearch] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = options.filter((option) =>
    `${option.label} ${option.description || ''}`
      .toLocaleLowerCase('sk')
      .includes((search || '').toLocaleLowerCase('sk')),
  );
  function select(option: AutocompleteOption) {
    onSelect(option);
    setSearch(null);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="relative min-w-40">
      <input
        className="aero-input w-full"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={search ?? value}
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
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={`aero-autocomplete-options ${placement === 'up' ? 'aero-autocomplete-up' : ''}`}
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
          {!matches.length && <li role="presentation">Žiadne zodpovedajúce možnosti.</li>}
        </ul>
      )}
    </div>
  );
}
