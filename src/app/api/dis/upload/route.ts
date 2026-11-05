import {
  bucketId,
  DisError,
  disStorage,
  managers,
  requireDisProfile,
} from '@/lib/server/dis/appwrite';
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
    if (file.size > 10 * 1024 * 1024) throw new DisError(413, 'Príloha môže mať najviac 10 MB.');
    const buffer = Buffer.from(await file.arrayBuffer());
    let extension: string;
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      extension = 'png';
    else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) extension = 'jpg';
    else if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
      extension = 'webp';
    else if (buffer.toString('ascii', 0, 5) === '%PDF-') extension = 'pdf';
    else throw new DisError(400, 'Podporované sú PNG, JPG, WebP a PDF.');
    const stored = await disStorage().createFile(
      bucketId,
      ID.unique(),
      InputFile.fromBuffer(buffer, `priloha.${extension}`),
      [],
    );
    const url = `/api/dis/attachments/${stored.$id}`;
    const label = file.name.replace(/[\[\]\\\r\n]/g, '_');
    return {
      url,
      fileName: file.name,
      markdownSnippet: extension === 'pdf' ? `[${label}](${url})` : `![${label}](${url})`,
    };
  });
}
