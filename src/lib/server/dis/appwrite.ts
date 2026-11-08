import type { UserProfile, UserRole } from '@/lib/dis/appwrite-client';
import { hasDisRole } from '@/lib/dis/permissions';
import {
  Account,
  AppwriteException,
  Client,
  Databases,
  Query,
  Storage,
  type Models,
} from 'node-appwrite';

export const databaseId = process.env.APPWRITE_DATABASE_ID || 'jop_dis';
function client() {
  return new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis');
}
export function disDatabase() {
  if (!process.env.APPWRITE_API_KEY) throw new Error('Chýba konfigurácia Appwrite API.');
  return new Databases(client().setKey(process.env.APPWRITE_API_KEY));
}
export class DisError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireDisProfile(
  request: Request,
  roles?: UserRole[],
): Promise<UserProfile> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new DisError(401, 'Prihláste sa do DIS.');
  let user;
  try {
    user = await new Account(client().setJWT(token)).get();
  } catch (error) {
    if (!(error instanceof AppwriteException) || error.code !== 401)
      throw new DisError(503, 'Overovanie účtov Appwrite je momentálne nedostupné.');
    throw new DisError(401, 'Prihlásenie vypršalo. Prihláste sa znova.');
  }
  let profile: UserProfile;
  try {
    profile = (await disDatabase().getDocument(
      databaseId,
      'profiles',
      user.$id,
    )) as unknown as UserProfile;
  } catch (error) {
    if (!(error instanceof AppwriteException) || error.code !== 404)
      throw new DisError(503, 'Profily Appwrite sú momentálne nedostupné.');
    throw new DisError(403, 'Používateľ nemá platný DIS profil.');
  }
  if (profile.userId !== user.$id || (roles && !hasDisRole(profile.role, roles)))
    throw new DisError(403, 'Na túto operáciu nemáte oprávnenie.');
  return profile;
}
export const dispatchers: UserRole[] = [
  'dispatcher_manager',
  'dispatcher_instructor',
  'dispatcher',
  'dispatcher_trainee',
];
export const managers: UserRole[] = [
  'dispatcher_manager',
  'driver_manager',
  'dispatcher_instructor',
  'driver_instructor',
];

export async function listDocuments<T extends Models.Document>(
  collection: string,
  queries: string[] = [],
): Promise<T[]> {
  const documents: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await disDatabase().listDocuments<T>(databaseId, collection, [
      ...queries,
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]);
    documents.push(...page.documents);
    cursor = page.documents.length === 100 ? page.documents.at(-1)!.$id : undefined;
  } while (cursor);
  return documents;
}

export function disStorage() {
  if (!process.env.APPWRITE_API_KEY) throw new Error('Chýba konfigurácia Appwrite API.');
  return new Storage(client().setKey(process.env.APPWRITE_API_KEY));
}
export const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'dis_storage';
