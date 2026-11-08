'use client';
import { useTranslation } from '@/lib/i18n/client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocumentAttachment } from './DocumentAttachment';

export function DocumentMarkdown({ content }: { content: string }) {
  const t = useTranslation();
  return (
    <div className="dis-markdown select-text break-words">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <div className="my-3">{children}</div>,
          img: ({ src, alt }) =>
            typeof src === 'string' && src.startsWith('/api/dis/attachments/') ? (
              <DocumentAttachment key={src} src={src} label={alt || t('Obrázok')} image />
            ) : (
              <span>{alt || t('Externý obrázok')}</span>
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
        {content}
      </Markdown>
    </div>
  );
}
