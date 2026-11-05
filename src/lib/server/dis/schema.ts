import { AppwriteException, Client, Databases, Storage } from 'node-appwrite';
import { secureDisCollections, secureDisStorage } from './access-policy';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || 'jop_dis';
const BUCKET_ID = process.env.APPWRITE_STORAGE_BUCKET_ID || 'dis_storage';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);

const databases = new Databases(client);
const storage = new Storage(client);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDatabase() {
  console.log(`Checking database '${DB_ID}'...`);
  try {
    await databases.get(DB_ID);
    console.log(`Database '${DB_ID}' already exists.`);
  } catch (error) {
    if (!(error instanceof AppwriteException) || error.code !== 404) throw error;
    console.log(`Creating database '${DB_ID}'...`);
    await databases.create(DB_ID, 'JOP DIS & Intranet');
    console.log(`Database created.`);
  }
}

type AttributeIdentity = {
  databaseId: string;
  collectionId: string;
  key: string;
  required: boolean;
};

async function ensureAttribute(
  identity: AttributeIdentity,
  type: string,
  create: () => Promise<unknown>,
) {
  try {
    const existing = await databases.getAttribute(identity);
    if (existing.type !== type)
      throw new Error(
        `Attribute ${identity.collectionId}.${identity.key} has incompatible type ${existing.type}.`,
      );
    if (existing.status === 'failed' || existing.status === 'stuck')
      throw new Error(`Attribute ${identity.collectionId}.${identity.key} is ${existing.status}.`);
    return true;
  } catch (error) {
    if (!(error instanceof AppwriteException) || error.code !== 404) throw error;
    await create();
    return false;
  }
}
async function ensureStringAttribute(
  params: AttributeIdentity & { size: number; xdefault?: string },
) {
  await ensureAttribute(params, 'string', () => databases.createStringAttribute(params));
}
async function ensureIntegerAttribute(
  params: AttributeIdentity & { min?: number; max?: number; xdefault?: number },
) {
  if (await ensureAttribute(params, 'integer', () => databases.createIntegerAttribute(params))) {
    await databases.updateIntegerAttribute(params);
  }
}
async function ensureFloatAttribute(
  params: AttributeIdentity & { min?: number; max?: number; xdefault?: number },
) {
  if (await ensureAttribute(params, 'double', () => databases.createFloatAttribute(params))) {
    await databases.updateFloatAttribute(params);
  }
}
async function ensureBooleanAttribute(params: AttributeIdentity & { xdefault?: boolean }) {
  await ensureAttribute(params, 'boolean', () => databases.createBooleanAttribute(params));
}
async function ensureEnumAttribute(
  params: AttributeIdentity & { elements: string[]; xdefault?: string },
) {
  await ensureAttribute(params, 'string', () => databases.createEnumAttribute(params));
}
async function ensureCollection(id: string, name: string, attributesCreator: () => Promise<void>) {
  try {
    await databases.getCollection(DB_ID, id);
  } catch (error) {
    if (!(error instanceof AppwriteException) || error.code !== 404) throw error;
    await databases.createCollection(DB_ID, id, name, []);
  }
  // Existing installations also need missing attributes; never skip an entire collection.
  await attributesCreator();
  const deadline = Date.now() + 30000;
  while (true) {
    const collection = await databases.getCollection(DB_ID, id);
    const attributes = collection.attributes as { key: string; status: string }[];
    if (attributes.some((attribute) => ['failed', 'stuck'].includes(attribute.status)))
      throw new Error(`Collection ${id} contains a failed attribute.`);
    if (attributes.every((attribute) => attribute.status === 'available')) break;
    if (Date.now() >= deadline)
      throw new Error(
        `Attributes for ${id} are still processing. Run setup again after Appwrite finishes.`,
      );
    await sleep(250);
  }
  console.log(`Collection ${id} ready.`);
}

async function initStorageBucket() {
  console.log(`Checking storage bucket '${BUCKET_ID}'...`);
  try {
    await storage.getBucket(BUCKET_ID);
    console.log(`Storage bucket '${BUCKET_ID}' already exists.`);
  } catch (error) {
    if (!(error instanceof AppwriteException) || error.code !== 404) throw error;
    console.log(`Creating storage bucket '${BUCKET_ID}'...`);
    await storage.createBucket(
      BUCKET_ID,
      'DIS Attachments & Documents',
      [],
      false, // fileSecurity
      true, // enabled
      10 * 1024 * 1024,
      ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    );
    console.log(`Storage bucket created.`);
  }
}

