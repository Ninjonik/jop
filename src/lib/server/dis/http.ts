import { NextResponse } from 'next/server';
import { AppwriteException } from 'node-appwrite';
import { ZodError } from 'zod';
import { DisError } from './appwrite';

export async function disResponse(operation: () => Promise<unknown>) {
  try {
    return NextResponse.json(await operation(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DisError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError || error instanceof SyntaxError)
      return NextResponse.json(
        { error: error instanceof ZodError ? error.issues[0]?.message : 'Neplatný JSON.' },
        { status: 400 },
      );
    if (error instanceof AppwriteException && [400, 404, 409].includes(error.code))
      return NextResponse.json({ error: error.message }, { status: error.code });
    console.error('DIS operation failed:', error);
    return NextResponse.json(
      { error: 'Operáciu sa nepodarilo dokončiť. Skúste ju zopakovať.' },
      { status: 500 },
    );
  }
}
