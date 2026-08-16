import { MongoClient } from 'mongodb';

declare global {
  var __jopMongoClientPromise: Promise<MongoClient> | undefined;
}

const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'jop';
const mongoUri = process.env.MONGODB_URI?.trim();

if (!mongoUri) {
  console.warn('MONGODB_URI is not set. Runtime APIs will fail until MongoDB is configured.');
}

function createMongoClient() {
  if (!mongoUri) {
    throw new Error('Missing MONGODB_URI environment variable.');
  }

  return new MongoClient(mongoUri);
}

export function getMongoClient() {
  if (!global.__jopMongoClientPromise) {
    global.__jopMongoClientPromise = createMongoClient().connect();
  }

  return global.__jopMongoClientPromise;
}

export async function getMongoDb() {
  const client = await getMongoClient();
  return client.db(databaseName);
}
