'use client';

import { disFetch } from '@/lib/dis/api-client';
import {
  attachmentAccept,
  attachmentExtension,
  attachmentMaxBytes,
} from '@/lib/dis/attachment-types';
import { useRef, useState } from 'react';
import { DocumentMarkdown } from './DocumentMarkdown';

const tools = [
  { label: 'Nadpis', text: 'H', before: '## ', after: '', sample: 'Nadpis' },
  { label: 'Tučné (Ctrl+B)', text: 'B', before: '**', after: '**', sample: 'tučný text' },
  { label: 'Kurzíva (Ctrl+I)', text: 'I', before: '*', after: '*', sample: 'text kurzívou' },
  {
    label: 'Odkaz (Ctrl+K)',
    text: 'Odkaz',
    before: '[',
    after: '](https://)',
    sample: 'názov odkazu',
  },
  { label: 'Odrážky', text: '• Zoznam', before: '- ', after: '', sample: 'Položka\nPoložka' },
  {
    label: 'Číslovaný zoznam',
    text: '1. Zoznam',
    before: '1. ',
    after: '',
    sample: 'Položka\nPoložka',
  },
  { label: 'Kontrolný zoznam', text: '☑ Úlohy', before: '- [ ] ', after: '', sample: 'Úloha' },
  { label: 'Citácia', text: '❝ Citácia', before: '> ', after: '', sample: 'Citovaný text' },
  { label: 'Kód', text: '</>', before: '`', after: '`', sample: 'kód' },
  {
    label: 'Tabuľka',
    text: 'Tabuľka',
    before: '\n',
    after: '\n',
    sample: '| Stĺpec | Stĺpec |\n| --- | --- |\n| Hodnota | Hodnota |',
  },
] as const;

