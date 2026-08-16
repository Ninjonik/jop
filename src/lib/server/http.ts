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
      { status: 400 }
    );
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const status = message === 'Station not found.' ? 404 : 500;

  return Response.json(
    {
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message,
      },
    },
    { status }
  );
}
