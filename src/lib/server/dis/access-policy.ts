import { Client, Databases, Storage } from 'node-appwrite';

function serverClient() {
  return new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis')
    .setKey(process.env.APPWRITE_API_KEY || '');
}

export async function secureDisCollections(apply = false) {
  const db = new Databases(serverClient());
  const databaseId = process.env.APPWRITE_DATABASE_ID || 'jop_dis';
  const ids = [
    'profiles',
    'shifts',
    'shift_bookings',
    'documents',
    'timetables_gvd',
    'edd_records',
    'radio_messages',
  ];
  const collections = await Promise.all(ids.map((id) => db.getCollection(databaseId, id)));
  // Inspect all collections before changing their policy.
  for (const id of ids) {
    const collection = collections.find((collection) => collection.$id === id)!;
    if (apply)
      await db.updateCollection({
        databaseId,
        collectionId: id,
        name: collection.name,
        permissions: [],
        documentSecurity: false,
      });
    console.log(`${apply ? 'Secured' : 'Would secure'} collection ${id}`);
  }
}

export async function secureDisStorage(apply = false) {
  const storage = new Storage(serverClient());
  const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'dis_storage';
  const bucket = await storage.getBucket(bucketId);

  if (apply)
    await storage.updateBucket({
      bucketId,
      name: bucket.name,
      permissions: [],
      fileSecurity: false,
    });
  console.log(`${apply ? 'Secured' : 'Would secure'} attachment bucket ${bucketId}`);
}

export async function secureDisAppwrite(apply = false) {
  await secureDisCollections(apply);
  await secureDisStorage(apply);
  if (!apply) console.log('Dry run. Deploy the DIS routes first, then run with --apply.');
}
