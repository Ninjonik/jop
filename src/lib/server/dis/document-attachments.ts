import { attachmentExtension, type AttachmentExtension } from '@/lib/dis/attachment-types';
import { unzipSync } from 'fflate';
import { DisError } from './appwrite';

export function validateDocumentAttachment(buffer: Buffer, name: string): AttachmentExtension {
  const extension = attachmentExtension(name);
  if (!extension)
    throw new DisError(
      400,
      'Tento typ súboru nie je podporovaný. Vyberte obrázok, PDF, dokument Office, text alebo ZIP.',
    );
  const starts = (...bytes: number[]) =>
    buffer.subarray(0, bytes.length).equals(Buffer.from(bytes));
  let valid = false;
  switch (extension) {
    case 'png':
      valid = starts(137, 80, 78, 71, 13, 10, 26, 10);
      break;
    case 'jpg':
    case 'jpeg':
      valid = starts(255, 216, 255);
      break;
    case 'gif':
      valid = /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6));
      break;
    case 'webp':
      valid =
        buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
      break;
    case 'pdf':
      valid = buffer.toString('ascii', 0, 5) === '%PDF-';
      break;
    case 'doc':
    case 'ppt':
    case 'xls':
      valid = starts(208, 207, 17, 224, 161, 177, 26, 225);
      break;
    case 'zip':
      valid = starts(80, 75, 3, 4) || starts(80, 75, 5, 6);
      break;
    case 'pptx':
    case 'docx':
    case 'xlsx': {
      const mainPart = {
        pptx: 'ppt/presentation.xml',
        docx: 'word/document.xml',
        xlsx: 'xl/workbook.xml',
      }[extension];
      try {
        const parts = unzipSync(buffer, {
          filter: (entry) => {
            if (entry.name !== '[Content_Types].xml' && entry.name !== mainPart) return false;
            if (entry.originalSize > 2 * 1024 * 1024) throw new Error('Office metadata too large');
            return true;
          },
        });
        valid = !!parts['[Content_Types].xml']?.length && !!parts[mainPart]?.length;
      } catch {
        valid = false;
      }
      break;
    }
    case 'txt':
    case 'md':
    case 'csv':
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        valid = !buffer.includes(0);
      } catch {
        valid = false;
      }
      break;
  }
  if (!valid)
    throw new DisError(400, 'Obsah súboru nezodpovedá jeho prípone alebo je súbor poškodený.');
  return extension;
}
