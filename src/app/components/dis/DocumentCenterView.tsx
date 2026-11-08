'use client';
import { useLocaleTag, useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { DisDocument } from '@/lib/dis/records';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useState } from 'react';
import { DocumentMarkdown } from './DocumentMarkdown';
import { MarkdownEditor } from './MarkdownEditor';

export function DocumentCenterView() {
  const t = useTranslation();
  const localeTag = useLocaleTag();
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active =
    value.documents.find((document) => document.$id === selectedId) || value.documents[0];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy || uploading || !canManageStaff) return;
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
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--aero-panel-bg)] text-xs text-[var(--aero-text)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--aero-ribbon-border)] bg-[var(--aero-ribbon-bg)] p-2">
        <strong>{t('Dokumentačné centrum a SPP')}</strong>
        <button className="aero-btn" onClick={refresh}>
          <AeroIcon name="refresh" /> {t('Obnoviť')}{' '}
        </button>
        {canManageStaff && (
          <button
            className="aero-btn"
            disabled={busy || !!draft}
            onClick={() =>
              setDraft({ title: '', category: 'spp', contentMarkdown: '', isPublished: false })
            }
          >
            <AeroIcon name="newDocument" /> {t('Nový dokument')}{' '}
          </button>
        )}
      </div>
      {(error || loadError) && (
        <p role="alert" className="p-2 text-red-700">
          {t(error) || t(loadError)}
        </p>
      )}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-44 shrink-0 overflow-auto border-r border-[var(--aero-panel-border)] bg-[var(--grid-row-alt)] p-2 md:w-64">
          {loading ? (
            <p>{t('Načítavam dokumenty...')}</p>
          ) : value.documents.length === 0 ? (
            <p>{t('Žiadne publikované dokumenty.')}</p>
          ) : (
            value.documents.map((document) => (
              <button
                disabled={!!draft}
                key={document.$id}
                className={`block w-full border p-2 text-left mb-1 ${active?.$id === document.$id ? 'bg-blue-50 border-blue-400' : 'bg-white'}`}
                onClick={() => setSelectedId(document.$id)}
              >
                {document.title}
                {!document.isPublished && <span> {t('(Koncept)')}</span>}
              </button>
            ))
          )}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col overflow-auto p-3">
          {draft ? (
            <form onSubmit={save} className="flex flex-1 flex-col gap-3">
              <label className="grid gap-1">
                {' '}
                {t('Názov dokumentu')}{' '}
                <input
                  aria-label={t('Názov dokumentu')}
                  placeholder={t('Názov dokumentu')}
                  className="aero-input"
                  disabled={busy || uploading}
                  required
                  maxLength={256}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                {' '}
                {t('Kategória')}{' '}
                <input
                  aria-label={t('Kategória dokumentu')}
                  className="aero-input"
                  disabled={busy || uploading}
                  required
                  maxLength={64}
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
              </label>
              <MarkdownEditor
                value={draft.contentMarkdown || ''}
                disabled={busy || uploading}
                onUploadingChange={setUploading}
                onChange={(contentMarkdown) =>
                  setDraft((previous) => (previous ? { ...previous, contentMarkdown } : previous))
                }
              />
              <label>
                <input
                  type="checkbox"
                  disabled={busy || uploading}
                  checked={!!draft.isPublished}
                  onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })}
                />{' '}
                {t('Publikovať')}{' '}
              </label>
              <div className="flex gap-2">
                <button className="aero-btn" disabled={busy || uploading}>
                  <AeroIcon name="save" />
                  {busy ? t('Ukladám...') : t('Uložiť dokument')}
                </button>
                <button
                  type="button"
                  className="aero-btn"
                  disabled={busy || uploading}
                  onClick={() => setDraft(null)}
                >
                  <AeroIcon name="close" /> {t('Zrušiť')}{' '}
                </button>
              </div>
            </form>
          ) : active ? (
            <>
              <div className="flex gap-2 items-center">
                <h2 className="font-bold text-sm">{active.title}</h2>
                {canManageStaff && (
                  <button className="aero-btn" onClick={() => setDraft({ ...active })}>
                    <AeroIcon name="edit" /> {t('Upraviť')}{' '}
                  </button>
                )}
              </div>
              <p className="text-slate-500">
                {active.category} • {active.authorName} •{' '}
                {new Date(active.$updatedAt).toLocaleDateString(localeTag)}
              </p>
              <div className="mt-4">
                <DocumentMarkdown content={active.contentMarkdown} />
              </div>
            </>
          ) : (
            <p>{t('Vyberte alebo vytvorte dokument.')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
