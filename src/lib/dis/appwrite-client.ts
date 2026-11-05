import { Account, Client, Databases, ID, Query, Realtime, Storage } from 'appwrite';

const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis';

export const appwriteClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);

export const account = new Account(appwriteClient);
export const databases = new Databases(appwriteClient);
export const storage = new Storage(appwriteClient);
export const realtime = new Realtime(appwriteClient);

export { ID, Query };

export const DIS_DB_ID = 'jop_dis';

export const COLLECTIONS = {
  PROFILES: 'profiles',
  SHIFTS: 'shifts',
  SHIFT_BOOKINGS: 'shift_bookings',
  DOCUMENTS: 'documents',
  TIMETABLES_GVD: 'timetables_gvd',
  EDD_RECORDS: 'edd_records',
  RADIO_MESSAGES: 'radio_messages',
} as const;

export type UserRole =
  | 'admin'
  | 'dispatcher_manager'
  | 'driver_manager'
  | 'dispatcher_instructor'
  | 'driver_instructor'
  | 'dispatcher'
  | 'driver'
  | 'dispatcher_trainee'
  | 'driver_trainee';

export type UserProfile = {
  $id?: string;
  userId: string;
  name: string;
  callsign: string;
  role: UserRole;
  trainingStage: 'cadet' | 'theory' | 'simulator' | 'exam' | 'certified';
  strikes: number;
  assignedInstructorId?: string;
  notes?: string;
  robloxUserId?: string;
  robloxUsername?: string;
  robloxRoleName?: string;
  robloxRank?: number;
};
