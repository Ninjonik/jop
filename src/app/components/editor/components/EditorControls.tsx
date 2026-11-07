'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';

import type { LayoutExpansionDirection } from '../utils';

interface Props {
  width: number;
  height: number;
  pieceIdLookup: string;
  jopPieceLinksInput: string;
  jopPieceLinksError: string | null;
  showTraversablePaths: boolean;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onPieceIdLookupChange: (value: string) => void;
  onFindPieceId: () => void;
  onJopPieceLinksInputChange: (value: string) => void;
  onHighlightJopPieceLinks: () => void;
  onShowTraversablePathsChange: (value: boolean) => void;
  onSet: () => void;
  onExpand: (direction: LayoutExpansionDirection) => void;
  onImport: () => void;
  onExport: () => void;
  onSave?: () => void;
  saveLabel?: string;
}

export default function EditorControls({
  width,
  height,
  pieceIdLookup,
  jopPieceLinksInput,
  jopPieceLinksError,
  showTraversablePaths,
  onWidthChange,
  onHeightChange,
  onPieceIdLookupChange,
  onFindPieceId,
  onJopPieceLinksInputChange,
  onHighlightJopPieceLinks,
  onShowTraversablePathsChange,
  onSet,
  onExpand,
  onImport,
  onExport,
  onSave,
  saveLabel,
}: Props) {
  return (
    <div className="authoring-controls space-y-2 border-b border-[var(--aero-ribbon-border)] bg-[var(--aero-ribbon-bg)] p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onImport} className="aero-btn">
          <AeroIcon name="open" />
          Otvoriť zo súboru…
        </button>
        <button type="button" onClick={onExport} className="aero-btn">
          <AeroIcon name="download" />
          Stiahnuť plán
        </button>
        {onSave && (
          <button type="button" onClick={onSave} className="aero-btn">
            <AeroIcon name="save" />
            {saveLabel ?? 'Uložiť koľajisko'}
          </button>
        )}
        <label className="ml-2 flex items-center gap-1">
          <input
            type="checkbox"
            checked={showTraversablePaths}
            onChange={(event) => onShowTraversablePathsChange(event.target.checked)}
          />
          Zobraziť priechodné cesty
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <strong>Rozmer koľajiska</strong>
        <label className="flex items-center gap-1">
          Šírka
          <input
            type="number"
            min={1}
            value={width}
            onChange={(event) => onWidthChange(Number(event.target.value) || 1)}
            className="aero-input w-16"
          />
        </label>
        <label className="flex items-center gap-1">
          Výška
          <input
            type="number"
            min={1}
            value={height}
            onChange={(event) => onHeightChange(Number(event.target.value) || 1)}
            className="aero-input w-16"
          />
        </label>
        <button
          type="button"
          onClick={onSet}
          className="aero-btn"
          title="Vymaže aktuálne koľajisko a vytvorí nové"
        >
          <AeroIcon name="add" />
          Vytvoriť prázdne koľajisko
        </button>
        <span className="ml-2">Rozšíriť:</span>
        {(
          [
            ['top', '↑', 'nahor'],
            ['left', '←', 'doľava'],
            ['right', '→', 'doprava'],
            ['bottom', '↓', 'nadol'],
          ] as const
        ).map(([direction, , label]) => (
          <button
            key={direction}
            type="button"
            className="aero-btn"
            onClick={() => onExpand(direction)}
            aria-label={`Rozšíriť ${label}`}
          >
            <AeroIcon
              name={
                direction === 'top'
                  ? 'up'
                  : direction === 'bottom'
                    ? 'down'
                    : direction === 'left'
                      ? 'back'
                      : 'right'
              }
            />
          </button>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-[var(--aero-text-muted)]">
          Vyhľadanie prvkov a technické prepojenia
        </summary>
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <label className="grid gap-1">
            Identifikátor prvku
            <input
              className="aero-input w-40"
              value={pieceIdLookup}
              onChange={(event) => onPieceIdLookupChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onFindPieceId();
              }}
            />
          </label>
          <button type="button" className="aero-btn mt-5" onClick={onFindPieceId}>
            <AeroIcon name="search" />
            Nájsť prvok
          </button>
          <label className="grid min-w-0 gap-1">
            Prepojenia z Roblox (JOPPieceLinks)
            <textarea
              className="aero-input h-auto! w-80 max-w-full resize-y font-mono"
              rows={2}
              value={jopPieceLinksInput}
              onChange={(event) => onJopPieceLinksInputChange(event.target.value)}
            />
          </label>
          <button type="button" className="aero-btn mt-5" onClick={onHighlightJopPieceLinks}>
            <AeroIcon name="link" />
            Zvýrazniť prepojenia
          </button>
          {jopPieceLinksError && (
            <p role="alert" className="text-red-700">
              {jopPieceLinksError}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
