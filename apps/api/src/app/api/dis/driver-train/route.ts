import { requireDisProfile } from '@/lib/server/dis/appwrite';
import {
  finishDriverTrain,
  loadDriverDashboard,
  saveDriverTrain,
} from '@/lib/server/dis/driver-train';
import { disResponse } from '@/lib/server/dis/http';
import { sessionIdSchema } from '@/lib/station/domain';

export async function GET(request: Request) {
  return disResponse(async () =>
    loadDriverDashboard(
      sessionIdSchema.parse(new URL(request.url).searchParams.get('sessionId')),
      await requireDisProfile(request),
    ),
  );
}
export async function POST(request: Request) {
  return disResponse(async () =>
    saveDriverTrain(await request.json(), await requireDisProfile(request)),
  );
}
export async function DELETE(request: Request) {
  return disResponse(async () =>
    finishDriverTrain(
      sessionIdSchema.parse(new URL(request.url).searchParams.get('sessionId')),
      await requireDisProfile(request),
    ),
  );
}
