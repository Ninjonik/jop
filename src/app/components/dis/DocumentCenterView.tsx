'use client';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { DisDocument } from '@/lib/dis/records';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocumentAttachment } from './DocumentAttachment';

export function DocumentCenterView() {
  const { canManageStaff } = useDisAuth();
  const {
    value,
    error: loadError,
    loading,
    refresh,
  } = useDisResource<{ documents: DisDocument[] }>('/api/dis/documents', { documents: [] });
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Partial<DisDocument> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active =
    value.documents.find((document) => document.$id === selectedId) || value.documents[0];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy || !canManageStaff) return;
    setBusy(true);
    setError(null);
    try {
      const result = await disFetch<{ document: DisDocument }>('/api/dis/documents', {
        method: 'POST',
        body: JSON.stringify({
          id: draft.$id,
          title: draft.title,
          category: draft.category,
          contentMarkdown: draft.contentMarkdown,
          isPublished: !!draft.isPublished,
        }),
      });
      await refresh();
      setSelectedId(result.document.$id);
      setDraft(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Dokument sa nepodarilo uložiť.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('file', file);
      const result = await disFetch<{ markdownSnippet: string }>('/api/dis/upload', {
        method: 'POST',
        body,
      });
      setDraft((previous) =>
        previous
          ? {
              ...previous,
              contentMarkdown: `${previous.contentMarkdown || ''}\n\n${result.markdownSnippet}`,
            }
          : previous,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Nahrávanie zlyhalo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white text-xs">
      <div className="flex gap-2 border-b p-2">
        <strong>Dokumentačné centrum a SPP</strong>
        <button className="aero-btn" onClick={refresh}>
          Obnoviť
        </button>
        {canManageStaff && (
          <button
            className="aero-btn"
            disabled={busy || !!draft}
            onClick={() =>
              setDraft({ title: '', category: 'spp', contentMarkdown: '', isPublished: false })
            }
          >
            Nový dokument
          </button>
        )}
      </div>
      {(error || loadError) && (
        <p role="alert" className="p-2 text-red-700">
          {error || loadError}
        </p>
      )}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 overflow-auto border-r bg-slate-50 p-2">
          {loading ? (
            <p>Načítavam dokumenty...</p>
          ) : value.documents.length === 0 ? (
            <p>Žiadne publikované dokumenty.</p>
          ) : (
            value.documents.map((document) => (
              <button
                disabled={!!draft}
                key={document.$id}
                className={`block w-full border p-2 text-left mb-1 ${active?.$id === document.$id ? 'bg-blue-50 border-blue-400' : 'bg-white'}`}
                onClick={() => setSelectedId(document.$id)}
              >
                {document.title}
                {!document.isPublished && <span> (Koncept)</span>}
              </button>
            ))
          )}
        </aside>
        <div className="flex flex-1 flex-col overflow-auto p-4">
          {draft ? (
            <form onSubmit={save} className="flex flex-1 flex-col gap-3">
              <input
                aria-label="Názov dokumentu"
                placeholder="Názov dokumentu"
                className="aero-input"
                required
                maxLength={256}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
              <input
                aria-label="Kategória dokumentu"
                className="aero-input"
                required
                maxLength={64}
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              />
              <textarea
                aria-label="Obsah dokumentu v Markdown"
                className="aero-input flex-1 min-h-64 font-mono"
                maxLength={50000}
                value={draft.contentMarkdown}
                onChange={(event) => setDraft({ ...draft, contentMarkdown: event.target.value })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={!!draft.isPublished}
                  onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })}
                />{' '}
                Publikovať
              </label>
              <label>
                Príloha (PNG, JPG, WebP alebo PDF, max. 10 MB){' '}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = '';
                  }}
                />
              </label>
              <div className="flex gap-2">
                <button className="aero-btn" disabled={busy}>
                  {busy ? 'Ukladám...' : 'Uložiť dokument'}
                </button>
                <button
                  type="button"
                  className="aero-btn"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Zrušiť
                </button>
              </div>
            </form>
          ) : active ? (
            <>
              <div className="flex gap-2 items-center">
                <h2 className="font-bold text-sm">{active.title}</h2>
                {canManageStaff && (
                  <button className="aero-btn" onClick={() => setDraft({ ...active })}>
                    Upraviť
                  </button>
                )}
              </div>
              <p className="text-slate-500">
                {active.category} • {active.authorName} •{' '}
                {new Date(active.$updatedAt).toLocaleDateString('sk-SK')}
              </p>
              <div className="dis-markdown mt-4 select-text">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    img: ({ src, alt }) =>
                      typeof src === 'string' && src.startsWith('/api/dis/attachments/') ? (
                        <DocumentAttachment key={src} src={src} label={alt || 'Príloha'} image />
                      ) : (
                        <span>{alt || 'Externý obrázok'}</span>
                      ),
                    a: ({ href, children }) =>
                      href?.startsWith('/api/dis/attachments/') ? (
                        <DocumentAttachment key={href} src={href} label={String(children)} />
                      ) : (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                  }}
                >
                  {active.contentMarkdown}
                </Markdown>
              </div>
            </>
          ) : (
            <p>Vyberte alebo vytvorte dokument.</p>
          )}
        </div>
      </div>
    </div>
  );
}
