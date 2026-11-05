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
    return new Response(contents, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
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
