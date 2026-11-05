import { Account, Databases, Storage } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { GET } from '../../../app/api/dis/attachments/[fileId]/route';
import { POST } from '../../../app/api/dis/upload/route';

const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=',
    'base64',
  ),
);
function authorize(context: TestContext, role = 'dispatcher_manager') {
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  context.mock.method(Account.prototype, 'get', async () => ({ $id: 'test-user' }));
  context.mock.method(Databases.prototype, 'getDocument', async () => ({
    userId: 'test-user',
    role,
  }));
}
function uploadRequest(bytes: Uint8Array, name = 'schema.png') {
  const form = new FormData();
  form.set('file', new File([Uint8Array.from(bytes).buffer], name));
  return new Request('http://localhost/api/dis/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer synthetic-test-token' },
    body: form,
  });
}
test('authenticated PNG upload returns a protected Markdown reference', async (context) => {
  authorize(context);
  const create = context.mock.method(Storage.prototype, 'createFile', async () => ({
    $id: 'test-file',
  }));
  const response = await POST(uploadRequest(png));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.url, '/api/dis/attachments/test-file');
  assert.equal(result.markdownSnippet, '![schema.png](/api/dis/attachments/test-file)');
  assert.equal(create.mock.callCount(), 1);
});
test('unsupported bytes and oversized attachments never reach Storage', async (context) => {
  authorize(context);
  const create = context.mock.method(Storage.prototype, 'createFile', async () => {
    throw new Error('Must not upload');
  });
  assert.equal((await POST(uploadRequest(new TextEncoder().encode('<svg></svg>')))).status, 400);
  const oversized = uploadRequest(png);
  oversized.headers.set('content-length', String(12 * 1024 * 1024));
  assert.equal((await POST(oversized)).status, 413);
  assert.equal(create.mock.callCount(), 0);
});
test('a driver cannot upload a document attachment', async (context) => {
  authorize(context, 'driver');
  assert.equal((await POST(uploadRequest(png))).status, 403);
});
test('download verifies the account and returns the stored bytes with private headers', async (context) => {
  authorize(context, 'driver');
  context.mock.method(Storage.prototype, 'getFile', async () => ({
    mimeType: 'image/png',
    name: 'schema.png',
  }));
  context.mock.method(Storage.prototype, 'getFileView', async () => png.buffer);
  const response = await GET(
    new Request('http://localhost/api/dis/attachments/test-file', {
      headers: { Authorization: 'Bearer synthetic-test-token' },
    }),
    { params: Promise.resolve({ fileId: 'test-file' }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
});
test('anonymous attachment download is denied before accessing Storage', async (context) => {
  const read = context.mock.method(Storage.prototype, 'getFile', async () => {
    throw new Error('Must not read');
  });
  assert.equal(
    (
      await GET(new Request('http://localhost/api/dis/attachments/test-file'), {
        params: Promise.resolve({ fileId: 'test-file' }),
      })
    ).status,
    401,
  );
  assert.equal(read.mock.callCount(), 0);
});
