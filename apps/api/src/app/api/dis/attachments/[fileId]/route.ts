import { attachmentExtension, attachmentTypes } from '@/lib/dis/attachment-types';
import { bucketId, DisError, disStorage, requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  try {
    await requireDisProfile(request);
    const { fileId } = await context.params;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(fileId))
      throw new DisError(400, 'Neplatná príloha.');
    const storage = disStorage();
    const file = await storage.getFile(bucketId, fileId);
    const contents = await storage.getFileView(bucketId, fileId);
    const extension = attachmentExtension(file.name);
    const mimeType = extension ? attachmentTypes[extension] : 'application/octet-stream';
    const inline =
      mimeType.startsWith('image/') ||
      extension === 'pdf' ||
      ['txt', 'md', 'csv'].includes(extension || '');
    return new Response(contents, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (character) => '%' + character.charCodeAt(0).toString(16))}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return disResponse(async () => {
      throw error;
    });
  }
}