export async function initializeDisAppwrite() {
  console.log('--- Initializing Appwrite Schema for JOP DIS ---');
  await initDatabase();

  // 1. PROFILES (Users, ZSSK Roles, Trainee status, Strikes)
  await ensureCollection('profiles', 'User Profiles', async () => {
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'userId',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'name',
      size: 128,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'callsign',
      size: 64,
      required: false,
      xdefault: 'ZSSK-001',
    });
    await ensureEnumAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'role',
      elements: [
        'admin',
        'dispatcher_manager',
        'driver_manager',
        'dispatcher_instructor',
        'driver_instructor',
        'dispatcher',
        'driver',
        'dispatcher_trainee',
        'driver_trainee',
      ],
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'trainingStage',
      size: 64,
      required: false,
      xdefault: 'certified',
    });
    await ensureIntegerAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'strikes',
      required: false,
      min: 0,
      max: 10,
      xdefault: 0,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'assignedInstructorId',
      size: 64,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'notes',
      size: 2000,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'robloxUserId',
      size: 64,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'robloxUsername',
      size: 128,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'robloxRoleName',
      size: 128,
      required: false,
    });
    await ensureIntegerAttribute({
      databaseId: DB_ID,
      collectionId: 'profiles',
      key: 'robloxRank',
      required: false,
      min: 0,
      max: 255,
      xdefault: 0,
    });
  });

  // 2. SHIFTS (2.5h shift sessions planned by managers)
  await ensureCollection('shifts', 'Shifts', async () => {
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'title',
      size: 128,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'date',
      size: 32,
      required: true,
    }); // YYYY-MM-DD
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'startTime',
      size: 16,
      required: true,
    }); // HH:mm
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'endTime',
      size: 16,
      required: true,
    }); // HH:mm
    await ensureFloatAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'durationHours',
      required: false,
      min: 0,
      xdefault: 2.5,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'sessionId',
      size: 64,
      required: false,
    }); // linked JOP session
    await ensureEnumAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'status',
      elements: ['draft', 'open', 'active', 'completed', 'cancelled'],
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shifts',
      key: 'notes',
      size: 1000,
      required: false,
    });
  });

  // 3. SHIFT BOOKINGS (Staff allocating to a station or train set)
  await ensureCollection('shift_bookings', 'Shift Bookings', async () => {
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shift_bookings',
      key: 'shiftId',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shift_bookings',
      key: 'userId',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shift_bookings',
      key: 'userName',
      size: 128,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shift_bookings',
      key: 'assignedRole',
      size: 64,
      required: true,
    }); // 'dispatcher' or 'driver'
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shift_bookings',
      key: 'assignedLocation',
      size: 64,
      required: false,
    }); // e.g. 'Malacky' or 'Turnus 1 (R 607/608)'
    await ensureEnumAttribute({
      databaseId: DB_ID,
      collectionId: 'shift_bookings',
      key: 'attendance',
      elements: ['registered', 'present', 'strike', 'excused'],
      required: false,
      xdefault: 'registered',
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'shift_bookings',
      key: 'strikeReason',
      size: 500,
      required: false,
    });
  });

  // 4. DOCUMENTS (Markdown regulations, SPP, Bulletins)
  await ensureCollection('documents', 'Documents & SPP', async () => {
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'documents',
      key: 'title',
      size: 256,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'documents',
      key: 'category',
      size: 64,
      required: true,
    }); // 'spp', 'predpisy', 'pomocky', 'rozkazy'
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'documents',
      key: 'targetRole',
      size: 64,
      required: false,
      xdefault: 'all',
    }); // 'all', 'dispatcher', 'driver'
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'documents',
      key: 'stationId',
      size: 64,
      required: false,
    }); // optional linked station
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'documents',
      key: 'contentMarkdown',
      size: 50000,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'documents',
      key: 'authorName',
      size: 128,
      required: true,
    });
    await ensureBooleanAttribute({
      databaseId: DB_ID,
      collectionId: 'documents',
      key: 'isPublished',
      required: true,
    });
  });

  // 5. TIMETABLES GVD (Train schedules, route stops, conflict check)
  await ensureCollection('timetables_gvd', 'GVD Timetables', async () => {
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'trainNumber',
      size: 32,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'trainType',
      size: 16,
      required: true,
    }); // 'R', 'Os', 'Pn', 'Mn'
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'routeTitle',
      size: 128,
      required: true,
    }); // 'Bratislava - Zilina'
    await ensureIntegerAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'maxSpeed',
      required: false,
      min: 1,
      max: 300,
      xdefault: 120,
    });
    await ensureIntegerAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'trainLength',
      required: false,
      min: 1,
      max: 1000,
      xdefault: 250,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'stopsJson',
      size: 20000,
      required: true,
    }); // Array of stops: [{station, arrival, departure, track, dwellMin}]
    await ensureBooleanAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'hasConflict',
      required: false,
      xdefault: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'timetables_gvd',
      key: 'conflictDetails',
      size: 1000,
      required: false,
    });
  });

  // 6. EDD LOGS (Electronic traffic diary entries per session)
  await ensureCollection('edd_records', 'EDD Records', async () => {
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'sessionId',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'stationId',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'trainNumber',
      size: 32,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'trainType',
      size: 16,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'direction',
      size: 128,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'schedArrival',
      size: 16,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'actualArrival',
      size: 16,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'schedDeparture',
      size: 16,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'actualDeparture',
      size: 16,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'track',
      size: 16,
      required: false,
    });
    await ensureIntegerAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'delayMinutes',
      required: false,
      min: 0,
      max: 1440,
      xdefault: 0,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'delayReason',
      size: 256,
      required: false,
    });
    await ensureEnumAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'status',
      elements: ['scheduled', 'approaching', 'arrived', 'departed', 'passed', 'cancelled'],
      required: false,
      xdefault: 'scheduled',
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'notes',
      size: 500,
      required: false,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'edd_records',
      key: 'reportedBy',
      size: 128,
      required: false,
    });
  });

  // 7. RADIO & TRS MESSAGES (Realtime channel for session staff)
  await ensureCollection('radio_messages', 'Radio Messages', async () => {
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'sessionId',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'channel',
      size: 64,
      required: true,
    }); // 'general', 'station_malacky', 'direct_r607'
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'senderId',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'senderName',
      size: 128,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'senderRole',
      size: 64,
      required: true,
    });
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'targetRecipient',
      size: 64,
      required: false,
    }); // specific train or station
    await ensureStringAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'content',
      size: 1000,
      required: true,
    });
    await ensureBooleanAttribute({
      databaseId: DB_ID,
      collectionId: 'radio_messages',
      key: 'isUrgentOrder',
      required: false,
      xdefault: false,
    });
  });

  await secureDisCollections(true);
  console.log('--- Appwrite DIS database schema and access policy ready. ---');
  await initStorageBucket();
  await secureDisStorage(true);
  console.log('--- Appwrite DIS schema, storage and access policy ready. ---');
}
