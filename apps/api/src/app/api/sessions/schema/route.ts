import { sessionSchemaDocumentSchema, type SessionSchemaDocument } from '@/lib/station/domain';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const schema = (await parseJsonRequest(
      request,
      sessionSchemaDocumentSchema,
    )) as SessionSchemaDocument;
    const session = await stationService.importSessionSchema(schema);
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
