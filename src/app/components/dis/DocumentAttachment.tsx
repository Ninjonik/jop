'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';

import { disRequest } from '@/lib/dis/api-client';
import { attachmentExtension } from '@/lib/dis/attachment-types';
import { useEffect, useState } from 'react';

type Preview = {
  url: string;
  name: string;
  mime: string;
  size: number;
  pages: string[];
  notice: string;
};

async function officeText(blob: Blob, extension: string) {
  const { unzipSync, strFromU8 } = await import('fflate');
  let total = 0;
  const parts = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
    filter: (entry) => {
      const wanted =
        extension === 'docx'
          ? entry.name === 'word/document.xml'
          : /^ppt\/slides\/slide\d+\.xml$/.test(entry.name) ||
            ['ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels'].includes(entry.name);
      if (!wanted) return false;
      total += entry.originalSize;
      if (entry.originalSize > 2 * 1024 * 1024 || total > 15 * 1024 * 1024)
        throw new Error('Preview too large');
      return true;
    },
  });
  const xml = (path: string) => {
    if (!parts[path]) throw new Error('Missing document part');
    const document = new DOMParser().parseFromString(strFromU8(parts[path]), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('Invalid XML');
    return document;
  };
  if (extension === 'docx')
    return [
      Array.from(xml('word/document.xml').getElementsByTagName('w:p'))
        .map((paragraph) =>
          Array.from(paragraph.getElementsByTagName('w:t'))
            .map((node) => node.textContent || '')
            .join(''),
        )
        .join('\n'),
    ];
  const relations = new Map(
    Array.from(xml('ppt/_rels/presentation.xml.rels').getElementsByTagName('Relationship')).map(
      (node) => [node.getAttribute('Id'), node.getAttribute('Target') || ''],
    ),
  );
  return Array.from(xml('ppt/presentation.xml').getElementsByTagName('p:sldId'))
    .slice(0, 200)
    .map((slide) => {
      const target = relations.get(slide.getAttribute('r:id')) || '';
      const path = target.startsWith('/ppt/') ? target.slice(1) : 'ppt/' + target;
      return Array.from(xml(path).getElementsByTagName('a:p'))
        .map((paragraph) =>
          Array.from(paragraph.getElementsByTagName('a:t'))
            .map((node) => node.textContent || '')
            .join(''),
        )
        .filter(Boolean)
        .join('\n');
    });
}

