/** Isolated document/attachment integration check. Removes all test records. */
import { strToU8, zipSync } from 'fflate';
import { Client, Databases, Storage, Users } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { attachmentExtensions, attachmentMaxBytes } from '../src/lib/dis/attachment-types';

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1')
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis')
  .setKey(process.env.APPWRITE_API_KEY || '');
const storage = new Storage(client),
  users = new Users(client),
  database = new Databases(client);
const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'dis_storage';
const databaseId = process.env.APPWRITE_DATABASE_ID || 'jop_dis';
const base = process.env.DIS_TEST_BASE_URL || 'http://localhost:3000';
const userId = `docqa${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const fileIds: string[] = [];
let userCreated = false,
  profileCreated = false,
  documentId = '';
async function main() {
  try {
    const bucket = await storage.getBucket(bucketId);
    await storage.updateBucket({
      bucketId,
      name: bucket.name,
      maximumFileSize: attachmentMaxBytes,
      allowedFileExtensions: attachmentExtensions,
    });
    console.log('Attachment storage supports the expanded file list.');
    await users.create({
      userId,
      email: `${userId}@example.invalid`,
      password: randomUUID(),
      name: 'Document QA',
    });
    userCreated = true;
    await database.createDocument(databaseId, 'profiles', userId, {
      userId,
      name: 'Document QA',
      callsign: 'QA',
      role: 'dispatcher_manager',
      trainingStage: 'certified',
      strikes: 0,
    });
    profileCreated = true;
    const session = await users.createSession({ userId });
    const { jwt } = await users.createJWT({ userId, sessionId: session.$id });
    const headers = { Authorization: `Bearer ${jwt}` };
    const pptx = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'ppt/presentation.xml': strToU8(
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
      ),
      'ppt/_rels/presentation.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>',
      ),
      'ppt/slides/slide1.xml': strToU8(
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Test presentation</a:t></a:r></a:p></p:sld>',
      ),
    });
    const form = new FormData();
    form.set('file', new File([Uint8Array.from(pptx).buffer], 'Skolenie.pptx'));
    const response = await fetch(`${base}/api/dis/upload`, { method: 'POST', headers, body: form });
    const uploaded = await response.json();
    assert.equal(response.status, 200, JSON.stringify(uploaded));
    fileIds.push(uploaded.url.split('/').at(-1));
    const stored = await storage.getFile(bucketId, fileIds[0]);
    assert.equal(stored.name, 'Skolenie.pptx');
    const downloaded = await fetch(base + uploaded.url, { headers });
    assert.equal(downloaded.status, 200);
    assert.equal(
      downloaded.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), pptx);
    assert.equal((await fetch(base + uploaded.url)).status, 401);
    const saved = await fetch(`${base}/api/dis/documents`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Document QA',
        category: 'qa',
        contentMarkdown: `## Test\n\n${uploaded.markdownSnippet}`,
        isPublished: false,
      }),
    });
    const result = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(result));
    documentId = result.document.$id;
    const persisted = await database.getDocument(databaseId, 'documents', documentId);
    assert.match(persisted.contentMarkdown, /Skolenie\.pptx/);
    console.log(
      'Verified authenticated PPTX upload, exact download, original filename, anonymous denial, and persisted draft link.',
    );
  } finally {
    if (documentId) await database.deleteDocument(databaseId, 'documents', documentId);
    for (const fileId of fileIds) await storage.deleteFile(bucketId, fileId);
    if (profileCreated) await database.deleteDocument(databaseId, 'profiles', userId);
    if (userCreated) await users.delete({ userId });
    console.log('Isolated test files, document, profile and account cleaned up.');
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