export function MarkdownEditor({
  value,
  onChange,
  disabled,
  onUploadingChange,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onUploadingChange: (busy: boolean) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const [mode, setMode] = useState<'write' | 'split' | 'preview'>('split');
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const busy = disabled || !!uploading;
  function insert(before: string, after = '', sample = '') {
    let start = textarea.current?.selectionStart ?? value.length;
    let end = textarea.current?.selectionEnd ?? start;
    const linePrefix = ['## ', '- ', '1. ', '- [ ] ', '> '].includes(before);
    if (linePrefix) {
      start = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = value.indexOf('\n', end);
      end = lineEnd < 0 ? value.length : lineEnd;
    }
    const text = value.slice(start, end) || sample;
    const replacement = linePrefix
      ? text
          .split('\n')
          .map((line, index) => (before === '1. ' ? `${index + 1}. ` : before) + line)
          .join('\n')
      : before + text + after;
    const next = value.slice(0, start) + replacement + value.slice(end);
    if (next.length > 50000) {
      setError('Dokument môže obsahovať najviac 50 000 znakov.');
      return;
    }
    onChange(next);
    if (mode === 'preview') setMode('write');
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start, start + replacement.length);
    });
  }
  async function upload(files: File[]) {
    if (!files.length || disabled || uploadLock.current) return;
    const invalid = files.find(
      (file) =>
        !attachmentExtension(file.name) || file.size === 0 || file.size > attachmentMaxBytes,
    );
    if (invalid) {
      setError(`Súbor „${invalid.name}“ nie je podporovaný, je prázdny alebo prekračuje 10 MB.`);
      return;
    }
    uploadLock.current = true;
    onUploadingChange(true);
    setError('');
    const snippets: string[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        setUploading(`Nahrávam ${index + 1}/${files.length}: ${files[index].name}`);
        const body = new FormData();
        body.set('file', files[index]);
        const result = await disFetch<{ markdownSnippet: string }>('/api/dis/upload', {
          method: 'POST',
          body,
        });
        snippets.push(result.markdownSnippet);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Súbor sa nepodarilo nahrať.');
    } finally {
      if (snippets.length) insert('\n\n' + snippets.join('\n\n') + '\n\n');
      setUploading('');
      uploadLock.current = false;
      onUploadingChange(false);
    }
  }
  return (
    <section
      className="flex min-h-80 flex-1 flex-col border border-[var(--aero-panel-border)]"
      aria-label="Editor dokumentu"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void upload(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap gap-1 border-b border-[var(--aero-panel-border)] bg-[var(--aero-ribbon-bg)] p-2">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            className="aero-btn"
            title={tool.label}
            aria-label={tool.label}
            disabled={busy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(tool.before, tool.after, tool.sample)}
          >
            {tool.text}
          </button>
        ))}
        <button
          type="button"
          className="aero-btn"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          📎 Pridať obrázok alebo súbor…
        </button>
      </div>
      <div
        className="flex flex-wrap gap-1 border-b border-[var(--aero-panel-border)] bg-[var(--aero-menubar-bg)] p-2"
        aria-label="Zobrazenie editora"
      >
        {(
          [
            ['write', 'Písanie'],
            ['split', 'Písanie a náhľad'],
            ['preview', 'Náhľad'],
          ] as const
        ).map(([id, title]) => (
          <button
            key={id}
            type="button"
            className={`aero-btn ${mode === id ? 'active' : ''}`}
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
          >
            {title}
          </button>
        ))}
        <span className="ml-auto self-center text-[var(--aero-text-muted)]">
          {value.length.toLocaleString('sk-SK')} / 50 000
        </span>
      </div>
      {error && (
        <p role="alert" className="border-b border-red-200 bg-red-50 p-2 text-red-700">
          {error}
        </p>
      )}
      {uploading && (
        <p role="status" className="p-2">
          {uploading}
        </p>
      )}
      {dragging && (
        <div className="border-2 border-dashed border-[var(--btn-hover-border)] bg-[var(--grid-row-selected-top)] p-4 text-center">
          Pustite súbory sem
        </div>
      )}
      <div className={`grid min-h-80 flex-1 ${mode === 'split' ? 'lg:grid-cols-2' : ''}`}>
        {mode !== 'preview' && (
          <label className="flex min-w-0 flex-col">
            <span className="border-b border-[var(--grid-row-border)] px-3 py-1 text-[var(--aero-text-muted)]">
              Text dokumentu (Markdown)
            </span>
            <textarea
              ref={textarea}
              aria-label="Obsah dokumentu v Markdown"
              className="min-h-80 w-full flex-1 resize-y bg-[var(--aero-panel-bg)] p-3 font-mono text-sm leading-6 text-[var(--aero-text)] outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--btn-hover-border)]"
              maxLength={50000}
              value={value}
              disabled={busy}
              placeholder="Napíšte text dokumentu. Formátovanie pridáte tlačidlami vyššie…"
              onChange={(event) => onChange(event.target.value)}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (files.length) {
                  event.preventDefault();
                  void upload(files);
                }
              }}
              onKeyDown={(event) => {
                if (
                  (event.ctrlKey || event.metaKey) &&
                  ['b', 'i', 'k'].includes(event.key.toLowerCase())
                ) {
                  event.preventDefault();
                  const tool =
                    tools[{ b: 1, i: 2, k: 3 }[event.key.toLowerCase() as 'b' | 'i' | 'k']];
                  insert(tool.before, tool.after, tool.sample);
                }
              }}
            />
          </label>
        )}
        {mode !== 'write' && (
          <div className="min-w-0 border-t border-[var(--aero-panel-border)] lg:border-t-0 lg:border-l">
            <div className="border-b border-[var(--grid-row-border)] px-3 py-1 text-[var(--aero-text-muted)]">
              Takto bude dokument vyzerať
            </div>
            <div className="max-h-[65vh] overflow-auto p-4">
              {value ? (
                <DocumentMarkdown content={value} />
              ) : (
                <p className="text-[var(--aero-text-muted)]">Náhľad sa zobrazí počas písania.</p>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="border-t border-[var(--aero-panel-border)] bg-[var(--status-bg)] px-3 py-2 text-[var(--aero-text-muted)]">
        Súbory môžete aj pretiahnuť sem alebo vložiť obrázok zo schránky. Obrázky, PDF, Office, TXT,
        Markdown, CSV a ZIP · najviac 10 MB na súbor.
      </p>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={attachmentAccept}
        className="hidden"
        onChange={(event) => {
          void upload(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
    </section>
  );
}
