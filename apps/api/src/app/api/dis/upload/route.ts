import { attachmentMaxBytes, attachmentTypes } from '@/lib/dis/attachment-types';
import {
  bucketId,
  DisError,
  disStorage,
  managers,
  requireDisProfile,
} from '@/lib/server/dis/appwrite';
import { validateDocumentAttachment } from '@/lib/server/dis/document-attachments';
import { disResponse } from '@/lib/server/dis/http';
import { ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, managers);
    if (Number(request.headers.get('content-length')) > 11 * 1024 * 1024)
      throw new DisError(413, 'Príloha môže mať najviac 10 MB.');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new DisError(400, 'Vyberte súbor.');
    if (file.size > attachmentMaxBytes) throw new DisError(413, 'Príloha môže mať najviac 10 MB.');
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = validateDocumentAttachment(buffer, file.name);
    const fileName = file.name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(-180);
    const stored = await disStorage().createFile(
      bucketId,
      ID.unique(),
      InputFile.fromBuffer(buffer, fileName),
      [],
    );
    const url = `/api/dis/attachments/${stored.$id}`;
    const label = fileName.replace(/[\[\]\\\r\n]/g, '_');
    return {
      url,
      fileName,
      mimeType: attachmentTypes[extension],
      size: file.size,
      markdownSnippet: attachmentTypes[extension].startsWith('image/')
        ? `![${label}](${url})`
        : `[${label}](${url})`,
    };
  });
}