export function DocumentAttachment({
  src,
  label,
  image = false,
}: {
  src: string;
  label: string;
  image?: boolean;
}) {
  const [requested, setRequested] = useState(image);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!requested) return;
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await disRequest(src, { signal: controller.signal });
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const name = encodedName
          ? decodeURIComponent(encodedName)
          : disposition.match(/filename="([^"]+)"/)?.[1] || label;
        const extension = attachmentExtension(name);
        let pages: string[] = [],
          notice = '';
        if (['txt', 'md', 'csv'].includes(extension || '')) {
          pages = [await blob.slice(0, 100000).text()];
          if (blob.size > 100000)
            notice = 'Zobrazený je začiatok súboru. Celý obsah nájdete v stiahnutom súbore.';
        } else if (extension === 'pptx' || extension === 'docx') {
          try {
            pages = await officeText(blob, extension);
          } catch {
            notice = 'Textový náhľad tohto súboru nie je dostupný. Súbor si môžete stiahnuť.';
          }
          if (!notice)
            notice =
              'Textový náhľad · pôvodné rozloženie, obrázky a animácie zobrazíte po otvorení stiahnutého súboru.';
        }
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, name, mime: blob.type, size: blob.size, pages, notice });
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : 'Prílohu sa nepodarilo načítať.');
      }
    })();
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, requested, label]);
  const isImage = preview?.mime.startsWith('image/');
  const extension = attachmentExtension(preview?.name || label);
  const fileIcon =
    extension === 'pdf'
      ? 'pdf'
      : extension === 'ppt' || extension === 'pptx'
        ? 'presentation'
        : extension === 'doc' || extension === 'docx'
          ? 'word'
          : extension === 'xls' || extension === 'xlsx' || extension === 'csv'
            ? 'spreadsheet'
            : extension === 'zip'
              ? 'archive'
              : 'document';
  return (
    <>
      {image ? (
        preview && isImage ? (
          <button
            type="button"
            className="document-image-button my-2 block max-w-full cursor-zoom-in"
            onClick={() => setOpen(true)}
            title="Zväčšiť obrázok"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.url}
              alt={label}
              loading="lazy"
              className="max-h-[480px] max-w-full object-contain"
            />
          </button>
        ) : (
          <span>{error || 'Načítavam obrázok…'}</span>
        )
      ) : (
        <span className="my-2 flex flex-wrap items-center gap-2 rounded-sm border border-[var(--aero-panel-border)] bg-[var(--grid-row-alt)] p-3">
          <span className="min-w-0 flex-1 break-words">
            <strong className="flex items-center gap-2">
              <AeroIcon name={fileIcon} /> {label}
            </strong>
            {preview && (
              <span className="text-xs text-[var(--aero-text-muted)]">
                {(preview.size / 1024).toLocaleString('sk-SK', { maximumFractionDigits: 0 })} KB
              </span>
            )}
          </span>
          <button
            type="button"
            className="aero-btn"
            onClick={() => {
              setRequested(true);
              setOpen(true);
            }}
          >
            <AeroIcon name="preview" />
            Zobraziť prílohu
          </button>
          {preview && (
            <a className="aero-btn" href={preview.url} download={preview.name}>
              <AeroIcon name="download" />
              Stiahnuť
            </a>
          )}
        </span>
      )}
      {open && (
        <dialog
          ref={(dialog) => {
            if (dialog && !dialog.open) dialog.showModal();
          }}
          onCancel={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          className="document-preview-dialog w-[min(960px,95vw)] max-h-[90vh] border border-[var(--aero-window-border)] bg-[var(--aero-panel-bg)] p-0 text-[var(--aero-text)] backdrop:bg-black/50"
        >
          <div className="authoring-caption sticky top-0 z-10">
            <strong className="mr-auto truncate">{preview?.name || label}</strong>
            {preview && (
              <a className="aero-btn" href={preview.url} download={preview.name}>
                <AeroIcon name="download" />
                Stiahnuť súbor
              </a>
            )}
            <button type="button" className="aero-btn" onClick={() => setOpen(false)}>
              <AeroIcon name="close" />
              Zavrieť
            </button>
          </div>
          {!preview ? (
            <p role={error ? 'alert' : 'status'} className="p-5">
              {error || 'Načítavam prílohu…'}
            </p>
          ) : (
            <div className="max-h-[78vh] overflow-auto p-4">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt={label} className="mx-auto max-w-full" />
              ) : preview.mime === 'application/pdf' ? (
                <>
                  <iframe
                    src={preview.url}
                    title={preview.name}
                    className="h-[65vh] w-full border-0"
                  />
                  <p className="mt-2 text-xs">
                    Ak prehliadač náhľad PDF nepodporuje, použite tlačidlo „Stiahnuť súbor“.
                  </p>
                </>
              ) : preview.pages.length ? (
                <>
                  {preview.notice && (
                    <p className="mb-3 text-xs text-[var(--aero-text-muted)]">{preview.notice}</p>
                  )}
                  {preview.pages.map((page, index) => (
                    <section
                      key={index}
                      className="mb-3 border border-[var(--aero-panel-border)] p-4"
                    >
                      {attachmentExtension(preview.name) === 'pptx' && (
                        <h3 className="mb-3 font-semibold">Snímka {index + 1}</h3>
                      )}
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
                        {page || 'Táto snímka neobsahuje text.'}
                      </pre>
                    </section>
                  ))}
                </>
              ) : (
                <div className="p-6">
                  <strong>{preview.name}</strong>
                  <p className="mt-2">
                    {preview.notice ||
                      'Pre tento formát nie je náhľad v prehliadači dostupný. Stiahnite súbor a otvorte ho vo svojej aplikácii.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </dialog>
      )}
    </>
  );
}
