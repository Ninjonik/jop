export type EddRecord = {
  $id: string;
  sessionId: string;
  stationId: string;
  trainNumber: string;
  trainType: string;
  direction: string;
  schedArrival: string;
  actualArrival: string;
  schedDeparture: string;
  actualDeparture: string;
  track: string;
  delayMinutes: number;
  status: 'scheduled' | 'approaching' | 'arrived' | 'departed' | 'passed' | 'cancelled';
};
export type DisDocument = {
  $id: string;
  $updatedAt: string;
  title: string;
  category: string;
  contentMarkdown: string;
  authorName: string;
  isPublished: boolean;
};
export type RadioMessage = {
  $id: string;
  $createdAt: string;
  sessionId: string;
  channel: string;
  senderName: string;
  senderRole: string;
  targetRecipient: string;
  content: string;
  isUrgentOrder: boolean;
};
