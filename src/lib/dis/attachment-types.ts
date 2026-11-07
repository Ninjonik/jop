export const attachmentMaxBytes = 10 * 1024 * 1024;
export const attachmentTypes = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  zip: 'application/zip',
} as const;
export type AttachmentExtension = keyof typeof attachmentTypes;
export const attachmentExtensions = Object.keys(attachmentTypes) as AttachmentExtension[];
export const attachmentAccept = attachmentExtensions.map((extension) => `.${extension}`).join(',');
export function attachmentExtension(name: string): AttachmentExtension | undefined {
  const extension = name.split('.').at(-1)?.toLowerCase();
  return extension && Object.hasOwn(attachmentTypes, extension)
    ? (extension as AttachmentExtension)
    : undefined;
}
