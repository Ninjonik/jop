import { ZodError, type ZodType } from 'zod';

export async function parseJsonRequest<T>(request: Request, schema: ZodType<T>) {
  const body = await request.json();
  return schema.parse(body);
}

export function jsonErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const status =
    message === 'Unauthorized Roblox request.'
      ? 401
      : message === 'Station not found.' ||
          message === 'Session not found.' ||
          message.includes('was not found') ||
          message.includes('No Roblox map template')
        ? 404
        : message.includes('already registered')
          ? 409
          : 500;

  return Response.json(
    {
      error: {
        code:
          status === 401
            ? 'UNAUTHORIZED'
            : status === 404
              ? 'NOT_FOUND'
              : status === 409
                ? 'CONFLICT'
                : 'INTERNAL_ERROR',
        message,
      },
    },
    { status },
  );
}
